'use strict';

/**
 * Comprehensive Platform Seed Script
 *
 * Creates:
 * - Platform admin user
 * - Multiple subscription plans
 * - Multiple realistic clinics with subscriptions
 *
 * Usage: node scripts/seed-platform-full.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

async function seed() {
  const env = require('../src/config/env');

  try {
    await mongoose.connect(env.PLATFORM_DB_URI);
    console.log('✓ Connected to platform DB');

    // Register models
    require('../src/models/platform/Clinic');
    require('../src/models/platform/Subscription');
    require('../src/models/platform/PlatformUser');
    require('../src/models/platform/Plan');

    const PlatformUser = mongoose.model('PlatformUser');
    const Plan = mongoose.model('Plan');
    const Clinic = mongoose.model('Clinic');

    // ================================================================
    // 1. CREATE PLATFORM ADMIN
    // ================================================================

    let adminUser = await PlatformUser.findOne({ email: 'admin@bestoclinic.com' });
    if (!adminUser) {
      adminUser = await PlatformUser.create({
        name: 'Platform Administrator',
        email: 'admin@bestoclinic.com',
        password: 'Admin@12345',
        role: 'product_owner',
      });
      console.log('✅ Platform admin created: admin@bestoclinic.com / Admin@12345');
    } else {
      console.log('ℹ️  Platform admin already exists');
    }

    // ================================================================
    // 2. CREATE SUBSCRIPTION PLANS
    // ================================================================

    const plans = [
      {
        name: 'Free Plan',
        slug: 'free',
        description: 'Perfect for solo practitioners getting started',
        tier: 0,
        pricing: { monthly: 0, yearly: 0, currency: 'INR' },
        features: {
          maxDoctors: 1,
          maxStaff: 2,
          maxBranches: 1,
          maxStorageMB: 250,
          maxSmsPerMonth: 0,
          smsEnabled: false,
          teleHealthEnabled: false,
          customBranding: false,
          apiAccess: false,
          prioritySupport: false,
          advancedReports: false,
          whiteLabeling: false,
        },
        trial: { enabled: false, durationDays: 0 },
        displayOrder: 1,
        isPublic: true,
        isActive: true,
        highlights: [
          '1 Doctor',
          '2 Staff Members',
          'Basic Patient Management',
          'Appointment Scheduling',
          '250 MB Storage',
        ],
      },
      {
        name: 'Starter',
        slug: 'starter',
        description: 'Ideal for small clinics with essential features',
        tier: 10,
        pricing: { monthly: 2999, yearly: 29990, currency: 'INR' },
        features: {
          maxDoctors: 3,
          maxStaff: 10,
          maxBranches: 1,
          maxStorageMB: 2048,
          maxSmsPerMonth: 500,
          smsEnabled: true,
          teleHealthEnabled: false,
          customBranding: false,
          apiAccess: false,
          prioritySupport: false,
          advancedReports: false,
          whiteLabeling: false,
        },
        trial: { enabled: true, durationDays: 14 },
        displayOrder: 2,
        isPublic: true,
        isActive: true,
        highlights: [
          'Up to 3 Doctors',
          '10 Staff Members',
          'SMS Notifications (500/month)',
          'Billing & Invoicing',
          '2 GB Storage',
          '14-day Free Trial',
        ],
        badge: 'Most Popular',
      },
      {
        name: 'Professional',
        slug: 'professional',
        description: 'Advanced features for growing multi-doctor clinics',
        tier: 20,
        pricing: { monthly: 7999, yearly: 79990, currency: 'INR' },
        features: {
          maxDoctors: 10,
          maxStaff: 30,
          maxBranches: 3,
          maxStorageMB: 10240,
          maxSmsPerMonth: 2000,
          smsEnabled: true,
          teleHealthEnabled: true,
          customBranding: true,
          apiAccess: false,
          prioritySupport: true,
          advancedReports: true,
          whiteLabeling: false,
        },
        addOns: {
          doctors: {
            enabled: true,
            pricePerDoctorMonthly: 500,
            pricePerDoctorYearly: 5000,
            maxAdditional: 20,
          },
          storage: {
            enabled: true,
            pricePerUnitMonthly: 300,
            pricePerUnitYearly: 3000,
            unitSizeMB: 1024,
            maxUnits: 50,
          },
        },
        trial: { enabled: true, durationDays: 14 },
        displayOrder: 3,
        isPublic: true,
        isActive: true,
        highlights: [
          'Up to 10 Doctors',
          '30 Staff Members',
          'Multi-Branch Support (3 branches)',
          'Telemedicine Integration',
          'SMS (2000/month)',
          'Advanced Analytics',
          'Priority Support',
          'Job Portal (5 credits/mo)',
          '10 GB Storage',
        ],
        badge: 'Best Value',
      },
      {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'Complete solution for large healthcare networks',
        tier: 30,
        pricing: { monthly: 19999, yearly: 199990, currency: 'INR' },
        features: {
          maxDoctors: 50,
          maxStaff: 100,
          maxBranches: 10,
          maxStorageMB: 51200,
          maxSmsPerMonth: 10000,
          smsEnabled: true,
          teleHealthEnabled: true,
          customBranding: true,
          apiAccess: true,
          prioritySupport: true,
          advancedReports: true,
          whiteLabeling: true,
        },
        addOns: {
          doctors: {
            enabled: true,
            pricePerDoctorMonthly: 400,
            pricePerDoctorYearly: 4000,
            maxAdditional: 100,
          },
          storage: {
            enabled: true,
            pricePerUnitMonthly: 250,
            pricePerUnitYearly: 2500,
            unitSizeMB: 1024,
            maxUnits: 100,
          },
        },
        trial: { enabled: true, durationDays: 30 },
        displayOrder: 4,
        isPublic: true,
        isActive: true,
        highlights: [
          'Up to 50 Doctors',
          '100 Staff Members',
          'Multi-Branch Support (10 branches)',
          'Full Telemedicine Suite',
          'SMS (10,000/month)',
          'White-Label Solution',
          'API Access',
          'Job Portal (20 credits/mo)',
          'Dedicated Support',
          '50 GB Storage',
        ],
      },
    ];

    for (const planData of plans) {
      const existing = await Plan.findOne({ slug: planData.slug });
      if (!existing) {
        await Plan.create({ ...planData, createdBy: adminUser._id });
        console.log(`✅ Plan created: ${planData.name}`);
      } else {
        console.log(`ℹ️  Plan already exists: ${planData.name}`);
      }
    }

    // Fetch created plans for reference
    const freePlan = await Plan.findOne({ slug: 'free' });
    const starterPlan = await Plan.findOne({ slug: 'starter' });
    const proPlan = await Plan.findOne({ slug: 'professional' });
    const entPlan = await Plan.findOne({ slug: 'enterprise' });

    // ================================================================
    // 3. CREATE REALISTIC CLINICS
    // ================================================================

    const clinics = [
      {
        name: 'SmileCare Dental Clinic',
        slug: 'smilecare-dental',
        clinicCode: 'SMILE2847',
        email: 'contact@smilecare.clinic',
        phone: '022-45678901',
        address: {
          street: '12, Linking Road, Santacruz West',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400054',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [72.8777, 19.0760] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_smilecare_dental?'),
        subscription: {
          plan: 'professional',
          planRef: proPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
        features: proPlan.features,
        usage: {
          doctorsCount: 5,
          staffCount: 12,
          branchesCount: 2,
          patientsCount: 842,
          storageUsedMB: 1240,
          smsUsedThisMonth: 456,
        },
        status: 'active',
        activatedAt: new Date('2024-01-15'),
      },
      {
        name: 'HealthPlus Multispecialty Hospital',
        slug: 'healthplus-hospital',
        clinicCode: 'HEALTH1034',
        email: 'admin@healthplus.in',
        phone: '080-28901234',
        address: {
          street: 'No. 45, MG Road, Ashok Nagar',
          city: 'Bangalore',
          state: 'Karnataka',
          zipCode: '560001',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [77.5946, 12.9716] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_healthplus_hospital?'),
        subscription: {
          plan: 'enterprise',
          planRef: entPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 60 * 24 * 3600 * 1000),
        },
        features: entPlan.features,
        usage: {
          doctorsCount: 28,
          staffCount: 65,
          branchesCount: 4,
          patientsCount: 3254,
          storageUsedMB: 12450,
          smsUsedThisMonth: 2845,
        },
        status: 'active',
        activatedAt: new Date('2023-11-20'),
      },
      {
        name: 'Vision Eye Care Center',
        slug: 'vision-eyecare',
        clinicCode: 'VISION5612',
        email: 'info@visioneyecare.com',
        phone: '011-45612378',
        address: {
          street: 'B-14, Sector 18, Noida',
          city: 'Noida',
          state: 'Uttar Pradesh',
          zipCode: '201301',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [77.3910, 28.5355] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_vision_eyecare?'),
        subscription: {
          plan: 'starter',
          planRef: starterPlan._id,
          status: 'trial',
          trialEndsAt: new Date(Date.now() + 10 * 24 * 3600 * 1000),
        },
        features: starterPlan.features,
        usage: {
          doctorsCount: 2,
          staffCount: 5,
          branchesCount: 1,
          patientsCount: 156,
          storageUsedMB: 234,
          smsUsedThisMonth: 78,
        },
        status: 'active',
        activatedAt: new Date('2025-02-16'),
      },
      {
        name: 'Little Angels Pediatric Clinic',
        slug: 'little-angels-pediatric',
        clinicCode: 'LITTLE4289',
        email: 'care@littleangels.clinic',
        phone: '020-67890123',
        address: {
          street: 'Shop No. 7, Deccan Plaza, FC Road',
          city: 'Pune',
          state: 'Maharashtra',
          zipCode: '411004',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [73.8567, 18.5204] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_little_angels_pediatric?'),
        subscription: {
          plan: 'starter',
          planRef: starterPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 15 * 24 * 3600 * 1000),
        },
        features: starterPlan.features,
        usage: {
          doctorsCount: 3,
          staffCount: 6,
          branchesCount: 1,
          patientsCount: 524,
          storageUsedMB: 890,
          smsUsedThisMonth: 234,
        },
        status: 'active',
        activatedAt: new Date('2024-08-10'),
      },
      {
        name: 'OrthoLife Bone & Joint Clinic',
        slug: 'ortholife-clinic',
        clinicCode: 'ORTHO7856',
        email: 'info@ortholife.in',
        phone: '033-22345678',
        address: {
          street: '78A, Park Street',
          city: 'Kolkata',
          state: 'West Bengal',
          zipCode: '700016',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [88.3639, 22.5726] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_ortholife_clinic?'),
        subscription: {
          plan: 'professional',
          planRef: proPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 45 * 24 * 3600 * 1000),
        },
        features: proPlan.features,
        usage: {
          doctorsCount: 6,
          staffCount: 15,
          branchesCount: 2,
          patientsCount: 1234,
          storageUsedMB: 3456,
          smsUsedThisMonth: 892,
        },
        status: 'active',
        activatedAt: new Date('2024-03-22'),
      },
      {
        name: 'Skin & You Dermatology Center',
        slug: 'skin-and-you-derma',
        clinicCode: 'SKINYO3421',
        email: 'hello@skinandyou.com',
        phone: '040-67123456',
        address: {
          street: 'Plot No. 23, Banjara Hills Road 12',
          city: 'Hyderabad',
          state: 'Telangana',
          zipCode: '500034',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [78.4867, 17.3850] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_skin_and_you_derma?'),
        subscription: {
          plan: 'starter',
          planRef: starterPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 20 * 24 * 3600 * 1000),
        },
        features: starterPlan.features,
        usage: {
          doctorsCount: 2,
          staffCount: 7,
          branchesCount: 1,
          patientsCount: 678,
          storageUsedMB: 1123,
          smsUsedThisMonth: 345,
        },
        status: 'active',
        activatedAt: new Date('2024-06-18'),
      },
      {
        name: 'Wellness Family Clinic',
        slug: 'wellness-family-clinic',
        clinicCode: 'WELLN6578',
        email: 'contact@wellnessfamily.in',
        phone: '0484-2345678',
        address: {
          street: 'MG Road, Near Metro Station',
          city: 'Kochi',
          state: 'Kerala',
          zipCode: '682016',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [76.2673, 9.9312] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_wellness_family_clinic?'),
        subscription: {
          plan: 'free',
          planRef: freePlan._id,
          status: 'active',
        },
        features: freePlan.features,
        usage: {
          doctorsCount: 1,
          staffCount: 2,
          branchesCount: 1,
          patientsCount: 89,
          storageUsedMB: 145,
          smsUsedThisMonth: 0,
        },
        status: 'active',
        activatedAt: new Date('2025-01-10'),
      },
      {
        name: 'CardioCare Heart Hospital',
        slug: 'cardiocare-heart',
        clinicCode: 'CARDIO9012',
        email: 'admin@cardiocare.hospital',
        phone: '0755-4012345',
        address: {
          street: 'Arera Hills, Zone 1',
          city: 'Bhopal',
          state: 'Madhya Pradesh',
          zipCode: '462011',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [77.4126, 23.2599] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_cardiocare_heart?'),
        subscription: {
          plan: 'enterprise',
          planRef: entPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 90 * 24 * 3600 * 1000),
        },
        features: entPlan.features,
        usage: {
          doctorsCount: 18,
          staffCount: 45,
          branchesCount: 3,
          patientsCount: 2156,
          storageUsedMB: 8945,
          smsUsedThisMonth: 1923,
        },
        status: 'active',
        activatedAt: new Date('2023-09-05'),
      },
      {
        name: 'NeuroHealth Brain & Spine Clinic',
        slug: 'neurohealth-clinic',
        clinicCode: 'NEURO2345',
        email: 'info@neurohealth.in',
        phone: '0172-4567890',
        address: {
          street: 'SCO 45-46, Sector 17',
          city: 'Chandigarh',
          state: 'Chandigarh',
          zipCode: '160017',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [76.7794, 30.7333] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_neurohealth_clinic?'),
        subscription: {
          plan: 'professional',
          planRef: proPlan._id,
          status: 'trial',
          trialEndsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
        features: proPlan.features,
        usage: {
          doctorsCount: 4,
          staffCount: 9,
          branchesCount: 1,
          patientsCount: 234,
          storageUsedMB: 567,
          smsUsedThisMonth: 123,
        },
        status: 'active',
        activatedAt: new Date('2025-02-19'),
      },
      {
        name: 'MomCare Women & Child Hospital',
        slug: 'momcare-hospital',
        clinicCode: 'MOMCAR8167',
        email: 'care@momcare.in',
        phone: '0361-2345678',
        address: {
          street: 'GS Road, Christian Basti',
          city: 'Guwahati',
          state: 'Assam',
          zipCode: '781005',
          country: 'IN',
        },
        location: { type: 'Point', coordinates: [91.7362, 26.1445] },
        dbUri: env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, '/bestoclinic_momcare_hospital?'),
        subscription: {
          plan: 'professional',
          planRef: proPlan._id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 25 * 24 * 3600 * 1000),
        },
        features: proPlan.features,
        usage: {
          doctorsCount: 8,
          staffCount: 22,
          branchesCount: 2,
          patientsCount: 1456,
          storageUsedMB: 4234,
          smsUsedThisMonth: 1234,
        },
        status: 'active',
        activatedAt: new Date('2024-05-12'),
      },
    ];

    for (const clinicData of clinics) {
      const existing = await Clinic.findOne({ slug: clinicData.slug });
      if (!existing) {
        await Clinic.create({ ...clinicData, createdBy: adminUser._id });
        console.log(`✅ Clinic created: ${clinicData.name} (Code: ${clinicData.clinicCode})`);
      } else if (!existing.clinicCode && clinicData.clinicCode) {
        existing.clinicCode = clinicData.clinicCode;
        await existing.save();
        console.log(`✅ Backfilled clinicCode for ${clinicData.name}: ${clinicData.clinicCode}`);
      } else {
        console.log(`ℹ️  Clinic already exists: ${clinicData.name} (Code: ${existing.clinicCode || 'none'})`);
      }
    }

    // ================================================================
    // SUMMARY
    // ================================================================

    console.log('\n' + '='.repeat(60));
    console.log('✅ SEED COMPLETE');
    console.log('='.repeat(60));

    const totalPlans = await Plan.countDocuments();
    const totalClinics = await Clinic.countDocuments();

    console.log(`\n📊 Summary:`);
    console.log(`   • Plans: ${totalPlans}`);
    console.log(`   • Clinics: ${totalClinics}`);

    console.log(`\n🔐 Platform Admin Credentials:`);
    console.log(`   Email: admin@bestoclinic.com`);
    console.log(`   Password: Admin@12345`);
    console.log(`   URL: https://bestoclinic.com/platform/login`);

    console.log(`\n📋 Subscription Plans Created:`);
    plans.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (${p.slug}) - ₹${p.pricing.monthly}/mo`);
    });

    console.log(`\n🏥 Clinics Created:`);
    clinics.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.slug})`);
      console.log(`      Code: ${c.clinicCode} | Plan: ${c.subscription.plan} | Status: ${c.subscription.status}`);
      console.log(`      Location: ${c.address.city}, ${c.address.state}`);
      console.log(`      QR Deep Link: bestoclinic://clinic/${c.clinicCode}`);
    });

    console.log('\n' + '='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);

  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seed();
