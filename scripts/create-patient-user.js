'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const PLATFORM_URI = process.env.PLATFORM_DB_URI;
const TENANT_SLUG = 'smilecare-dental';
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
  // 1. Connect to platform DB
  console.log('Connecting to platform DB...');
  const platformConn = await mongoose.createConnection(PLATFORM_URI).asPromise();
  console.log('Connected to platform DB');

  // 2. Find the smilecare-dental clinic
  const Clinic = platformConn.model('Clinic', new mongoose.Schema({}, { strict: false }), 'clinics');
  const clinic = await Clinic.findOne({ slug: TENANT_SLUG, deletedAt: null }).select('+dbUri').lean();
  if (!clinic) {
    console.error('Clinic not found for slug:', TENANT_SLUG);
    process.exit(1);
  }
  console.log('Found clinic:', clinic.name, '| slug:', clinic.slug);
  console.log('Raw dbUri field:', clinic.dbUri ? clinic.dbUri.substring(0, 50) + '...' : 'MISSING');

  // 3. Decrypt dbUri if needed
  let tenantDbUri = clinic.dbUri;
  if (tenantDbUri && tenantDbUri.includes(':') && !tenantDbUri.startsWith('mongodb')) {
    console.log('dbUri is encrypted, decrypting...');
    try {
      tenantDbUri = decrypt(tenantDbUri, ENCRYPTION_KEY);
      console.log('Decrypted OK');
    } catch (err) {
      console.error('Decryption failed:', err.message);
      console.log('Trying raw value as URI...');
    }
  }
  console.log('Tenant DB URI:', tenantDbUri.substring(0, 60) + '...');

  // 4. Connect to tenant DB
  console.log('Connecting to tenant DB...');
  const tenantConn = await mongoose.createConnection(tenantDbUri).asPromise();
  console.log('Connected to tenant DB');

  // 5. Check existing users to avoid duplicates
  const User = tenantConn.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const existing = await User.findOne({ email: 'ananya.sharma@bestoclinic.com' }).lean();
  if (existing) {
    console.log('User already exists:', existing.email);
    await platformConn.close();
    await tenantConn.close();
    process.exit(0);
  }

  // 6. Create User
  const plainPassword = 'Ananya@123';
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  const userDoc = await User.create({
    name: 'Ananya Sharma',
    email: 'ananya.sharma@bestoclinic.com',
    phone: '+91 98234 56789',
    password: hashedPassword,
    role: 'patient',
    isActive: true,
    isEmailVerified: false,
    consentGiven: false,
    deletedAt: null,
  });
  console.log('User created:', userDoc._id, '| email:', userDoc.email);

  // 7. Create Patient linked to User
  const Patient = tenantConn.model('Patient', new mongoose.Schema({}, { strict: false }), 'patients');
  const patientDoc = await Patient.create({
    user: userDoc._id,
    name: 'Ananya Sharma',
    email: 'ananya.sharma@bestoclinic.com',
    phone: '+91 98234 56789',
    gender: 'female',
    dateOfBirth: new Date('1995-06-15'),
    bloodGroup: 'B+',
    isActive: true,
    deletedAt: null,
  });
  console.log('Patient created:', patientDoc._id);

  console.log('\n========================================');
  console.log('  LOGIN CREDENTIALS');
  console.log('========================================');
  console.log('  Email:    ananya.sharma@bestoclinic.com');
  console.log('  Password: Ananya@123');
  console.log('  Tenant:   smilecare-dental');
  console.log('========================================\n');

  await platformConn.close();
  await tenantConn.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
