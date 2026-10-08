import {canonical} from './protocol.js';
function fail(message){throw new Error(message || 'Verification failed');}
export default {
 equal(a,b,message){if(!Object.is(a,b))fail(message);},
 deepEqual(a,b,message){if(canonical(a)!==canonical(b))fail(message);},
 ok(value,message){if(!value)fail(message);},
 match(value,pattern,message){if(typeof value!=='string'||!pattern.test(value))fail(message);}
};
