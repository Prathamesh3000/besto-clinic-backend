'use strict';

/**
 * Fix login for omkar@gmail.com:
 *   1. Reset password to 'omkar123'
 *   2. Remove user entries with name containing 'akash' (case-insensitive)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const PLATFORM_URI = process.env.PLATFORM_DB_URI;
const ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
const TENANT_SLUG = 'smilecare-dental';

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
  const platformConn = await mongoose.createConnection(PLATFORM_URI).asPromise();

  // Find clinic and decrypt tenant URI
  const Clinic = platformConn.model('Clinic', new mongoose.Schema({}, { strict: false }), 'clinics');
  const clinic = await Clinic.findOne({ slug: TENANT_SLUG, deletedAt: null }).select('+dbUri').lean();
  if (!clinic) { console.error('Clinic not found'); process.exit(1); }

  let tenantDbUri = clinic.dbUri;
  if (tenantDbUri && tenantDbUri.includes(':') && !tenantDbUri.startsWith('mongodb')) {
    tenantDbUri = decrypt(tenantDbUri, ENCRYPTION_KEY);
  }

  const tenantConn = await mongoose.createConnection(tenantDbUri).asPromise();
  const User = tenantConn.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const Patient = tenantConn.model('Patient', new mongoose.Schema({}, { strict: false }), 'patients');

  // ── 1. Reset omkar@gmail.com password ──
  const omkar = await User.findOne({ email: 'omkar@gmail.com' });
  if (omkar) {
    const newHash = await bcrypt.hash('omkar123', 12);
    await User.updateOne({ _id: omkar._id }, { $set: { password: newHash } });
    console.log('✓ Password reset for omkar@gmail.com');

    // Verify it works
    const updated = await User.findOne({ _id: omkar._id }).select('+password').lean();
    const match = await bcrypt.compare('omkar123', updated.password);
    console.log('  Verification:', match ? 'PASS' : 'FAIL');
  } else {
    console.log('✗ omkar@gmail.com not found in tenant');
  }

  // ── 2. Remove users with 'akash' in name ──
  const akashUsers = await User.find({ name: { $regex: /akash/i } }).lean();
  console.log('\nFound', akashUsers.length, 'user(s) with "akash" in name:');
  for (const u of akashUsers) {
    console.log('  -', u.name, '|', u.email, '| role:', u.role);

    // Remove linked Patient records
    const deleted = await Patient.deleteMany({ user: u._id });
    console.log('    Removed', deleted.deletedCount, 'patient record(s)');

    // Remove the user
    await User.deleteOne({ _id: u._id });
    console.log('    User deleted');
  }

  // Also remove from UserDirectory
  const UserDir = platformConn.model('UserDirectory', new mongoose.Schema({}, { strict: false }), 'userdirectories');
  for (const u of akashUsers) {
    const dirDel = await UserDir.deleteMany({ email: u.email });
    if (dirDel.deletedCount > 0) {
      console.log('    Removed', dirDel.deletedCount, 'UserDirectory entry for', u.email);
    }
  }

  // Remove from PlatformPatient
  const PP = platformConn.model('PlatformPatient', new mongoose.Schema({}, { strict: false }), 'platformpatients');
  for (const u of akashUsers) {
    const ppDel = await PP.deleteMany({ email: u.email });
    if (ppDel.deletedCount > 0) {
      console.log('    Removed', ppDel.deletedCount, 'PlatformPatient entry for', u.email);
    }
  }

  console.log('\nDone.');
  await platformConn.close();
  await tenantConn.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
