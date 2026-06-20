const B = 'http://localhost:8787';
const j = (r) => r.json();
const post = (p, t) => fetch(B+p,{method:'POST',headers:t?{Authorization:'Bearer '+t}:{}}).then(j);

const su = await fetch(B+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Econ','password:':'x','password':'abcd'})}).then(j);
const t = su.token;
console.log('1. signup bonus coins =', su.user.coins, su.user.coins===50?'PASS(50)':'FAIL', '| signupBonus field:', su.signupBonus);

// Buy 8 coffees -> should bank 1 free coffee, punches reset to 0
let r;
for (let i=0;i<8;i++) r = await post('/api/coffee', t);
console.log('2. after 8 coffees: punches =', r.user.punches, '| freeCoffees =', r.user.freeCoffees, '| freeEarned flag:', r.result.freeEarned, (r.user.punches===0 && r.user.freeCoffees===1)?'PASS':'FAIL');

// Buy 8 more -> bank a 2nd free coffee (stacking)
for (let i=0;i<8;i++) r = await post('/api/coffee', t);
console.log('3. after 16 coffees: freeCoffees =', r.user.freeCoffees, r.user.freeCoffees===2?'PASS(stacks to 2)':'FAIL');

// Claim one free coffee
r = await post('/api/free-coffee/claim', t);
console.log('4. after claim: freeCoffees =', r.user.freeCoffees, '| freeRedeemed =', r.user.freeRedeemed, (r.user.freeCoffees===1 && r.user.freeRedeemed===1)?'PASS':'FAIL');

// Coins are still 50 (no per-coffee coins, no streak milestone same-day). Top up to 250 and redeem -> deduct 200, remainder 50 stacks
const { db } = await import('./server/db.js');
db.prepare("UPDATE users SET coins=250 WHERE username='econ'").run();
r = await post('/api/redeem', t);
console.log('5. redeem from 250: coins now =', r.user.coins, r.user.coins===50?'PASS(stacks, -200)':'FAIL', '| voucher', r.voucher.code);
