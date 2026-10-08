import assert from './check.js';
import {validateHourly,HOUR} from './hourly.js';
import {canonical,digest,verifyReceipt,from64,hex} from './protocol.js';
import {verifyTimestamp} from './tsa.js';
import {validateReplaySignal,validateSupplementSignal,bindSupplement} from './replay-schema.js';
export const ZERO='0'.repeat(64);
const SIGNAL_KEYS=['schema_version','strategy','version','deployment_id','symbol','timeframe','signal_time','action','target_position','target_exposure','disclosure_nonce'].sort();
const RECORD_KEYS=['domain','stream_id','deployment_id','seq','received_at','payload_hash','previous_hash','key_id'].sort();
export async function verifyTrust(config,key,root){
 assert.equal(hex(await crypto.subtle.digest('SHA-256',from64(key))),config.public_key_spki_sha256,'Public key pin mismatch');
 // Published root file hash includes its terminating newline.
 assert.equal(await digest(root),config.tsa_root_file_sha256,'TSA root pin mismatch');
}
export async function verifyRecord(receipt,seq,previous,trust,now=Date.now()){
 const {config,key,root}=trust;
 assert.deepEqual(Object.keys(receipt).sort(),['chain_hash','record','release_at','signal','signature','tsa'].sort(),'Unexpected receipt fields');
 if(receipt.signal?.schema_version==='5')validateHourly(receipt.signal);
 else if(receipt.signal?.schema_version==='4')validateSupplementSignal(receipt.signal);
 else if(receipt.signal?.schema_version==='3')validateReplaySignal(receipt.signal);
 else assert.deepEqual(Object.keys(receipt.signal).sort(),SIGNAL_KEYS,'Unexpected signal fields');
 assert.deepEqual(Object.keys(receipt.record).sort(),RECORD_KEYS,'Unexpected record fields');
 assert.deepEqual(Object.keys(receipt.tsa).sort(),['status','provider','query_b64','response_b64','crl_b64','gen_time','policy','serial','revocation_status'].sort(),'Unexpected TSA fields');
 assert.equal(receipt.record.seq,seq,'Missing or reordered record');
 assert.equal(receipt.record.previous_hash,previous,'Broken chain');
 assert.equal(receipt.record.domain,receipt.signal.schema_version==='5'?'signal-proof-hourly-v1':'signal-proof-v1');
 assert.equal(receipt.record.stream_id,config.stream_id,'Synthetic or other stream');
 assert.equal(receipt.record.deployment_id,config.deployment_id);
 assert.equal(receipt.signal.deployment_id,config.deployment_id);
 assert.equal(receipt.record.key_id,config.key_id);
 assert.equal(receipt.signal.strategy,'signal'); assert.equal(receipt.signal.version,'1');
 assert.ok(['2','3','4','5'].includes(receipt.signal.schema_version));assert.match(receipt.signal.disclosure_nonce,/^[0-9a-f]{64}$/);
 assert.match(receipt.signal.symbol,/^[A-Z0-9:._/-]{1,80}$/,'Invalid symbol');
 assert.match(receipt.signal.timeframe,/^[0-9A-Z]{1,12}$/,'Invalid timeframe');
 const received=Date.parse(receipt.record.received_at);
 assert.ok(Number.isFinite(received));
 if(receipt.signal.schema_version==='5')assert.equal(received,receipt.signal.time_bucket_start+HOUR,'Hourly boundary mismatch');
 else assert.ok(Number.isSafeInteger(receipt.signal.signal_time)&&receipt.signal.signal_time>=received-900000&&receipt.signal.signal_time<=received+300000,'Signal time outside policy');
 if(receipt.signal.schema_version==='2'){
  assert.ok(['buy','sell'].includes(receipt.signal.action)&&['long','short','flat'].includes(receipt.signal.target_position));
  assert.match(receipt.signal.target_exposure,/^\d{1,16}(\.\d{1,12})?$/);
  assert.ok(Number(receipt.signal.target_exposure)<=32&&(receipt.signal.target_position==='flat')===(Number(receipt.signal.target_exposure)===0),'Invalid exposure');
 }else if(receipt.signal.kind==='fill')assert.ok(receipt.signal.fill_time>=received-900000&&receipt.signal.fill_time<=received+300000,'Fill time outside receipt policy');
 const release=received+config.publication_delay_ms;
 assert.equal(receipt.release_at,new Date(release).toISOString(),'Release policy mismatch');
 assert.ok(now>=release,'Record is not yet public');
 assert.equal(await verifyReceipt(receipt,key),true,'Invalid Ed25519 receipt');
 assert.equal(receipt.tsa.status,'verified','TSA pending');
 assert.equal(receipt.tsa.provider,'FreeTSA');
 const tsa=await verifyTimestamp(from64(receipt.tsa.response_b64).buffer,from64(receipt.tsa.query_b64).buffer,root,canonical(receipt.record),from64(receipt.tsa.crl_b64).buffer);
 assert.ok(Date.parse(tsa.gen_time)>=received-300000&&Date.parse(tsa.gen_time)<=now+300000,'TSA time outside policy');
 for(const field of ['gen_time','policy','serial','revocation_status']) assert.equal(receipt.tsa[field],tsa[field],'TSA metadata mismatch');
 return receipt.chain_hash;
}
export async function verifyArchive(records,trust,now=Date.now()){
 assert.ok(Array.isArray(records));
 await verifyTrust(trust.config,trust.key,trust.root);
 let previous=ZERO;
 const supplements=new Set();
 for(let i=0;i<records.length;i++){
  previous=await verifyRecord(records[i],i+1,previous,trust,now);
  if(records[i].signal.schema_version==='4'){
   const s=records[i].signal;assert.ok(s.source_seq<i+1,'Supplement must reference a prior proof');
   const identity=s.source_seq+':'+s.accounting.kind;assert.ok(!supplements.has(identity),'Duplicate accounting supplement');supplements.add(identity);
   bindSupplement(s,records[s.source_seq-1]);
  }
 }
 return {verified_records:records.length,chain_hash:previous,revocation_status:records.length?'crl_checked_at_issuance':'no_records'};
}
export async function collectReleased(existing,trust,fetchJson,now=Date.now()){
 const verified=await verifyArchive(existing,trust,now);
 const head=await fetchJson('/head');
 assert.ok(Number.isSafeInteger(head.seq)&&head.seq>=existing.length,'Source head moved backwards');
 assert.match(head.chain_hash,/^[0-9a-f]{64}$/);
 const result=[...existing]; let previous=verified.chain_hash;
 if(head.seq===existing.length) assert.equal(head.chain_hash,previous,'Source changed archived head');
 // Recheck the immutable signed part of the last published record.
 if(existing.length){const live=await fetchJson('/records/'+existing.length);assert.equal(canonical(live),canonical(existing.at(-1)),'Source rewrote archived record');}
 const limit=Math.min(head.seq,existing.length+100);
 for(let seq=existing.length+1;seq<=limit;seq++){
   const receipt=await fetchJson('/records/'+seq);
   if(receipt.tsa?.status==='pending') break; // Do not skip a hole; retry next run.
   previous=await verifyRecord(receipt,seq,previous,trust,now);
   if(receipt.signal.schema_version==='4'){
    const s=receipt.signal;assert.ok(s.source_seq<seq,'Supplement must reference a prior proof');
    assert.ok(!result.some(r=>r.signal.schema_version==='4'&&r.signal.source_seq===s.source_seq&&r.signal.accounting.kind===s.accounting.kind),'Duplicate accounting supplement');
    bindSupplement(s,result[s.source_seq-1]);
   }
   result.push(receipt);
 }
 if(result.length===head.seq) assert.equal(previous,head.chain_hash,'Source head mismatch');
 return {records:result,manifest:{schema_version:1,published_seq:result.length,chain_hash:previous,last_checked_utc_date:new Date(now).toISOString().slice(0,10)}};
}
