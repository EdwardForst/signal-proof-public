import {verifyArchive} from '../lib/archive.js';
import {verifyCommitments,matchDisclosures} from '../lib/commitments.js';
const el=id=>document.getElementById(id),state=el('verification-status');
async function load(path,json=true){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('Download failed');return json?r.json():r.text();}
const date=value=>new Date(value).toISOString().replace('T',' ').replace('.000Z',' UTC');
try{
 const [config,key,root,records,manifest,commitments]=await Promise.all([load('config.json'),load('trust/public-key.txt',false),load('trust/freetsa-root.pem',false),load('data/records.json'),load('data/manifest.json'),load('data/commitments.json')]);
 const trust={config,key:key.trim(),root};
 el('count').textContent=records.length;el('commitment-count').textContent=commitments.length;
 el('updated').textContent=manifest.last_checked_utc_date||'Not synced';el('fingerprint').textContent=config.public_key_spki_sha256;el('empty').hidden=records.length!==0;
 for(const r of [...records].reverse()){
  const s=r.signal,tr=document.createElement('tr'),time=date(s.time_bucket_start)+' – '+date(s.time_bucket_start+3600000);
  for(const value of [r.record.seq,time,s.action,s.quantity]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  const td=document.createElement('td');for(const ext of ['json','tsq','tsr']){const a=document.createElement('a');a.href='data/records/'+r.record.seq+'.'+ext;a.download='signal-'+r.record.seq+'.'+ext;a.textContent=ext.toUpperCase();td.append(a);}tr.append(td);el('records').append(tr);
 }
 state.textContent='Ready to verify.';el('verify').disabled=false;
 el('verify').addEventListener('click',async()=>{
  el('verify').disabled=true;state.className='';state.textContent='Verifying locally…';
  try{
   const result=await verifyArchive(records,trust),committed=await verifyCommitments(commitments,trust);matchDisclosures(records,commitments);
   if(result.verified_records!==manifest.published_seq||result.chain_hash!==manifest.chain_hash)throw Error('Checkpoint mismatch');
   state.className='success';state.textContent='Verified '+result.verified_records+' disclosed records and '+committed.commitments+' commitments. TSA pending: '+committed.pending_tsa+'.';
  }catch(error){state.className='error';state.textContent='Verification failed: '+error.message;}finally{el('verify').disabled=false;}
 });
}catch{state.className='error';state.textContent='Loading failed.';}
