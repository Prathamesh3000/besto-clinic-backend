'use strict';

/**
 * Assign SuperAdmins Script
 *
 * This script assigns SuperAdmin users to all clinics that don't have one.
 * For each clinic:
 * 1. Creates a super_admin user in the tenant's database
 * 2. Updates the Clinic document with SuperAdmin metadata
 *
 * Usage: node scripts/assign-superadmins.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

async function assignSuperAdmins() {
  const env = require('../src/config/env');

  try {
    // Connect to platform DB
    await mongoose.connect(env.PLATFORM_DB_URI);
    console.log('✓ Connected to platform DB');

    // Register platform models
    require('../src/models/platform/Clinic');
    const Clinic = mongoose.model('Clinic');

    // Find all clinics without SuperAdmin
    const clinicsWithoutAdmin = await Clinic.find({
      $or: [
        { 'superAdmin.email': { $exists: false } },
        { 'superAdmin.email': null },
        { 'superAdmin.email': '' },
      ],
    });

    if (clinicsWithoutAdmin.length === 0) {
      console.log('\n✅ All clinics already have SuperAdmins assigned!');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`\n📋 Found ${clinicsWithoutAdmin.length} clinic(s) without SuperAdmin:\n`);

    for (const clinic of clinicsWithoutAdmin) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${clinic.name} (${clinic.slug})`);
      console.log('='.repeat(60));

      try {
        // Generate SuperAdmin details
        const superAdminData = {
          name: `${clinic.name} Admin`,
          email: `admin@${clinic.slug}.com`,
          phone: clinic.phone || '9876543210',
          password: 'Admin@12345', // Default password - should be changed on first login
        };

        console.log(`   Creating SuperAdmin user in tenant database...`);

        // Connect to tenant DB
        const tenantDbUri = env.PLATFORM_DB_URI.replace(
          /\/[^/]+\?/,
          `/bestoclinic_${clinic.slug}?`
        );

        const tenantConn = await mongoose.createConnection(tenantDbUri, {
          maxPoolSize: 5,
          serverSelectionTimeoutMS: 5000,
        }).asPromise();

        console.log(`   ✓ Connected to tenant DB: bestoclinic_${clinic.slug}`);

        // Register User model for tenant
        const bcrypt = require('bcryptjs');
        const userSchema = new mongoose.Schema({
          name: { type: String, required: true },
          email: { type: String, required: true, unique: true },
          phone: String,
          password: { type: String, required: true, select: false },
          role: {
            type: String,
            enum: ['super_admin', 'admin', 'doctor', 'staff', 'receptionist', 'patient', 'guardian'],
            default: 'patient',
          },
          isActive: { type: Boolean, default: true },
          lastLoginAt: Date,
          branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
          department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
        }, { timestamps: true });

        // Hash password before save
        userSchema.pre('save', async function (next) {
          if (!this.isModified('password')) return next();
          this.password = await bcrypt.hash(this.password, 12);
          next();
        });

        const User = tenantConn.model('User', userSchema);

        // Check if user already exists
        const existingUser = await User.findOne({ email: superAdminData.email });
        let superAdminUser;

        if (existingUser) {
          console.log(`   ⚠️  User already exists: ${superAdminData.email}`);
          superAdminUser = existingUser;
        } else {
          // Create SuperAdmin user
          superAdminUser = await User.create({
            name: superAdminData.name,
            email: superAdminData.email,
            phone: superAdminData.phone,
            password: superAdminData.password,
            role: 'super_admin',
            isActive: true,
          });
          console.log(`   ✓ SuperAdmin user created: ${superAdminData.email}`);
        }

        // Update Clinic document with SuperAdmin metadata
        clinic.superAdmin = {
          userId: superAdminUser._id.toString(),
          name: superAdminData.name,
          email: superAdminData.email,
          phone: superAdminData.phone,
          provisionedAt: new Date(),
        };

        await clinic.save();
        console.log(`   ✓ Clinic document updated with SuperAdmin metadata`);

        // Close tenant connection
        await tenantConn.close();

        console.log(`\n   ✅ Successfully assigned SuperAdmin to ${clinic.name}`);
        console.log(`   📧 Email: ${superAdminData.email}`);
        console.log(`   🔑 Password: ${superAdminData.password}`);
        console.log(`   🌐 Login: https://bestoclinic.com/clinic/login`);

      } catch (err) {
        console.error(`   ❌ Failed to assign SuperAdmin to ${clinic.name}:`, err.message);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUPERADMIN ASSIGNMENT COMPLETE');
    console.log('='.repeat(60));

    // Re-check to show final status
    const remaining = await Clinic.find({
      $or: [
        { 'superAdmin.email': { $exists: false } },
        { 'superAdmin.email': null },
        { 'superAdmin.email': '' },
      ],
    });

    const total = await Clinic.countDocuments();
    const withAdmin = total - remaining.length;

    console.log(`\n📊 Summary:`);
    console.log(`   Total Clinics: ${total}`);
    console.log(`   With SuperAdmin: ${withAdmin}`);
    console.log(`   Without SuperAdmin: ${remaining.length}`);

    console.log(`\n🔐 Default Credentials:`);
    console.log(`   Email Pattern: admin@[clinic-slug].com`);
    console.log(`   Password: Admin@12345`);
    console.log(`   Login URL: https://bestoclinic.com/clinic/login`);

    console.log(`\n💡 Note: SuperAdmins should change their password on first login.`);
    console.log('\n' + '='.repeat(60));

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from databases');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Script failed:', err);
    console.error(err.stack);
    process.exit(1);
  }
}

assignSuperAdmins();
