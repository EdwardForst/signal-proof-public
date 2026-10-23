import {rmSync,mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
rmSync('dist',{recursive:true,force:true});
// Publish only the listed verification files.
mkdirSync('dist/trust',{recursive:true});mkdirSync('dist/data/records',{recursive:true});
for(const [src,dst] of [['site/index.html','dist/index.html'],['site/styles.css','dist/styles.css'],['README.md','dist/README.md'],['config.json','dist/config.json'],['trust/public-key.txt','dist/trust/public-key.txt'],['trust/freetsa-root.pem','dist/trust/freetsa-root.pem'],['data/records.json','dist/data/records.json'],['data/manifest.json','dist/data/manifest.json']])copyFileSync(src,dst);
await build({entryPoints:['site/app.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/app.js',minifySyntax:true,minifyWhitespace:true,minifyIdentifiers:false});
const records=JSON.parse(readFileSync('data/records.json','utf8'));
for(const receipt of records){
 const base='dist/data/records/'+receipt.record.seq;
 writeFileSync(base+'.json',JSON.stringify(receipt,null,2)+'\n');
 writeFileSync(base+'.tsq',Buffer.from(receipt.tsa.query_b64,'base64'));
 writeFileSync(base+'.tsr',Buffer.from(receipt.tsa.response_b64,'base64'));
}
console.log('Built public site with '+records.length+' released records.');
copyFileSync('data/commitments.json','dist/data/commitments.json');
