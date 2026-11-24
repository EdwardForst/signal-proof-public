// Public signals contain no source timestamp, source identifier, price or account position.
export const HOUR=3600000;
export const DELAY=168*HOUR;
export function quantity(value,signed=false){
 if(typeof value!=='string'||!(signed?/^-?\d{1,20}(\.\d{1,12})?$/:/^\d{1,20}(\.\d{1,12})?$/).test(value))throw Error('Invalid quantity');
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
 const result=whole.replace(/^0+(?=\d)/,'')+(fraction.replace(/0+$/,'')?'.'+fraction.replace(/0+$/,''):'');
 return negative&&result!=='0'?'-'+result:result;
}
export function validateHourly(s,disclosed=true){
 const keys=['schema_version','event_type','deployment_id','symbol','timeframe','time_bucket_start','action','quantity',...(disclosed?['disclosure_nonce']:[])].sort();
 if(!s||JSON.stringify(Object.keys(s).sort())!==JSON.stringify(keys)||s.schema_version!=='6'||s.event_type!=='signal'||s.timeframe!=='60')throw Error('Invalid hourly signal');
 if(typeof s.deployment_id!=='string'||!s.deployment_id||s.symbol!=='BTC-USDT-PERP')throw Error('Invalid hourly identity');
 if(!Number.isSafeInteger(s.time_bucket_start)||s.time_bucket_start<=0||s.time_bucket_start%HOUR!==0||!['buy','sell'].includes(s.action)||quantity(s.quantity)!==s.quantity||Number(s.quantity)<=0)throw Error('Invalid hourly facts');
 if(disclosed&&!/^[0-9a-f]{64}$/.test(s.disclosure_nonce))throw Error('Invalid disclosure nonce');
 return s;
}
