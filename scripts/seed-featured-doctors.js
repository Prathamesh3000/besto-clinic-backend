'use strict';

/**
 * Seed script — fixes specialization mismatches, adds doctor profiles,
 * creates doctors for missing specializations, and features them all
 * on the platform directory.
 *
 * Usage:
 *   node scripts/seed-featured-doctors.js <tenant-slug>
 *   e.g.  node scripts/seed-featured-doctors.js smilecare-dental
 *
 * What it does:
 *   1. Connects to platform DB → finds clinic by slug
 *   2. Connects to tenant DB → loads existing doctors & departments
 *   3. Fixes specialization name mismatches so they match AI output
 *   4. Adds doctorProfile to existing doctors who lack one
 *   5. Creates new doctors ONLY for specializations with no existing doctor
 *   6. Creates FeaturedDoctor records in platform DB (the public directory)
 *
 * The 8 specializations match the hardcoded list in aiAnalysis.service.js
 * (the same list the Gemini AI uses to recommend specialists after a scan).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SLUG = process.argv[2];
if (!SLUG) {
  console.error('Usage: node scripts/seed-featured-doctors.js <tenant-slug>');
  process.exit(1);
}

// ── AI specialization list (must match aiAnalysis.service.js line 177) ──

const AI_SPECIALIZATIONS = [
  'General Dentistry',
  'Periodontics',
  'Orthodontics',
  'Cosmetic Dentistry',
  'Endodontics',
  'Oral Surgery',
  'Prosthodontics',
  'Pediatric Dentistry',
];

// ── Specialization name fixes (existing → AI-compatible) ──

const SPEC_FIXES = {
  'Periodontists': 'Periodontics',
  'Periodontics & Implantology': 'Periodontics',
  'Oral & Maxillofacial Surgery': 'Oral Surgery',
  'Oral and Maxillofacial Surgery': 'Oral Surgery',
  'Pedodontics': 'Pediatric Dentistry',
  'Pedodontics & Preventive Dentistry': 'Pediatric Dentistry',
  'Conservative Dentistry & Endodontics': 'Endodontics',
  'Prosthodontics & Crown Bridge': 'Prosthodontics',
  'Prosthodontics and Implantology': 'Prosthodontics',
};

// ── Department name fixes ──

const DEPT_NAME_FIXES = {
  'Periodontists': 'Periodontics',
  'Cardilogy': null, // unrelated, leave as-is
};

// ── Doctor profiles for existing doctors who may lack one ──

const PROFILE_DEFAULTS = {
  'General Dentistry': {
    bio: 'Experienced general dentist specializing in preventive care, fillings, and routine check-ups. Committed to making every patient feel comfortable.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Mumbai', year: 2014 },
    ],
    experienceYears: 10,
    languages: ['English', 'Hindi', 'Marathi'],
    qualifications: ['BDS'],
    achievements: ['5000+ patients treated'],
    acceptingNewPatients: true,
  },
  'Periodontics': {
    bio: 'Periodontist focused on gum disease treatment, dental implants, and soft tissue management with extensive clinical experience.',
    education: [
      { degree: 'BDS', institution: 'KLE Dental College, Belgaum', year: 2012 },
      { degree: 'MDS Periodontics', institution: 'Manipal College of Dental Sciences', year: 2015 },
    ],
    experienceYears: 10,
    languages: ['English', 'Hindi'],
    qualifications: ['BDS', 'MDS Periodontics'],
    achievements: ['Member IDA Periodontics Chapter'],
    acceptingNewPatients: true,
  },
  'Orthodontics': {
    bio: 'Orthodontist specializing in braces, clear aligners, and corrective jaw procedures. Transforms smiles with precision and care.',
    education: [
      { degree: 'BDS', institution: 'SDM College of Dental Sciences, Dharwad', year: 2012 },
      { degree: 'MDS Orthodontics', institution: 'Nair Hospital Dental College, Mumbai', year: 2015 },
    ],
    experienceYears: 9,
    languages: ['English', 'Hindi', 'Gujarati'],
    qualifications: ['BDS', 'MDS Orthodontics'],
    achievements: ['Invisalign Certified Provider', '2000+ aligner cases completed'],
    acceptingNewPatients: true,
  },
  'Cosmetic Dentistry': {
    bio: 'Cosmetic dentist offering teeth whitening, veneers, smile makeovers, and aesthetic bonding. Passionate about creating confident smiles.',
    education: [
      { degree: 'BDS', institution: 'Maulana Azad Dental College, Delhi', year: 2011 },
      { degree: 'Fellowship in Cosmetic Dentistry', institution: 'NYU College of Dentistry', year: 2014 },
    ],
    experienceYears: 11,
    languages: ['English', 'Hindi'],
    qualifications: ['BDS', 'Fellow Cosmetic Dentistry (NYU)'],
    achievements: ['Featured in Dental Tribune India', 'Hollywood Smile specialist'],
    acceptingNewPatients: true,
  },
  'Endodontics': {
    bio: 'Endodontist specializing in root canal treatments, retreatments, and microscopic endodontics. Pain-free procedures guaranteed.',
    education: [
      { degree: 'BDS', institution: 'SRM Dental College, Chennai', year: 2013 },
      { degree: 'MDS Endodontics', institution: 'Sri Ramachandra University, Chennai', year: 2016 },
    ],
    experienceYears: 8,
    languages: ['English', 'Hindi', 'Tamil'],
    qualifications: ['BDS', 'MDS Endodontics'],
    achievements: ['Microscopic RCT specialist', '3000+ root canals performed'],
    acceptingNewPatients: true,
  },
  'Oral Surgery': {
    bio: 'Oral and maxillofacial surgeon handling extractions, impacted wisdom teeth, jaw surgeries, and facial trauma. Hospital-grade procedures in-clinic.',
    education: [
      { degree: 'BDS', institution: 'Government Dental College, Nagpur', year: 2009 },
      { degree: 'MDS Oral & Maxillofacial Surgery', institution: 'KGMC Lucknow', year: 2012 },
    ],
    experienceYears: 14,
    languages: ['English', 'Hindi', 'Marathi'],
    qualifications: ['BDS', 'MDS OMFS', 'FDSRCS'],
    achievements: ['Fellow of Royal College of Surgeons', '500+ surgical procedures'],
    acceptingNewPatients: true,
  },
  'Prosthodontics': {
    bio: 'Prosthodontist specializing in dental crowns, bridges, dentures, and full-mouth rehabilitation. Restoring function and aesthetics.',
    education: [
      { degree: 'BDS', institution: 'Saveetha Dental College, Chennai', year: 2012 },
      { degree: 'MDS Prosthodontics', institution: 'Government Dental College, Thiruvananthapuram', year: 2015 },
    ],
    experienceYears: 9,
    languages: ['English', 'Hindi', 'Malayalam'],
    qualifications: ['BDS', 'MDS Prosthodontics'],
    achievements: ['CAD/CAM certified', 'Digital denture workflow pioneer'],
    acceptingNewPatients: true,
  },
  'Pediatric Dentistry': {
    bio: 'Pediatric dentist dedicated to making dental visits fun for children. Specializes in preventive care, sealants, and behavior management.',
    education: [
      { degree: 'BDS', institution: 'M.A. Rangoonwala Dental College, Pune', year: 2014 },
      { degree: 'MDS Pediatric Dentistry', institution: 'Bharati Vidyapeeth Dental College, Pune', year: 2017 },
    ],
    experienceYears: 7,
    languages: ['English', 'Hindi', 'Marathi'],
    qualifications: ['BDS', 'MDS Pediatric Dentistry'],
    achievements: ['Child-friendly clinic award 2022', 'Nitrous oxide sedation certified'],
    acceptingNewPatients: true,
  },
};

// ── New doctors to create (only for specializations with no existing doctor) ──

const NEW_DOCTORS = {
  'Oral Surgery': {
    name: 'Arjun Deshmukh',
    email: 'arjun.deshmukh@bestoclinic.com',
    phone: '9876543006',
    consultationFee: 1500,
  },
  Prosthodontics: {
    name: 'Kavitha Nair',
    email: 'kavitha.nair@bestoclinic.com',
    phone: '9876543007',
    consultationFee: 1100,
  },
  'Pediatric Dentistry': {
    name: 'Meera Joshi',
    email: 'meera.joshi@bestoclinic.com',
    phone: '9876543008',
    consultationFee: 600,
  },
};

// ── Department code map ──

const DEPT_CODES = {
  'General Dentistry': 'GEN-DENT',
  Periodontics: 'PERIO',
  Orthodontics: 'ORTHO',
  'Cosmetic Dentistry': 'COSM-DENT',
  Endodontics: 'ENDO',
  'Oral Surgery': 'ORAL-SURG',
  Prosthodontics: 'PROSTH',
  'Pediatric Dentistry': 'PEDO',
};

// ── Main ──────────────────────────────────────────────────

async function seed() {
  const env = require('../src/config/env');

  // ── 1. Connect to platform DB & find clinic ───────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  require('../src/models/platform/FeaturedDoctor');
  const Clinic = mongoose.model('Clinic');
  const FeaturedDoctor = mongoose.model('FeaturedDoctor');

  const clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic || !clinic.dbUri) {
    console.error(`Tenant "${SLUG}" not found`);
    process.exit(1);
  }
  console.log(`Found tenant: ${clinic.name} (${SLUG})\n`);

  // ── 2. Connect to tenant DB ───────────────────────────
  const tenantConn = await mongoose.createConnection(clinic.dbUri, {
    maxPoolSize: 2,
  }).asPromise();

  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log(`Connected to tenant DB (${Object.keys(tenantConn.models).length} models)\n`);

  const User = tenantConn.model('User');
  const Branch = tenantConn.model('Branch');
  const Department = tenantConn.model('Department');

  // ── 3. Fix department name mismatches ──────────────────
  console.log('--- Department fixes ---');
  for (const [oldName, newName] of Object.entries(DEPT_NAME_FIXES)) {
    if (!newName) continue; // skip null entries
    const dept = await Department.findOne({ name: oldName, deletedAt: null });
    if (dept) {
      const newCode = DEPT_CODES[newName] || dept.code;
      dept.name = newName;
      dept.code = newCode;
      await dept.save();
      console.log(`  Fixed department: "${oldName}" -> "${newName}" (code: ${newCode})`);
    }
  }

  // ── 4. Fix doctor specialization mismatches ────────────
  console.log('\n--- Doctor specialization fixes ---');
  const doctors = await User.find({ role: 'doctor', deletedAt: null });

  for (const doc of doctors) {
    if (doc.specialization && SPEC_FIXES[doc.specialization]) {
      const oldSpec = doc.specialization;
      doc.specialization = SPEC_FIXES[oldSpec];
      await doc.save();
      console.log(`  Fixed "${doc.name}": "${oldSpec}" -> "${doc.specialization}"`);
    }
  }

  // ── 5. Reload doctors after fixes and map by specialization ──
  const allDoctors = await User.find({ role: 'doctor', deletedAt: null });
  const specToDoctors = {};
  for (const doc of allDoctors) {
    if (doc.specialization) {
      const spec = doc.specialization.trim();
      if (!specToDoctors[spec]) specToDoctors[spec] = [];
      specToDoctors[spec].push(doc);
    }
  }

  console.log('\n--- Current doctor coverage ---');
  for (const spec of AI_SPECIALIZATIONS) {
    const docs = specToDoctors[spec] || [];
    if (docs.length > 0) {
      console.log(`  ${spec}: ${docs.map((d) => d.name).join(', ')}`);
    } else {
      console.log(`  ${spec}: MISSING — will create`);
    }
  }

  // ── 6. Get a branch for new doctors ────────────────────
  let branch = await Branch.findOne({ deletedAt: null });
  if (!branch) {
    branch = await Branch.create({
      name: `${clinic.name} — Main Branch`,
      code: 'MAIN',
      address: clinic.address || { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
      phone: clinic.phone || '9876543210',
      email: clinic.email || `admin@${SLUG}.com`,
      isActive: true,
    });
    console.log(`\nCreated branch: ${branch.name}`);
  }

  // ── 7. Ensure departments exist for all specializations ──
  console.log('\n--- Ensuring departments ---');
  const existingDepts = await Department.find({ deletedAt: null }).lean();
  const deptByName = {};
  for (const d of existingDepts) deptByName[d.name] = d;

  for (const spec of AI_SPECIALIZATIONS) {
    const code = DEPT_CODES[spec];
    if (deptByName[spec]) {
      console.log(`  ${spec} (${code}): exists`);
    } else {
      const dept = await Department.create({
        name: spec,
        code,
        branch: branch._id,
        description: `${spec} department`,
        isActive: true,
      });
      deptByName[spec] = dept;
      console.log(`  ${spec} (${code}): created`);
    }
  }

  // ── 8. Add doctorProfile to existing doctors + create missing doctors ──
  console.log('\n--- Updating / creating doctors ---');
  const hashedPassword = await bcrypt.hash('Doctor@123', 10);
  const doctorsToFeature = [];

  for (const spec of AI_SPECIALIZATIONS) {
    const existing = specToDoctors[spec];
    const dept = deptByName[spec];
    const profile = PROFILE_DEFAULTS[spec];

    if (existing && existing.length > 0) {
      // Use the first doctor for this specialization
      const doc = existing[0];
      let updated = false;

      // Add doctorProfile if missing or empty
      if (!doc.doctorProfile || !doc.doctorProfile.bio) {
        doc.doctorProfile = profile;
        updated = true;
      }

      // Set consultation fee if missing
      if (!doc.consultationFee) {
        doc.consultationFee = NEW_DOCTORS[spec]?.consultationFee || 800;
        updated = true;
      }

      // Ensure department is set
      if (!doc.department && dept) {
        doc.department = dept._id;
        updated = true;
      }

      // Ensure branch is set
      if (!doc.branch) {
        doc.branch = branch._id;
        updated = true;
      }

      doc.isFeaturedOnPlatform = true;

      if (updated) {
        await doc.save();
        console.log(`  ${spec}: Updated "${doc.name}" with profile + featured flag`);
      } else {
        doc.isFeaturedOnPlatform = true;
        await doc.save();
        console.log(`  ${spec}: "${doc.name}" already has profile, set featured flag`);
      }

      doctorsToFeature.push(doc);
    } else {
      // Create new doctor for this specialization
      const newDoc = NEW_DOCTORS[spec];
      if (!newDoc) {
        console.log(`  ${spec}: SKIPPED — no seed data defined`);
        continue;
      }

      const doctor = await User.create({
        name: newDoc.name,
        email: newDoc.email,
        phone: newDoc.phone,
        password: hashedPassword,
        role: 'doctor',
        isActive: true,
        branch: branch._id,
        department: dept?._id,
        specialization: spec,
        consultationFee: newDoc.consultationFee,
        doctorProfile: profile,
        isFeaturedOnPlatform: true,
      });
      console.log(`  ${spec}: Created "${doctor.name}"`);
      doctorsToFeature.push(doctor);
    }
  }

  // ── 9. Create FeaturedDoctor records in platform DB ────
  console.log('\n--- Featuring doctors on platform ---');
  let created = 0;
  let updated = 0;

  for (const doctor of doctorsToFeature) {
    const specializations = doctor.specialization.includes(',')
      ? doctor.specialization.split(',').map((s) => s.trim())
      : [doctor.specialization.trim()];

    const payload = {
      clinicId: clinic._id,
      clinicSlug: SLUG,
      clinicName: clinic.name,
      clinicLogo: clinic.logo || '',
      clinicCity: clinic.address?.city || '',
      tenantDoctorId: String(doctor._id),
      name: doctor.name,
      avatar: doctor.avatar || '',
      specializations,
      bio: doctor.doctorProfile?.bio || '',
      education: doctor.doctorProfile?.education || [],
      experienceYears: doctor.doctorProfile?.experienceYears || 0,
      qualifications: doctor.doctorProfile?.qualifications || [],
      languages: doctor.doctorProfile?.languages || [],
      consultationFee: doctor.consultationFee || 0,
      acceptingNewPatients: doctor.doctorProfile?.acceptingNewPatients ?? true,
      averageRating: 0,
      totalReviews: 0,
      isActive: true,
      publishedAt: new Date(),
      deletedAt: null,
    };

    const result = await FeaturedDoctor.findOneAndUpdate(
      { clinicSlug: SLUG, tenantDoctorId: String(doctor._id) },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
      console.log(`  + ${doctor.name} (${specializations.join(', ')})`);
    } else {
      updated++;
      console.log(`  ~ ${doctor.name} (${specializations.join(', ')}) — updated`);
    }
  }

  console.log(`\nFeatured: ${created} new, ${updated} updated`);

  // ── 10. Verify ─────────────────────────────────────────
  const total = await FeaturedDoctor.countDocuments({
    clinicSlug: SLUG,
    isActive: true,
    deletedAt: null,
  });
  const specs = await FeaturedDoctor.distinct('specializations', {
    clinicSlug: SLUG,
    isActive: true,
    deletedAt: null,
  });

  console.log(`\n=== Verification ===`);
  console.log(`  Total featured doctors for ${SLUG}: ${total}`);
  console.log(`  Specializations covered: ${specs.join(', ')}`);

  const missing = AI_SPECIALIZATIONS.filter((s) => !specs.includes(s));
  if (missing.length > 0) {
    console.log(`  MISSING specializations: ${missing.join(', ')}`);
  } else {
    console.log(`  All 8 AI specializations covered!`);
  }

  console.log(`\n  New doctor password: Doctor@123`);

  // ── Cleanup ────────────────────────────────────────────
  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\nDone!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
