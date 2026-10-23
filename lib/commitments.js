import assert from './check.js';
import {canonical,digest,from64,unhex} from './protocol.js';
import {verifyTimestamp} from './tsa.js';
import {verifyTrust,ZERO} from './archive.js';
export function sameCommitment(a,b){return canonical({record:a.record,chain_hash:a.chain_hash,signature:a.signature})===canonical({record:b.record,chain_hash:b.chain_hash,signature:b.signature});}
export async function verifyCommitments(items,trust,now=Date.now()){
 assert.ok(Array.isArray(items));await verifyTrust(trust.config,trust.key,trust.root);let previous=ZERO;
 const key=await crypto.subtle.importKey('spki',from64(trust.key),'Ed25519',false,['verify']);
 let verifiedTsa=0;
 for(let i=0;i<items.length;i++){
  const c=items[i],r=c.record;
  assert.deepEqual(Object.keys(c).sort(),['record','chain_hash','signature','tsa'].sort(),'Unexpected commitment fields');
  assert.deepEqual(Object.keys(r).sort(),['domain','stream_id','deployment_id','seq','received_at','payload_hash','previous_hash','key_id'].sort());
  assert.equal(r.seq,i+1);assert.equal(r.previous_hash,previous);assert.equal(r.domain,'signal-proof-event-v1');
  assert.ok(Date.parse(r.received_at)%3600000===0,'Invalid hourly boundary');
  assert.equal(r.stream_id,trust.config.stream_id);assert.equal(r.deployment_id,trust.config.deployment_id);assert.equal(r.key_id,trust.config.key_id);
  assert.match(r.payload_hash,/^[0-9a-f]{64}$/);assert.match(c.chain_hash,/^[0-9a-f]{64}$/);
  const received=Date.parse(r.received_at);assert.ok(Number.isFinite(received)&&received<=now+300000);
  assert.equal(await digest(canonical(r)),c.chain_hash);
  assert.ok(await crypto.subtle.verify('Ed25519',key,from64(c.signature),unhex(c.chain_hash)),'Invalid commitment signature');
  if(c.tsa.status==='verified'){
   assert.deepEqual(Object.keys(c.tsa).sort(),['status','provider','query_b64','response_b64','crl_b64','gen_time','policy','serial','revocation_status'].sort());
   assert.equal(c.tsa.provider,'FreeTSA');
   const tsa=await verifyTimestamp(from64(c.tsa.response_b64).buffer,from64(c.tsa.query_b64).buffer,trust.root,canonical(r),from64(c.tsa.crl_b64).buffer);
   for(const f of ['gen_time','policy','serial','revocation_status'])assert.equal(c.tsa[f],tsa[f]);
   const time=Date.parse(tsa.gen_time);assert.ok(time>=received-300000&&time<=now+300000);
   verifiedTsa++;
  }else{
   assert.equal(c.tsa.status,'pending');assert.ok(Object.keys(c.tsa).every(k=>['status','attempts','last_failure_at'].includes(k)));
   assert.ok(Number.isSafeInteger(c.tsa.attempts)&&c.tsa.attempts>=0);
   if(c.tsa.last_failure_at)assert.ok(Number.isFinite(Date.parse(c.tsa.last_failure_at)));
  }
  previous=c.chain_hash;
 }
 return {commitments:items.length,chain_hash:previous,verified_tsa:verifiedTsa,pending_tsa:items.length-verifiedTsa};
}
export async function collectCommitments(existing,trust,fetchJson){
 await verifyCommitments(existing,trust);const head=await fetchJson('/commitments/head');
 assert.ok(Number.isSafeInteger(head.seq)&&head.seq>=existing.length,'Commitment head regressed');assert.match(head.chain_hash,/^[0-9a-f]{64}$/);
 const result=[...existing];
 if(head.seq===existing.length)assert.equal(head.chain_hash,existing.at(-1)?.chain_hash||ZERO);
 const refresh=new Set(result.map((c,i)=>c.tsa.status==='pending'?i:-1).filter(i=>i>=0).slice(0,100));
 if(result.length)refresh.add(result.length-1);
 for(const i of refresh){const fresh=await fetchJson('/commitments/'+(i+1));assert.ok(sameCommitment(fresh,result[i]),'Source rewrote commitment');if(result[i].tsa.status==='verified')assert.equal(canonical(fresh),canonical(result[i]));result[i]=fresh;}
 for(let seq=result.length+1;seq<=Math.min(head.seq,existing.length+100);seq++)result.push(await fetchJson('/commitments/'+seq));
 const verified=await verifyCommitments(result,trust);if(result.length===head.seq)assert.equal(verified.chain_hash,head.chain_hash);
 return result;
}
export function matchDisclosures(records,commitments){
 for(let i=0;i<records.length;i++){assert.ok(commitments[i]&&sameCommitment(records[i],commitments[i]),'Disclosure does not match prior commitment');assert.equal(canonical(records[i].tsa),canonical(commitments[i].tsa));}
}
