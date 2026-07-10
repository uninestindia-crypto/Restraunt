import { createHash } from 'crypto';

const pin1 = '8425';
const hash1 = createHash('sha256').update(pin1).digest('hex');
console.log('SHA-256 of 8425:', hash1);
console.log('Developer database pin_hash:', '819a8ef31663c3bd15ae7b4421811e2011c43eed875485e9161ab506f5d3afde');
console.log('Match?', hash1 === '819a8ef31663c3bd15ae7b4421811e2011c43eed875485e9161ab506f5d3afde');
