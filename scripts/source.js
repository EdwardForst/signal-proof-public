export function sourceClient(value,{fetcher=fetch,attempts=6,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),mask=()=>{}}={}){
 let base;
 try{base=new URL(value);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error();}catch{throw Error('Archive source configuration invalid');}
 mask(base.href);mask(base.origin);mask(base.hostname);
 const root=base.href.replace(/\/$/,'');
 return async path=>{
  if(!/^\/(?:head|records\/\d+|commitments\/(?:head|\d+))$/.test(path))throw Error('Archive path invalid');
  for(let attempt=0;attempt<attempts;attempt++){
   try{
    const response=await fetcher(root+path,{redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error();
    return await response.json();
   }catch{
    if(attempt===attempts-1)throw Error('Archive download failed');
    await sleep(5000);
   }
  }
 };
}
export function actionMask(value){
 if(process.env.GITHUB_ACTIONS==='true')console.log('::add-mask::'+value.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));
}
