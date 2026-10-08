import * as asn1 from 'asn1js';
import * as pki from 'pkijs';
import {hex,from64,encoder} from './protocol.js';
const SHA256 = '2.16.840.1.101.3.4.2.1';
const TST = '1.2.840.113549.1.9.16.1.4';
function parse(bytes) {
  const result = asn1.fromBER(bytes);
  if (result.offset === -1 || result.offset !== bytes.byteLength) throw new Error('invalid ASN.1');
  return result.result;
}
function cert(pem) {
  return new pki.Certificate({schema: parse(from64(pem.replace(/-----[^-]+-----|\s/g, '')).buffer)});
}
export async function verifyTimestamp(responseBytes, requestBytes, rootPem, preimage, crlBytes) {
  pki.setEngine('verifier', crypto, new pki.CryptoEngine({name: 'verifier', crypto, subtle: crypto.subtle}));
  const request = new pki.TimeStampReq({schema: parse(requestBytes)});
  const response = new pki.TimeStampResp({schema: parse(responseBytes)});
  if (![0, 1].includes(response.status.status) || !response.timeStampToken) throw new Error('TSA rejected');
  if (response.timeStampToken.contentType !== '1.2.840.113549.1.7.2') throw new Error('wrong CMS type');
  const signed = new pki.SignedData({schema: response.timeStampToken.content});
  if (signed.encapContentInfo.eContentType !== TST || !signed.encapContentInfo.eContent) throw new Error('wrong timestamp content');
  const info = new pki.TSTInfo({schema: parse(signed.encapContentInfo.eContent.getValue())});
  const expected = hex(await crypto.subtle.digest('SHA-256', encoder.encode(preimage)));
  if (request.messageImprint.hashAlgorithm.algorithmId !== SHA256 ||
      hex(info.messageImprint.hashedMessage.getValue()) !== expected ||
      hex(request.messageImprint.hashedMessage.getValue()) !== expected) throw new Error('TSA imprint mismatch');
  if (info.messageImprint.hashAlgorithm.algorithmId !== SHA256 ||
      hex(info.messageImprint.hashedMessage.getValue()) !== hex(request.messageImprint.hashedMessage.getValue()) ||
      !info.nonce || hex(info.nonce.valueBlock.valueHexView) !== hex(request.nonce.valueBlock.valueHexView)) throw new Error('TSA request mismatch');
  // Locate the CMS signer and require the critical, exclusive timestamping EKU.
  const sid = signed.signerInfos[0]?.sid;
  const signer = signed.certificates?.find(c => c instanceof pki.Certificate && sid instanceof pki.IssuerAndSerialNumber && c.issuer.isEqual(sid.issuer) && c.serialNumber.isEqual(sid.serialNumber));
  const eku = signer?.extensions?.find(e => e.extnID === '2.5.29.37');
  if (!eku?.critical || eku.parsedValue?.keyPurposes?.length !== 1 || eku.parsedValue.keyPurposes[0] !== '1.3.6.1.5.5.7.3.8') throw new Error('invalid TSA EKU');
  const root = cert(rootPem);
  const attr = signed.signerInfos[0].signedAttrs?.attributes.find(a => a.type === '1.2.840.113549.1.9.3');
  if (!attr || attr.values.length !== 1 || attr.values[0].valueBlock.toString() !== TST) throw new Error('wrong signed content type');
  const ok = await signed.verify({signer: 0, checkChain: true, trustedCerts: [root], checkDate: info.genTime, data: encoder.encode(preimage).buffer});
  if (!ok) throw new Error('TSA signature or chain invalid');
  let revocation_status='not_checked';
  if(crlBytes){
    const crl=new pki.CertificateRevocationList({schema:parse(crlBytes)});
    if(!signer.issuer.isEqual(root.subject)||!crl.issuer.isEqual(root.subject)||!await crl.verify({issuerCertificate:root}))throw new Error('Invalid CRL issuer or signature');
    if(crl.thisUpdate.value>info.genTime||!crl.nextUpdate||crl.nextUpdate.value<info.genTime)throw new Error('CRL does not cover timestamp issuance');
    if(crl.revokedCertificates?.some(entry=>entry.userCertificate.isEqual(signer.serialNumber)))throw new Error('TSA certificate revoked');
    revocation_status='crl_checked_at_issuance';
  }
  return {gen_time: info.genTime.toISOString(), policy: info.policy, serial: hex(info.serialNumber.valueBlock.valueHexView), revocation_status};
}
