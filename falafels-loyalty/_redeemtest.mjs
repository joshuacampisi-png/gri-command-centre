const B = 'http://localhost:8787';
const su = await (await fetch(B+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'ResetTest',password:'abcd'})})).json();
const token = su.token;
const { db } = await import('./server/db.js');
db.prepare("UPDATE users SET coins = 260 WHERE username=?").run('resettest');
console.log('seeded coins:', db.prepare("SELECT coins FROM users WHERE username=?").get('resettest').coins);
const r = await (await fetch(B+'/api/redeem',{method:'POST',headers:{Authorization:'Bearer '+token}})).json();
console.log('coins after redeem:', r.user.coins, '| coinsReset:', r.coinsReset, '| voucher:', r.voucher.code);
console.log(r.user.coins === 0 ? 'PASS reset to 0' : 'FAIL');
