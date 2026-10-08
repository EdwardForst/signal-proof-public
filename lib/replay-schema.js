// Public accounting facts only. Keep strategy identifiers and settings private.
export const SCALE = 1000000000000n;
export const COMMON_KEYS = ['schema_version','strategy','version','deployment_id','symbol','timeframe','signal_time','kind','account_epoch'];
export const FILL_KEYS = [...COMMON_KEYS,'action','target_position','target_price','fill_quantity','position_before','target_quantity','fill_time','execution_id'];
export const START_KEYS = [...COMMON_KEYS,'initial_capital','starting_equity','starting_quantity','target_price','commission_rate','settings_commitment'];
export const MARK_KEYS = [...COMMON_KEYS,'target_price','target_quantity','equity','fill_count'];
export function decimal(value, signed=false) {
  if (typeof value !== 'string' || !(signed ? /^-?\d{1,20}(\.\d{1,12})?$/ : /^\d{1,20}(\.\d{1,12})?$/).test(value)) throw Error('Invalid decimal');
  const negative = value.startsWith('-');
  const [whole,fraction=''] = (negative ? value.slice(1) : value).split('.');
  const integer = whole.replace(/^0+(?=\d)/,'');
  const tail = fraction.replace(/0+$/,'');
  const zero = integer === '0' && !tail;
  return (negative && !zero ? '-' : '') + integer + (tail ? '.'+tail : '');
}
export function units(value) {
  const normalized=decimal(value,true);const negative=normalized.startsWith('-');
  const [whole,tail='']=(negative?normalized.slice(1):normalized).split('.');
  return (BigInt(whole)*SCALE+BigInt(tail.padEnd(12,'0')))*(negative?-1n:1n);
}
export function direction(quantity) {const q=units(quantity);return q>0n?'long':q<0n?'short':'flat';}
export function validateReplaySignal(signal, disclosed=true) {
  if (!signal || typeof signal!=='object' || Array.isArray(signal) || signal.schema_version!=='3') throw Error('Replay schema 3 required');
  const expected=signal.kind==='fill'?FILL_KEYS:signal.kind==='account_start'?START_KEYS:signal.kind==='account_mark'?MARK_KEYS:null;
  if(!expected)throw Error('Invalid accounting record kind');
  const keys=[...expected,...(disclosed?['disclosure_nonce']:[])].sort();
  if(JSON.stringify(Object.keys(signal).sort())!==JSON.stringify(keys))throw Error('Unexpected accounting fields');
  if(signal.strategy!=='signal'||signal.version!=='1'||signal.symbol!=='BINANCE:BTCUSDT.P'||signal.timeframe!=='5'||typeof signal.deployment_id!=='string'||!signal.deployment_id)throw Error('Invalid accounting identity');
  if(!Number.isSafeInteger(signal.signal_time)||signal.signal_time<=0||signal.signal_time%300000!==0||!Number.isSafeInteger(signal.account_epoch)||signal.account_epoch<=0||signal.account_epoch%300000!==0||signal.signal_time<signal.account_epoch)throw Error('Invalid accounting time');
  if(disclosed&&!/^[0-9a-f]{64}$/.test(signal.disclosure_nonce))throw Error('Invalid disclosure nonce');
  for(const k of ['target_price',...(signal.kind==='fill'?['fill_quantity']:signal.kind==='account_start'?['initial_capital','starting_equity','commission_rate']:['equity'])]) {
    if(decimal(signal[k])!==signal[k]||Number(signal[k])<=0)throw Error('Invalid positive accounting decimal');
  }
  if(signal.kind==='account_start') {
    if(signal.signal_time!==signal.account_epoch||signal.initial_capital!=='10000'||signal.commission_rate!=='0.001'||decimal(signal.starting_quantity,true)!==signal.starting_quantity||!/^[0-9a-f]{64}$/.test(signal.settings_commitment))throw Error('Invalid opening snapshot');
  } else if(signal.kind==='account_mark') {
    if(decimal(signal.target_quantity,true)!==signal.target_quantity||!Number.isSafeInteger(signal.fill_count)||signal.fill_count<0)throw Error('Invalid accounting checkpoint');
  } else {
    for(const k of ['position_before','target_quantity'])if(decimal(signal[k],true)!==signal[k])throw Error('Noncanonical position');
    if(!['buy','sell'].includes(signal.action)||signal.target_position!==direction(signal.target_quantity)||!/^[0-9a-f]{64}$/.test(signal.execution_id))throw Error('Invalid fill identity');
    const delta=units(signal.fill_quantity)*(signal.action==='buy'?1n:-1n);
    if(units(signal.target_quantity)-units(signal.position_before)!==delta)throw Error('Fill does not reconcile positions');
    if(!Number.isSafeInteger(signal.fill_time)||signal.fill_time<signal.signal_time-300000||signal.fill_time>signal.signal_time+900000)throw Error('Fill time outside event policy');
  }
  return signal;
}
export function validateSupplementSignal(signal,disclosed=true){
  const keys=['schema_version','strategy','version','deployment_id','symbol','timeframe','signal_time','kind','source_seq','source_chain_hash','source_payload_hash','accounting',...(disclosed?['disclosure_nonce']:[])].sort();
  if(!signal||typeof signal!=='object'||JSON.stringify(Object.keys(signal).sort())!==JSON.stringify(keys)||signal.schema_version!=='4'||signal.kind!=='accounting_supplement')throw Error('Invalid proof supplement schema');
  if(signal.strategy!=='signal'||signal.version!=='1'||signal.symbol!=='BINANCE:BTCUSDT.P'||signal.timeframe!=='5'||!Number.isSafeInteger(signal.signal_time)||signal.signal_time<=0||signal.signal_time%300000||!Number.isSafeInteger(signal.source_seq)||signal.source_seq<1||!/^[0-9a-f]{64}$/.test(signal.source_chain_hash)||!/^[0-9a-f]{64}$/.test(signal.source_payload_hash))throw Error('Invalid proof supplement identity');
  if(disclosed&&!/^[0-9a-f]{64}$/.test(signal.disclosure_nonce))throw Error('Invalid disclosure nonce');
  validateReplaySignal(signal.accounting,false);
  if(signal.accounting.deployment_id!==signal.deployment_id||!['account_start','fill'].includes(signal.accounting.kind)||signal.accounting.signal_time>signal.signal_time)throw Error('Invalid supplement accounting fact');
  return signal;
}
export function bindSupplement(signal,source){
  validateSupplementSignal(signal);
  if(!source||source.record.seq!==signal.source_seq||source.chain_hash!==signal.source_chain_hash||source.record.payload_hash!==signal.source_payload_hash||source.signal.schema_version!=='2'||source.record.deployment_id!==signal.deployment_id||source.tsa?.status!=='verified')throw Error('Supplement requires an existing verified legacy proof');
  const fact=signal.accounting;
  if(fact.signal_time!==source.signal.signal_time||fact.account_epoch>source.signal.signal_time)throw Error('Supplement time does not match proven signal');
  if(fact.kind==='fill'&&(fact.action!==source.signal.action||fact.target_position!==source.signal.target_position))throw Error('Supplement action does not match proven signal');
  return {...fact,disclosure_nonce:signal.disclosure_nonce};
}
