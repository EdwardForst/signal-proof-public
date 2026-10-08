export const encoder = new TextEncoder();
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const unhex = s => {
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('invalid digest');
  return Uint8Array.from(s.match(/../g), x => parseInt(x, 16));
};
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const from64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
// Schema only contains safe integers, finite numbers, ASCII keys and strings.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
export async function verifyReceipt(receipt, publicKey) {
  if (await digest(canonical(receipt.signal)) !== receipt.record.payload_hash) return false;
  if (await digest(canonical(receipt.record)) !== receipt.chain_hash) return false;
  const key = await crypto.subtle.importKey('spki', from64(publicKey), 'Ed25519', false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, from64(receipt.signature), unhex(receipt.chain_hash));
}
