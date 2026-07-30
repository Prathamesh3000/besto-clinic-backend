// reset-password.js — run once, then delete
const bcrypt = require('bcryptjs'); // or 'bcrypt' — check your package.json for which one auth.service.js uses
const hash = bcrypt.hashSync('TestPass@123', 12); // 12 = matches your existing hash's cost factor ($2a$12$...)
console.log(hash);