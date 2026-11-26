import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {collectReleased} from '../lib/archive.js';
import {collectCommitments,matchDisclosures} from '../lib/commitments.js';
import {sourceClient,actionMask} from './source.js';
const config=JSON.parse(readFileSync('config.json','utf8'));
const fetchJson=sourceClient(process.env.SOURCE_URL,{mask:actionMask});
const trust={config,key:readFileSync('trust/public-key.txt','utf8').trim(),root:readFileSync('trust/freetsa-root.pem','utf8')};
const existing=JSON.parse(readFileSync('data/records.json','utf8'));
const commitments=await collectCommitments(JSON.parse(readFileSync('data/commitments.json','utf8')),trust,fetchJson);
writeFileSync('data/commitments.json.tmp',JSON.stringify(commitments,null,2)+'\n');renameSync('data/commitments.json.tmp','data/commitments.json');
const result=await collectReleased(existing,trust,fetchJson);
matchDisclosures(result.records,commitments);
const syncedAt=new Date().toISOString();
const manifest={...result.manifest,last_checked_utc_date:syncedAt.slice(0,10),last_successful_sync_at:syncedAt};
for(const [path,value] of [['data/records.json',result.records],['data/manifest.json',manifest]]){
 writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n'); renameSync(path+'.tmp',path);
}
console.log(JSON.stringify({archived_records:result.records.length,new_records:result.records.length-existing.length}));
