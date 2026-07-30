'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const PLATFORM_URI = process.env.PLATFORM_DB_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(payload, hexKey) {
  const [ivHex, tagHex, ciphertext] = payload.split(':');
  if (!ivHex || !tagHex || !ciphertext) throw new Error('Invalid encrypted payload');
  const key = Buffer.from(hexKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  console.log('Connecting to platform DB...');
  const platformConn = await mongoose.createConnection(PLATFORM_URI, {
    serverSelectionTimeoutMS: 10000,
  }).asPromise();
  console.log('Connected!\n');

  // Find all clinics
  const Clinic = platformConn.model('Clinic', new mongoose.Schema({}, { strict: false }), 'clinics');
  const clinics = await Clinic.find({ deletedAt: null }).select('+dbUri').lean();
  console.log(`Found ${clinics.length} clinic(s):`);
  clinics.forEach(c => console.log(`  - ${c.name} (slug: ${c.slug})`));
  console.log('');

  // For each clinic, connect to tenant DB and list users
  for (const clinic of clinics) {
    let tenantUri = clinic.dbUri;
    if (!tenantUri) { console.log(`  [${clinic.slug}] No dbUri, skipping`); continue; }

    // Decrypt if needed
    if (!tenantUri.startsWith('mongodb')) {
      try { tenantUri = decrypt(tenantUri, ENCRYPTION_KEY); } catch (e) {
        console.log(`  [${clinic.slug}] Decryption failed: ${e.message}`);
        continue;
      }
    }

    console.log(`\n=== ${clinic.name} (${clinic.slug}) ===`);
    try {
      const tenantConn = await mongoose.createConnection(tenantUri, {
        serverSelectionTimeoutMS: 10000,
      }).asPromise();

      const User = tenantConn.model('User', new mongoose.Schema({}, { strict: false }), 'users');
      const users = await User.find({ deletedAt: null }).select('name email role phone isActive').lean();

      if (users.length === 0) {
        console.log('  No users found');
      } else {
        console.log(`  ${users.length} user(s):`);
        users.forEach(u => {
          console.log(`    [${u.role}] ${u.name} | ${u.email} | ${u.phone || 'no phone'} | active: ${u.isActive}`);
        });
      }

      await tenantConn.close();
    } catch (e) {
      console.log(`  Connection failed: ${e.message}`);
    }
  }

  await platformConn.close();
  console.log('\nDone.');
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
