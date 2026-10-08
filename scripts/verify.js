import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {verifyArchive} from '../lib/archive.js';
import {verifyCommitments,matchDisclosures} from '../lib/commitments.js';
const [recordsPath='data/records.json',keyPath='trust/public-key.txt',rootPath='trust/freetsa-root.pem']=process.argv.slice(2);
const config=JSON.parse(readFileSync('config.json','utf8'));
const result=await verifyArchive(JSON.parse(readFileSync(recordsPath,'utf8')),{config,key:readFileSync(keyPath,'utf8').trim(),root:readFileSync(rootPath,'utf8')});
if(recordsPath==='data/records.json'){
 const commitments=JSON.parse(readFileSync('data/commitments.json','utf8'));
 console.log(JSON.stringify(await verifyCommitments(commitments,{config,key:readFileSync(keyPath,'utf8').trim(),root:readFileSync(rootPath,'utf8')})));
 matchDisclosures(JSON.parse(readFileSync(recordsPath,'utf8')),commitments);
 const manifest=JSON.parse(readFileSync('data/manifest.json','utf8'));
 assert.equal(result.verified_records,manifest.published_seq);assert.equal(result.chain_hash,manifest.chain_hash);
}
console.log(JSON.stringify(result,null,2));
