'use strict';

/**
 * Seed script — Jathar Dental Clinic (Pune)
 *
 * Populates both platform DB and tenant DB with ultra-realistic dental clinic
 * data spanning 8 months of operation: 120+ patients, 500+ appointments,
 * full payroll, inventory, billing, and clinical records.
 *
 * Usage:
 *   node scripts/seed-jathar-clinic.js
 *
 * Prerequisites:
 *   - Platform DB must have 'jathar-dental' clinic record with valid dbUri
 *   - .env must be configured with PLATFORM_DB_URI
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SLUG = 'jathar-dental';
const CLINIC_OPENED = new Date();
CLINIC_OPENED.setMonth(CLINIC_OPENED.getMonth() - 8);
CLINIC_OPENED.setDate(1);

// ═══════════════════════════════════════════════════════════════════════════
//  HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const oid = () => new mongoose.Types.ObjectId();

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function randomPunePhone() {
  const prefix = pick(['98', '97', '96', '95', '91', '90', '88', '87', '86', '85']);
  return prefix + String(randomInt(10000000, 99999999));
}

const PUNE_AREAS = [
  'Kothrud', 'Deccan Gymkhana', 'Sadashiv Peth', 'Narayan Peth', 'Karve Nagar',
  'Baner', 'Aundh', 'Pashan', 'Sinhagad Road', 'Katraj', 'Warje', 'Bavdhan',
  'FC Road', 'JM Road', 'Shivajinagar', 'Erandwane', 'Prabhat Road', 'Law College Road',
  'Model Colony', 'Viman Nagar', 'Koregaon Park', 'Kalyani Nagar', 'Hadapsar',
  'Paud Road', 'Bibwewadi', 'Dhankawadi', 'Sahakar Nagar', 'Tilak Road',
];

function randomPuneAddress() {
  const area = pick(PUNE_AREAS);
  const flatNo = randomInt(1, 999);
  const streets = ['Main Road', 'Lane', 'Galli', 'Path', 'Marg', 'Nagar Road'];
  return {
    street: `Flat ${flatNo}, ${pick(['Sai', 'Ganesh', 'Shree', 'Om', 'Shanti', 'Vastu', 'Krishna', 'Aarti'])} Residency, ${area} ${pick(streets)}`,
    city: 'Pune',
    state: 'Maharashtra',
    zipCode: `41100${randomInt(1, 9)}`,
    country: 'IN',
  };
}

const MALE_FIRST = [
  'Aarav', 'Arjun', 'Aditya', 'Akash', 'Amit', 'Aniket', 'Atharva', 'Chinmay',
  'Darshan', 'Ganesh', 'Harshad', 'Jayesh', 'Karan', 'Kunal', 'Manish', 'Mayank',
  'Nikhil', 'Omkar', 'Pranav', 'Rahul', 'Rajesh', 'Rohan', 'Sachin', 'Sagar',
  'Sahil', 'Sandeep', 'Saurabh', 'Shubham', 'Suresh', 'Tushar', 'Varun', 'Vikram',
  'Vinay', 'Yash', 'Tejas', 'Pratik', 'Swapnil', 'Abhishek', 'Hemant', 'Gaurav',
  'Amol', 'Nilesh', 'Pankaj', 'Mahesh', 'Deepak', 'Vikas', 'Ravi', 'Shreyas',
];

const FEMALE_FIRST = [
  'Ananya', 'Aarti', 'Aditi', 'Anjali', 'Ashwini', 'Bhavana', 'Chitra', 'Deepa',
  'Gauri', 'Harshada', 'Isha', 'Jyoti', 'Kavita', 'Komal', 'Madhuri', 'Manasi',
  'Neha', 'Pallavi', 'Pooja', 'Prachi', 'Prajakta', 'Priyanka', 'Radhika', 'Renuka',
  'Rutuja', 'Sakshi', 'Sanika', 'Sayali', 'Shreya', 'Sneha', 'Sonali', 'Supriya',
  'Swati', 'Tanvi', 'Vaishali', 'Varsha', 'Vidya', 'Yogita', 'Aparna', 'Sonal',
  'Meera', 'Rani', 'Sunita', 'Anita', 'Shweta', 'Dipti', 'Nandini', 'Archana',
];

const CHILD_MALE = ['Aarav', 'Vihaan', 'Aditya', 'Aryan', 'Atharva', 'Shaurya', 'Reyansh', 'Vivaan', 'Parth', 'Rudra', 'Advait', 'Kabir', 'Dhruv', 'Arnav', 'Ishan'];
const CHILD_FEMALE = ['Aarohi', 'Anvi', 'Myra', 'Saanvi', 'Diya', 'Aanya', 'Ira', 'Navya', 'Avni', 'Kiara', 'Riya', 'Sara', 'Mira', 'Tara', 'Nisha'];

const SURNAMES = [
  'Joshi', 'Kulkarni', 'Deshmukh', 'Patil', 'Pawar', 'Shinde', 'Jadhav', 'More',
  'Gaikwad', 'Bhosale', 'Kale', 'Wagh', 'Kadam', 'Mane', 'Thorat', 'Khare',
  'Deshpande', 'Gokhale', 'Phadke', 'Apte', 'Sathe', 'Kelkar', 'Naik', 'Sane',
  'Chavan', 'Salunkhe', 'Bhandari', 'Lele', 'Ranade', 'Panse', 'Gadgil', 'Marathe',
  'Dharmadhikari', 'Phadnis', 'Dixit', 'Limaye', 'Ghate', 'Barve', 'Agashe', 'Damle',
];

function randomName(gender, isChild = false) {
  const first = isChild
    ? (gender === 'male' ? pick(CHILD_MALE) : pick(CHILD_FEMALE))
    : (gender === 'male' ? pick(MALE_FIRST) : pick(FEMALE_FIRST));
  return `${first} ${pick(SURNAMES)}`;
}

function randomBloodGroup() {
  return pickWeighted([
    { value: 'B+', weight: 35 }, { value: 'O+', weight: 30 }, { value: 'A+', weight: 20 },
    { value: 'AB+', weight: 8 }, { value: 'B-', weight: 3 }, { value: 'O-', weight: 2 },
    { value: 'A-', weight: 1 }, { value: 'AB-', weight: 1 },
  ]);
}

function randomDOB(minAge, maxAge) {
  const age = randomInt(minAge, maxAge);
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(randomInt(0, 11));
  d.setDate(randomInt(1, 28));
  return d;
}

function randomWeekdayInMonth(monthOffset) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthOffset);
  d.setDate(randomInt(1, 28));
  // Ensure weekday
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  // Random hour between 9 and 17
  d.setHours(randomInt(9, 17), pick([0, 15, 30, 45]), 0, 0);
  return d;
}

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 12);
}

const DOCTOR_PW = hashPassword('Doctor@2025');
const STAFF_PW = hashPassword('Staff@2025');

// Dental-specific data helpers
const DENTAL_REASONS = [
  'Toothache - upper right', 'Toothache - lower left', 'Routine dental checkup',
  'Sensitivity to hot and cold', 'Bleeding gums', 'Wisdom tooth pain',
  'Broken tooth', 'Cavity filling needed', 'Crown replacement',
  'Braces consultation', 'Teeth whitening consultation', 'Gum swelling',
  'Bad breath concern', 'Loose tooth', 'Jaw pain', 'Dental implant consultation',
  'Follow-up after root canal', 'Braces tightening', 'Denture adjustment',
  'Tooth extraction follow-up', 'Scaling and cleaning appointment',
  'Chipped front tooth', 'Pain while chewing', 'Swollen face - dental abscess',
  'Child regular dental checkup', 'Child toothache', 'Space maintainer check',
  'Orthodontic review', 'Post-surgical follow-up', 'Veneer consultation',
];

const DENTAL_DIAGNOSES = [
  'Dental caries in tooth 36', 'Dental caries in tooth 46', 'Dental caries in tooth 26',
  'Irreversible pulpitis tooth 46', 'Irreversible pulpitis tooth 36',
  'Reversible pulpitis tooth 15', 'Periapical abscess tooth 21',
  'Impacted third molar 38', 'Impacted third molar 48', 'Partially erupted 28',
  'Class II malocclusion', 'Class I malocclusion with crowding',
  'Chronic generalized periodontitis', 'Localized aggressive periodontitis',
  'Gingivitis', 'Gingival recession tooth 31', 'Fractured tooth 11',
  'Fractured cusp tooth 36', 'Missing tooth 46 (edentulous space)',
  'Missing teeth 36, 46', 'Attrition of anterior teeth',
  'Dental fluorosis (mild)', 'Tooth erosion from GERD',
  'Early childhood caries (multiple teeth)', 'Mesiodens (supernumerary tooth)',
  'Tongue tie (ankyloglossia)', 'TMJ dysfunction',
];

const DENTAL_TREATMENTS = [
  'Composite restoration Class I', 'Composite restoration Class II',
  'Glass ionomer restoration', 'Root canal treatment - single canal',
  'Root canal treatment - multi canal', 'Access opening and pulp extirpation',
  'Obturation with gutta percha', 'Surgical extraction under LA',
  'Simple extraction under LA', 'Scaling and root planing (full mouth)',
  'Supragingival scaling', 'Crown preparation (PFM)', 'Crown preparation (Zirconia)',
  'Crown cementation', 'Metal braces bonding (full arch)',
  'Ceramic braces bonding (full arch)', 'Archwire change and adjustment',
  'In-office teeth whitening (Zoom)', 'Fluoride varnish application',
  'Pit and fissure sealant application', 'Pulpotomy - primary tooth',
  'Space maintainer placement', 'Implant placement (stage 1)',
  'Flap surgery with bone grafting', 'Porcelain veneer preparation',
  'Complete denture impression', 'Night guard fabrication',
];

const DENTAL_MEDICATIONS = [
  { name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times a day', duration: '5 days', instructions: 'After meals' },
  { name: 'Augmentin', dosage: '625mg', frequency: 'Twice a day', duration: '5 days', instructions: 'After meals' },
  { name: 'Ibuprofen', dosage: '400mg', frequency: 'Three times a day', duration: '3 days', instructions: 'After meals, with water' },
  { name: 'Metronidazole', dosage: '400mg', frequency: 'Three times a day', duration: '5 days', instructions: 'After meals, avoid alcohol' },
  { name: 'Diclofenac Sodium', dosage: '50mg', frequency: 'Twice a day', duration: '3 days', instructions: 'After meals' },
  { name: 'Paracetamol', dosage: '650mg', frequency: 'Three times a day', duration: '3 days', instructions: 'As needed for pain' },
  { name: 'Chlorhexidine Mouthwash', dosage: '0.2%', frequency: 'Twice a day', duration: '14 days', instructions: 'Rinse for 30 seconds after brushing' },
  { name: 'Ornidazole', dosage: '500mg', frequency: 'Twice a day', duration: '5 days', instructions: 'After meals' },
  { name: 'Aceclofenac + Paracetamol', dosage: '100mg+325mg', frequency: 'Twice a day', duration: '5 days', instructions: 'After meals' },
  { name: 'Pantoprazole', dosage: '40mg', frequency: 'Once a day', duration: '5 days', instructions: 'Before breakfast' },
  { name: 'Fluconazole', dosage: '150mg', frequency: 'Once a day', duration: '7 days', instructions: 'After meals' },
  { name: 'Betadine Gargle', dosage: '2%', frequency: 'Three times a day', duration: '5 days', instructions: 'Dilute and gargle' },
];

const CANCEL_REASONS = [
  'Patient requested cancellation', 'Personal emergency', 'Feeling unwell',
  'Travel plans changed', 'Weather conditions', 'Work conflict',
  'Rescheduled to different date', 'Doctor unavailable', 'Found another provider',
];

const REVIEW_COMMENTS = [
  'Excellent treatment! Very professional and caring.',
  'The doctor explained everything clearly. Very satisfied.',
  'Painless root canal treatment. Highly recommended.',
  'Great clinic with modern equipment. Very clean.',
  'The staff was very friendly and helpful.',
  'My child was comfortable throughout the treatment. Thank you!',
  'Best dental clinic in Pune. Dr. Jathar is amazing.',
  'Quick and efficient service. No unnecessary waiting.',
  'Very good experience with braces treatment.',
  'The doctor is very patient and listens carefully.',
  'Professional approach, good results. Will visit again.',
  'Affordable pricing for quality dental care.',
  'The scaling was thorough and painless.',
  'Got my wisdom tooth removed here. Quick recovery.',
  'The implant procedure was smooth. Very happy with results.',
  'Good follow-up care after treatment.',
  'Clean and hygienic clinic. Modern dental chairs.',
  'Dr. Kulkarni is excellent with orthodontic treatment.',
  'The emergency dental care was prompt and effective.',
  'Satisfied with the crown fitting. Looks natural.',
  'Reasonable waiting time compared to other clinics.',
  'The tooth extraction was quick and painless.',
  'Good experience overall. Parking could be better.',
  'The receptionist was very cooperative in scheduling.',
  'Five stars for the dental care quality here.',
  'My entire family visits this clinic. Trustworthy.',
  'The whitening treatment gave great results.',
  'Dr. Patil is an expert in root canal treatment.',
  'Gentle and caring treatment for my elderly mother.',
  'The clinic follows proper sterilization protocols.',
];

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function seed() {
  const env = require('../src/config/env');

  // ── 1. Connect to platform DB ──────────────────────────────────────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  require('../src/models/platform/Subscription');
  require('../src/models/platform/PlatformUser');
  require('../src/models/platform/Plan');
  require('../src/models/platform/UserDirectory');
  require('../src/models/platform/PlatformPatient');
  require('../src/models/platform/FeaturedDoctor');
  const Clinic = mongoose.model('Clinic');
  const Subscription = mongoose.model('Subscription');
  const UserDirectory = mongoose.model('UserDirectory');
  const PlatformPatient = mongoose.model('PlatformPatient');
  const FeaturedDoctor = mongoose.model('FeaturedDoctor');
  const Plan = mongoose.model('Plan');

  console.log('✅ Connected to Platform DB');

  // ── 2. Find or create clinic ─────────────────────────────────────────
  let clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();

  if (!clinic) {
    console.log(`ℹ️  Clinic "${SLUG}" not found. Creating...`);
    const tenantDbName = `bestoclinic_${SLUG.replace(/-/g, '_')}`;
    const dbUri = env.PLATFORM_DB_URI.replace(/\/[^/]+\?/, `/${tenantDbName}?`);

    const created = await Clinic.create({
      name: 'Jathar Dental Clinic',
      slug: SLUG,
      email: 'info@jathardental.in',
      phone: '020-25674321',
      clinicCode: 'JATHR4521',
      dbUri,
      status: 'active',
      activatedAt: CLINIC_OPENED,
      address: {
        street: '2nd Floor, Sagar Arcade, FC Road',
        locality: 'Deccan Gymkhana',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411004',
        country: 'IN',
      },
      location: { type: 'Point', coordinates: [73.8408, 18.5167] },
      registrationSource: 'self_service',
      subscription: {
        plan: 'professional',
        status: 'active',
        currentPeriodEnd: daysFromNow(30),
      },
      features: {
        maxDoctors: 10, maxStaff: 30, maxBranches: 3,
        maxStorageMB: 10240, maxSmsPerMonth: 2000,
        smsEnabled: true, teleHealthEnabled: true, customBranding: true,
      },
    });
    clinic = await Clinic.findById(created._id).select('+dbUri').lean();
    console.log(`✅ Clinic created: ${clinic.name} (${SLUG})`);
  } else {
    console.log(`✅ Found existing clinic: ${clinic.name} (${SLUG})`);
  }

  // Find Professional plan
  const proPlan = await Plan.findOne({ slug: 'professional' }).lean();

  // ── 3. Connect to tenant DB ────────────────────────────────────────────
  const tenantConn = await mongoose.createConnection(clinic.dbUri, {
    maxPoolSize: 5,
  }).asPromise();

  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log(`✅ Connected to tenant DB — ${Object.keys(tenantConn.models).length} models`);

  // Get all tenant model references
  const User = tenantConn.model('User');
  const Patient = tenantConn.model('Patient');
  const Branch = tenantConn.model('Branch');
  const Department = tenantConn.model('Department');
  const ConsultationRoom = tenantConn.model('ConsultationRoom');
  const DoctorSchedule = tenantConn.model('DoctorSchedule');
  const DoctorScheduleOverride = tenantConn.model('DoctorScheduleOverride');
  const DoctorLeave = tenantConn.model('DoctorLeave');
  const Appointment = tenantConn.model('Appointment');
  const QueueEntry = tenantConn.model('QueueEntry');
  const TreatmentRecord = tenantConn.model('TreatmentRecord');
  const Prescription = tenantConn.model('Prescription');
  const PrescriptionTask = tenantConn.model('PrescriptionTask');
  const CareReminder = tenantConn.model('CareReminder');
  const Invoice = tenantConn.model('Invoice');
  const Payment = tenantConn.model('Payment');
  const PatientLedger = tenantConn.model('PatientLedger');
  const FinancialAuditLog = tenantConn.model('FinancialAuditLog');
  const InsuranceProvider = tenantConn.model('InsuranceProvider');
  const InsuranceClaim = tenantConn.model('InsuranceClaim');
  const InventoryItem = tenantConn.model('InventoryItem');
  const InventoryTransaction = tenantConn.model('InventoryTransaction');
  const ProcedureTemplate = tenantConn.model('ProcedureTemplate');
  const SalaryStructure = tenantConn.model('SalaryStructure');
  const Payslip = tenantConn.model('Payslip');
  const ServiceItem = tenantConn.model('ServiceItem');
  const Notification = tenantConn.model('Notification');
  const Review = tenantConn.model('Review');
  const DentalScan = tenantConn.model('DentalScan');
  const DentalScanResult = tenantConn.model('DentalScanResult');
  const Consent = tenantConn.model('Consent');

  // ── 4. Clear existing tenant data (idempotent) ─────────────────────────
  console.log('🧹 Clearing existing tenant data...');
  const allCollections = Object.keys(tenantConn.models);
  for (const modelName of allCollections) {
    try {
      await tenantConn.model(modelName).deleteMany({});
    } catch (e) { /* collection may not exist */ }
  }
  // Drop problematic unique partial indexes that conflict with null values
  try {
    await tenantConn.collection('treatmentrecords').dropIndex('externalId_1_externalSource_1');
  } catch (e) { /* index may not exist */ }
  try {
    await tenantConn.collection('patients').dropIndex('externalId_1_externalSource_1');
  } catch (e) { /* index may not exist */ }
  console.log('🧹 Cleared all tenant collections');

  // Also clear platform cross-references for this clinic
  await UserDirectory.deleteMany({ tenantSlug: SLUG });
  await PlatformPatient.deleteMany({ 'connectedClinics.tenantSlug': SLUG });
  await FeaturedDoctor.deleteMany({ clinicSlug: SLUG });

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — ORGANIZATIONAL STRUCTURE
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n📦 Phase 2: Organizational Structure...');

  // ── 2a. Branches ───────────────────────────────────────────────────────
  const branchFCId = oid();
  const branchKTId = oid();

  const branches = await Branch.insertMany([
    {
      _id: branchFCId,
      name: 'Jathar Dental — FC Road (Main)',
      code: 'JDFC',
      address: { street: '2nd Floor, Sagar Arcade, FC Road', city: 'Pune', state: 'Maharashtra', zipCode: '411004', country: 'IN' },
      phone: '020-25674321',
      email: 'fcroad@jathardental.in',
      operatingHours: [
        { day: 'monday', openTime: '09:00', closeTime: '20:00', isClosed: false },
        { day: 'tuesday', openTime: '09:00', closeTime: '20:00', isClosed: false },
        { day: 'wednesday', openTime: '09:00', closeTime: '20:00', isClosed: false },
        { day: 'thursday', openTime: '09:00', closeTime: '20:00', isClosed: false },
        { day: 'friday', openTime: '09:00', closeTime: '20:00', isClosed: false },
        { day: 'saturday', openTime: '09:00', closeTime: '20:00', isClosed: false },
        { day: 'sunday', openTime: '09:00', closeTime: '20:00', isClosed: true },
      ],
      isActive: true,
    },
    {
      _id: branchKTId,
      name: 'Jathar Dental — Kothrud',
      code: 'JDKT',
      address: { street: 'Shop 5, Paud Road, Near Dahanukar Colony', city: 'Pune', state: 'Maharashtra', zipCode: '411038', country: 'IN' },
      phone: '020-25384567',
      email: 'kothrud@jathardental.in',
      operatingHours: [
        { day: 'monday', openTime: '10:00', closeTime: '18:00', isClosed: false },
        { day: 'tuesday', openTime: '10:00', closeTime: '18:00', isClosed: false },
        { day: 'wednesday', openTime: '10:00', closeTime: '18:00', isClosed: false },
        { day: 'thursday', openTime: '10:00', closeTime: '18:00', isClosed: false },
        { day: 'friday', openTime: '10:00', closeTime: '18:00', isClosed: false },
        { day: 'saturday', openTime: '10:00', closeTime: '14:00', isClosed: false },
        { day: 'sunday', openTime: '10:00', closeTime: '14:00', isClosed: true },
      ],
      isActive: true,
    },
  ]);
  console.log(`  ✅ ${branches.length} branches created`);

  // ── 2b. Users (doctors + staff) ────────────────────────────────────────
  // Pre-generate IDs for cross-referencing
  const doctorIds = { jathar: oid(), kulkarni: oid(), patil: oid(), deshmukh: oid(), joshi: oid(), nair: oid(), sharma: oid(), patwardhan: oid() };
  const staffIds = { vishal: oid(), snehal: oid(), pooja: oid(), rajesh: oid(), anita: oid(), sunita: oid(), mangesh: oid(), rahul: oid(), prashant: oid(), nilesh: oid(), swati: oid(), deepak: oid() };
  // Pre-generate department IDs so doctors can reference them at creation time
  const deptIds = { gen: oid(), ortho: oid(), endo: oid(), surg: oid(), pedo: oid(), pros: oid(), cosm: oid() };

  const doctors = [
    {
      _id: doctorIds.jathar, name: 'Dr. Sandeep Jathar', email: 'dr.sandeep@jathardental.in',
      phone: '9822345678', password: DOCTOR_PW, role: 'super_admin', branch: branchFCId,
      department: deptIds.gen, specialization: 'General Dentistry', licenseNumber: 'MH-DEN-2008-4521',
      consultationFee: 1200, employeeId: 'JDC-D001', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Founder and chief dentist at Jathar Dental Clinic with 16 years of experience in comprehensive dental care. Specializes in full-mouth rehabilitation and cosmetic dentistry.',
        education: [
          { degree: 'BDS', institution: 'Government Dental College, Pune', year: 2008 },
          { degree: 'MDS (Conservative Dentistry)', institution: 'Savitribai Phule Pune University', year: 2011 },
        ],
        experienceYears: 16, languages: ['English', 'Hindi', 'Marathi'],
        qualifications: ['BDS', 'MDS Conservative Dentistry'], achievements: ['8000+ patients treated', 'IDA Pune Branch President 2022', 'Best Dentist Award - Pune Medical Association 2023'],
        acceptingNewPatients: true,
      },
      isFeaturedOnPlatform: true,
    },
    {
      _id: doctorIds.kulkarni, name: 'Dr. Priya Kulkarni', email: 'dr.priya@jathardental.in',
      phone: '9823456789', password: DOCTOR_PW, role: 'doctor', branch: branchFCId,
      department: deptIds.ortho, specialization: 'Orthodontics', licenseNumber: 'MH-DEN-2012-7834',
      consultationFee: 1000, employeeId: 'JDC-D002', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Experienced orthodontist specializing in metal and ceramic braces, Invisalign, and jaw alignment correction. Treats patients of all ages.',
        education: [
          { degree: 'BDS', institution: 'Bharati Vidyapeeth Dental College, Pune', year: 2012 },
          { degree: 'MDS (Orthodontics)', institution: 'SPPU, Pune', year: 2015 },
        ],
        experienceYears: 11, languages: ['English', 'Hindi', 'Marathi'],
        qualifications: ['BDS', 'MDS Orthodontics'], achievements: ['Invisalign Certified Provider', '2000+ orthodontic cases'],
        acceptingNewPatients: true,
      },
      isFeaturedOnPlatform: true,
    },
    {
      _id: doctorIds.patil, name: 'Dr. Vikram Patil', email: 'dr.vikram@jathardental.in',
      phone: '9834567890', password: DOCTOR_PW, role: 'doctor', branch: branchFCId,
      department: deptIds.endo, specialization: 'Endodontics', licenseNumber: 'MH-DEN-2014-3256',
      consultationFee: 900, employeeId: 'JDC-D003', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Root canal specialist with expertise in single-visit RCT and rotary endodontics. Known for painless treatments.',
        education: [
          { degree: 'BDS', institution: 'Government Dental College, Pune', year: 2014 },
          { degree: 'MDS (Endodontics)', institution: 'KLE VK Institute, Belgaum', year: 2017 },
        ],
        experienceYears: 9, languages: ['English', 'Hindi', 'Marathi', 'Kannada'],
        qualifications: ['BDS', 'MDS Endodontics'], achievements: ['3000+ root canals performed', 'Advanced Rotary Endo Certification'],
        acceptingNewPatients: true,
      },
      isFeaturedOnPlatform: true,
    },
    {
      _id: doctorIds.deshmukh, name: 'Dr. Arjun Deshmukh', email: 'dr.arjun@jathardental.in',
      phone: '9845678901', password: DOCTOR_PW, role: 'doctor', branch: branchFCId,
      department: deptIds.surg, specialization: 'Oral Surgery', licenseNumber: 'MH-DEN-2010-9178',
      consultationFee: 1500, employeeId: 'JDC-D004', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Oral and maxillofacial surgeon specializing in impaction surgeries, implant placement, and facial trauma management.',
        education: [
          { degree: 'BDS', institution: 'SDM Dental College, Dharwad', year: 2010 },
          { degree: 'MDS (Oral & Maxillofacial Surgery)', institution: 'Nair Hospital, Mumbai', year: 2013 },
        ],
        experienceYears: 13, languages: ['English', 'Hindi', 'Marathi'],
        qualifications: ['BDS', 'MDS OMFS', 'FDSRCS'], achievements: ['500+ surgical procedures', 'Fellowship in Implantology (Germany)'],
        acceptingNewPatients: true,
      },
      isFeaturedOnPlatform: true,
    },
    {
      _id: doctorIds.joshi, name: 'Dr. Meera Joshi', email: 'dr.meera@jathardental.in',
      phone: '9856789012', password: DOCTOR_PW, role: 'doctor', branch: branchKTId,
      department: deptIds.pedo, specialization: 'Pediatric Dentistry', licenseNumber: 'MH-DEN-2015-5643',
      consultationFee: 600, employeeId: 'JDC-D005', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Pediatric dentist loved by children and parents alike. Specializes in child-friendly dental treatments and preventive care.',
        education: [
          { degree: 'BDS', institution: 'M.A. Rangoonwala Dental College, Pune', year: 2015 },
          { degree: 'MDS (Pediatric Dentistry)', institution: 'Bharati Vidyapeeth, Pune', year: 2018 },
        ],
        experienceYears: 8, languages: ['English', 'Hindi', 'Marathi'],
        qualifications: ['BDS', 'MDS Pediatric Dentistry'], achievements: ['Child-friendly Clinic Award 2023', 'ISPPD Member'],
        acceptingNewPatients: true,
      },
      isFeaturedOnPlatform: true,
    },
    {
      _id: doctorIds.nair, name: 'Dr. Kavitha Nair', email: 'dr.kavitha@jathardental.in',
      phone: '9867890123', password: DOCTOR_PW, role: 'doctor', branch: branchFCId,
      department: deptIds.pros, specialization: 'Prosthodontics', licenseNumber: 'MH-DEN-2013-8412',
      consultationFee: 1100, employeeId: 'JDC-D006', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Prosthodontist specializing in crowns, bridges, dentures, and CAD/CAM restorations. Expert in full-mouth rehabilitation.',
        education: [
          { degree: 'BDS', institution: 'Saveetha Dental College, Chennai', year: 2013 },
          { degree: 'MDS (Prosthodontics)', institution: 'Government Dental College, Trivandrum', year: 2016 },
        ],
        experienceYears: 10, languages: ['English', 'Hindi', 'Marathi', 'Malayalam'],
        qualifications: ['BDS', 'MDS Prosthodontics'], achievements: ['CAD/CAM Certified', 'CEREC Practitioner'],
        acceptingNewPatients: true,
      },
    },
    {
      _id: doctorIds.sharma, name: 'Dr. Rohit Sharma', email: 'dr.rohit@jathardental.in',
      phone: '9878901234', password: DOCTOR_PW, role: 'doctor', branch: branchKTId,
      department: deptIds.gen, specialization: 'General Dentistry', licenseNumber: 'MH-DEN-2016-2987',
      consultationFee: 700, employeeId: 'JDC-D007', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'General dentist at the Kothrud branch. Handles routine checkups, fillings, extractions, and preventive dental care.',
        education: [{ degree: 'BDS', institution: 'Government Dental College, Nagpur', year: 2016 }],
        experienceYears: 8, languages: ['English', 'Hindi', 'Marathi'],
        qualifications: ['BDS'], achievements: ['Advanced Restorative Dentistry Certification'],
        acceptingNewPatients: true,
      },
    },
    {
      _id: doctorIds.patwardhan, name: 'Dr. Sneha Patwardhan', email: 'dr.sneha@jathardental.in',
      phone: '9889012345', password: DOCTOR_PW, role: 'doctor', branch: branchFCId,
      department: deptIds.cosm, specialization: 'Cosmetic Dentistry', licenseNumber: 'MH-DEN-2014-6231',
      consultationFee: 1300, employeeId: 'JDC-D008', isActive: true, isEmailVerified: true,
      doctorProfile: {
        bio: 'Cosmetic dentistry specialist trained at NYU. Expert in smile makeovers, veneers, and aesthetic restorations.',
        education: [
          { degree: 'BDS', institution: 'M.A. Rangoonwala Dental College, Pune', year: 2014 },
          { degree: 'Fellowship in Cosmetic Dentistry', institution: 'New York University', year: 2017 },
        ],
        experienceYears: 9, languages: ['English', 'Hindi', 'Marathi'],
        qualifications: ['BDS', 'Fellow Cosmetic Dentistry (NYU)'], achievements: ['Hollywood Smile specialist', '500+ smile makeovers'],
        acceptingNewPatients: true,
      },
    },
  ];

  const staffMembers = [
    { _id: staffIds.vishal, name: 'Vishal Sawant', email: 'vishal@jathardental.in', phone: '9890123456', password: STAFF_PW, role: 'admin', branch: branchFCId, employeeId: 'JDC-S001', isActive: true, isEmailVerified: true },
    { _id: staffIds.snehal, name: 'Snehal Desai', email: 'snehal@jathardental.in', phone: '9801234567', password: STAFF_PW, role: 'receptionist', branch: branchFCId, employeeId: 'JDC-S002', isActive: true, isEmailVerified: true },
    { _id: staffIds.pooja, name: 'Pooja Bhosale', email: 'pooja@jathardental.in', phone: '9812345678', password: STAFF_PW, role: 'receptionist', branch: branchKTId, employeeId: 'JDC-S003', isActive: true, isEmailVerified: true },
    { _id: staffIds.rajesh, name: 'Rajesh Gaikwad', email: 'rajesh@jathardental.in', phone: '9723456789', password: STAFF_PW, role: 'billing_officer', branch: branchFCId, employeeId: 'JDC-S004', isActive: true, isEmailVerified: true },
    { _id: staffIds.anita, name: 'Anita Pawar', email: 'anita@jathardental.in', phone: '9734567890', password: STAFF_PW, role: 'support_staff', branch: branchFCId, employeeId: 'JDC-S005', isActive: true, isEmailVerified: true },
    { _id: staffIds.sunita, name: 'Sunita Jadhav', email: 'sunita@jathardental.in', phone: '9745678901', password: STAFF_PW, role: 'support_staff', branch: branchFCId, employeeId: 'JDC-S006', isActive: true, isEmailVerified: true },
    { _id: staffIds.mangesh, name: 'Mangesh Kulkarni', email: 'mangesh@jathardental.in', phone: '9756789012', password: STAFF_PW, role: 'support_staff', branch: branchKTId, employeeId: 'JDC-S007', isActive: true, isEmailVerified: true },
    { _id: staffIds.rahul, name: 'Rahul Mane', email: 'rahul@jathardental.in', phone: '9767890123', password: STAFF_PW, role: 'support_staff', branch: branchFCId, employeeId: 'JDC-S008', isActive: true, isEmailVerified: true },
    { _id: staffIds.prashant, name: 'Prashant Shinde', email: 'prashant@jathardental.in', phone: '9778901234', password: STAFF_PW, role: 'support_staff', branch: branchKTId, employeeId: 'JDC-S009', isActive: true, isEmailVerified: true },
    { _id: staffIds.nilesh, name: 'Nilesh Wagh', email: 'nilesh@jathardental.in', phone: '9789012345', password: STAFF_PW, role: 'it_support', branch: branchFCId, employeeId: 'JDC-S010', isActive: true, isEmailVerified: true },
    { _id: staffIds.swati, name: 'Swati Kale', email: 'swati@jathardental.in', phone: '9690123456', password: STAFF_PW, role: 'hr_payroll_manager', branch: branchFCId, employeeId: 'JDC-S011', isActive: true, isEmailVerified: true },
    { _id: staffIds.deepak, name: 'Deepak More', email: 'deepak@jathardental.in', phone: '9601234567', password: STAFF_PW, role: 'accountant', branch: branchFCId, employeeId: 'JDC-S012', isActive: true, isEmailVerified: true },
  ];

  await User.insertMany([...doctors, ...staffMembers]);
  const allDoctorIds = Object.values(doctorIds);
  console.log(`  ✅ ${doctors.length} doctors + ${staffMembers.length} staff created`);

  // ── 2c. Departments ────────────────────────────────────────────────────
  const departments = await Department.insertMany([
    { _id: deptIds.gen, name: 'General Dentistry', code: 'GEN', branch: branchFCId, headOfDepartment: doctorIds.jathar, isActive: true },
    { _id: deptIds.ortho, name: 'Orthodontics', code: 'ORTHO', branch: branchFCId, headOfDepartment: doctorIds.kulkarni, isActive: true },
    { _id: deptIds.endo, name: 'Endodontics', code: 'ENDO', branch: branchFCId, headOfDepartment: doctorIds.patil, isActive: true },
    { _id: deptIds.surg, name: 'Oral Surgery', code: 'SURG', branch: branchFCId, headOfDepartment: doctorIds.deshmukh, isActive: true },
    { _id: deptIds.pedo, name: 'Pediatric Dentistry', code: 'PEDO', branch: branchKTId, headOfDepartment: doctorIds.joshi, isActive: true },
    { _id: deptIds.pros, name: 'Prosthodontics', code: 'PROS', branch: branchFCId, headOfDepartment: doctorIds.nair, isActive: true },
    { _id: deptIds.cosm, name: 'Cosmetic Dentistry', code: 'COSM', branch: branchFCId, headOfDepartment: doctorIds.patwardhan, isActive: true },
  ]);
  console.log(`  ✅ ${departments.length} departments created`);

  // ── 2d. Consultation Rooms ─────────────────────────────────────────────
  const rooms = await ConsultationRoom.insertMany([
    { branch: branchFCId, name: 'Consultation Room 1', code: 'JDFC-C1', type: 'consultation', floor: 'Ground', status: 'available', isActive: true },
    { branch: branchFCId, name: 'Consultation Room 2', code: 'JDFC-C2', type: 'consultation', floor: 'Ground', status: 'available', isActive: true },
    { branch: branchFCId, name: 'Consultation Room 3', code: 'JDFC-C3', type: 'consultation', floor: 'First', status: 'available', isActive: true },
    { branch: branchFCId, name: 'Procedure Room', code: 'JDFC-P1', type: 'procedure', floor: 'First', status: 'available', isActive: true },
    { branch: branchFCId, name: 'X-Ray Room', code: 'JDFC-X1', type: 'general', floor: 'Ground', status: 'available', isActive: true },
    { branch: branchFCId, name: 'Emergency Room', code: 'JDFC-E1', type: 'emergency', floor: 'Ground', status: 'available', isActive: true },
    { branch: branchKTId, name: 'Consultation Room 1', code: 'JDKT-C1', type: 'consultation', floor: 'Ground', status: 'available', isActive: true },
    { branch: branchKTId, name: 'Consultation Room 2', code: 'JDKT-C2', type: 'consultation', floor: 'Ground', status: 'available', isActive: true },
    { branch: branchKTId, name: 'Procedure Room', code: 'JDKT-P1', type: 'procedure', floor: 'Ground', status: 'available', isActive: true },
  ]);
  console.log(`  ✅ ${rooms.length} consultation rooms created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 3 — SCHEDULING
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n📅 Phase 3: Doctor Schedules...');

  const scheduleTemplates = {
    'General Dentistry': { slotDuration: 30, start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00', satStart: '09:00', satEnd: '13:00' },
    'Orthodontics':      { slotDuration: 30, start: '09:30', end: '17:30', breakStart: '13:00', breakEnd: '13:30', satStart: null, satEnd: null },
    'Endodontics':       { slotDuration: 60, start: '09:00', end: '17:00', breakStart: '12:30', breakEnd: '13:30', satStart: '09:00', satEnd: '13:00' },
    'Oral Surgery':      { slotDuration: 60, start: '08:00', end: '16:00', breakStart: '12:00', breakEnd: '13:00', satStart: null, satEnd: null },
    'Pediatric Dentistry': { slotDuration: 20, start: '10:00', end: '17:00', breakStart: '13:00', breakEnd: '13:30', satStart: '10:00', satEnd: '14:00' },
    'Prosthodontics':    { slotDuration: 45, start: '09:00', end: '17:30', breakStart: '13:00', breakEnd: '14:00', satStart: '09:00', satEnd: '12:00' },
    'Cosmetic Dentistry': { slotDuration: 45, start: '10:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00', satStart: '10:00', satEnd: '14:00' },
  };

  const scheduleDocs = [];
  for (const doc of doctors) {
    const t = scheduleTemplates[doc.specialization] || scheduleTemplates['General Dentistry'];
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const weeklySchedule = days.map(day => {
      if (day === 'sunday') return { day, isWorking: false, startTime: '09:00', endTime: '17:00' };
      if (day === 'saturday') {
        if (!t.satStart) return { day, isWorking: false, startTime: '09:00', endTime: '17:00' };
        return { day, isWorking: true, startTime: t.satStart, endTime: t.satEnd };
      }
      return { day, isWorking: true, startTime: t.start, endTime: t.end, breakStart: t.breakStart, breakEnd: t.breakEnd };
    });
    scheduleDocs.push({
      doctor: doc._id, branch: doc.branch, slotDuration: t.slotDuration,
      bufferMinutes: 5, minNoticeMinutes: 60, maxAdvanceDays: 60,
      weeklySchedule, isActive: true,
    });
    // Dr. Kulkarni also works at Kothrud 2 days a week
    if (doc._id.equals(doctorIds.kulkarni)) {
      const ktSchedule = days.map(day => {
        if (['wednesday', 'friday'].includes(day)) return { day, isWorking: true, startTime: '10:00', endTime: '17:00', breakStart: '13:00', breakEnd: '13:30' };
        return { day, isWorking: false, startTime: '10:00', endTime: '17:00' };
      });
      scheduleDocs.push({ doctor: doc._id, branch: branchKTId, slotDuration: 30, bufferMinutes: 5, minNoticeMinutes: 60, maxAdvanceDays: 60, weeklySchedule: ktSchedule, isActive: true });
    }
  }
  await DoctorSchedule.insertMany(scheduleDocs);
  console.log(`  ✅ ${scheduleDocs.length} doctor schedules created`);

  // Schedule Overrides
  const overrides = [
    { doctor: doctorIds.jathar, branch: branchFCId, date: daysFromNow(5), type: 'day_off', reason: 'IDA Pune Branch Meeting' },
    { doctor: doctorIds.kulkarni, branch: branchFCId, date: daysFromNow(8), type: 'custom_hours', startTime: '10:00', endTime: '14:00', reason: 'CME Conference afternoon' },
    { doctor: doctorIds.patil, branch: branchFCId, date: daysFromNow(12), type: 'day_off', reason: 'Personal day' },
    { doctor: doctorIds.deshmukh, branch: branchFCId, date: daysFromNow(3), type: 'custom_hours', startTime: '08:00', endTime: '12:00', reason: 'Surgery at KEM Hospital' },
    { doctor: doctorIds.joshi, branch: branchKTId, date: daysFromNow(15), type: 'day_off', reason: 'School dental camp' },
    { doctor: doctorIds.patwardhan, branch: branchFCId, date: daysFromNow(20), type: 'custom_hours', startTime: '14:00', endTime: '20:00', reason: 'Morning workshop' },
    { doctor: doctorIds.sharma, branch: branchKTId, date: daysFromNow(7), type: 'day_off', reason: 'Family function' },
    { doctor: doctorIds.nair, branch: branchFCId, date: daysFromNow(25), type: 'extra_day', startTime: '10:00', endTime: '14:00', reason: 'Extra Sunday clinic' },
  ];
  await DoctorScheduleOverride.insertMany(overrides);
  console.log(`  ✅ ${overrides.length} schedule overrides created`);

  // Doctor Leaves
  const leaves = [
    { doctor: doctorIds.jathar, startDate: daysFromNow(18), endDate: daysFromNow(20), reason: 'Annual family vacation', leaveType: 'planned', status: 'approved' },
    { doctor: doctorIds.kulkarni, startDate: daysFromNow(28), endDate: daysFromNow(30), reason: 'IDA Annual Conference, Delhi', leaveType: 'conference', status: 'approved' },
    { doctor: doctorIds.deshmukh, startDate: daysAgo(10), endDate: daysAgo(8), reason: 'Fever and body ache', leaveType: 'sick', status: 'approved' },
    { doctor: doctorIds.joshi, startDate: daysFromNow(35), endDate: daysFromNow(40), reason: 'Brother\'s wedding in Kolhapur', leaveType: 'planned', status: 'approved' },
    { doctor: doctorIds.sharma, startDate: daysFromNow(22), endDate: daysFromNow(22), reason: 'Personal work', leaveType: 'personal', status: 'pending' },
    { doctor: doctorIds.patwardhan, startDate: daysFromNow(45), endDate: daysFromNow(50), reason: 'Advanced Aesthetic Dentistry course, Bangkok', leaveType: 'conference', status: 'approved' },
  ];
  await DoctorLeave.insertMany(leaves);
  console.log(`  ✅ ${leaves.length} doctor leaves created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 4 — PATIENTS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n👥 Phase 4: Patients...');

  const patientDocs = [];
  const patientUserDocs = [];
  const patientIds = [];
  const patientInsuranceMap = {}; // patientIdx -> { provider, policyNumber }

  const allergies = ['Penicillin', 'Latex', 'Ibuprofen', 'Aspirin', 'Sulfa drugs', 'Local anesthetic', 'Codeine'];
  const medications = ['Metformin 500mg', 'Amlodipine 5mg', 'Thyronorm 50mcg', 'Ecosprin 75mg', 'Atorvastatin 10mg', 'Telmisartan 40mg'];
  const conditions = ['Type 2 Diabetes', 'Hypertension', 'Hypothyroidism', 'Asthma', 'Heart disease', 'Anemia'];
  const insuranceProviders = ['STAR', 'ICICI', 'NIA'];

  for (let i = 0; i < 120; i++) {
    const isChild = i < 36; // first 36 are children (30%)
    const isSenior = !isChild && i >= 96; // last 24 are seniors (20%)
    const gender = i % 2 === 0 ? 'male' : 'female';
    const name = randomName(gender, isChild);

    const minAge = isChild ? 4 : (isSenior ? 55 : 18);
    const maxAge = isChild ? 14 : (isSenior ? 75 : 55);
    const dob = randomDOB(minAge, maxAge);

    const patId = oid();
    const userId = oid();
    patientIds.push(patId);

    const hasAllergy = Math.random() < 0.2;
    const hasMedication = Math.random() < 0.15;
    const hasCondition = Math.random() < 0.25;
    const hasInsurance = !isChild && Math.random() < 0.3;

    if (hasInsurance) {
      patientInsuranceMap[i] = {
        provider: pick(insuranceProviders),
        policyNumber: `POL-${pick(['SH', 'IC', 'NI'])}-${randomInt(100000, 999999)}`,
      };
    }

    const email = `${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}${randomInt(1, 99)}@example.com`;

    patientUserDocs.push({
      _id: userId, name, email, phone: randomPunePhone(),
      password: STAFF_PW, role: 'patient', isActive: true,
      isEmailVerified: Math.random() < 0.7,
      consentGiven: true, consentDate: monthsAgo(randomInt(0, 7)),
    });

    patientDocs.push({
      _id: patId,
      user: userId,
      patientId: `PAT-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}-${i}`,
      name, email, phone: patientUserDocs[i].phone,
      dateOfBirth: dob,
      gender: gender === 'male' ? 'male' : 'female',
      bloodGroup: randomBloodGroup(),
      address: randomPuneAddress(),
      medicalHistory: {
        allergies: hasAllergy ? [pick(allergies), ...(Math.random() < 0.3 ? [pick(allergies)] : [])] : [],
        medications: hasMedication ? [pick(medications)] : [],
        conditions: hasCondition ? [pick(conditions)] : [],
        notes: hasCondition ? `Patient has ${pick(conditions).toLowerCase()}. Regular monitoring advised.` : '',
      },
      insurance: hasInsurance ? {
        provider: patientInsuranceMap[i].provider === 'STAR' ? 'Star Health' : patientInsuranceMap[i].provider === 'ICICI' ? 'ICICI Lombard' : 'New India Assurance',
        policyNumber: patientInsuranceMap[i].policyNumber,
        validTill: daysFromNow(randomInt(60, 365)),
      } : undefined,
      emergencyContact: {
        name: randomName(pick(['male', 'female'])),
        phone: randomPunePhone(),
        relationship: isChild ? pick(['Father', 'Mother']) : pick(['Spouse', 'Parent', 'Sibling', 'Child']),
      },
      guardian: isChild ? userId : undefined, // simplified — child's user is also guardian
      primaryDoctor: pick(allDoctorIds),
      preferredReminderChannel: pickWeighted([
        { value: 'push', weight: 60 }, { value: 'sms', weight: 25 }, { value: 'email', weight: 15 },
      ]),
      consentGiven: true, consentDate: monthsAgo(randomInt(0, 7)),
      isActive: true,
      createdAt: monthsAgo(randomInt(0, 7)),
    });
  }

  await User.insertMany(patientUserDocs);
  await Patient.insertMany(patientDocs);
  console.log(`  ✅ ${patientDocs.length} patients created (with user accounts)`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 5 — SERVICE ITEMS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n💰 Phase 5: Service Items...');

  const serviceItemData = [
    { name: 'Dental Consultation', code: 'CONS001', category: 'consultation', defaultPrice: 500, taxRate: 18, hsnCode: '998312' },
    { name: 'Scaling & Polishing', code: 'SCAL001', category: 'treatment', defaultPrice: 2500, taxRate: 18, hsnCode: '998312' },
    { name: 'Root Canal (Single Canal)', code: 'RCT001', category: 'treatment', defaultPrice: 8000, taxRate: 18, hsnCode: '998312' },
    { name: 'Root Canal (Multi Canal)', code: 'RCT002', category: 'treatment', defaultPrice: 12000, taxRate: 18, hsnCode: '998312' },
    { name: 'Composite Filling', code: 'FILL001', category: 'treatment', defaultPrice: 2000, taxRate: 18, hsnCode: '998312' },
    { name: 'Tooth Extraction (Simple)', code: 'EXT001', category: 'treatment', defaultPrice: 1500, taxRate: 18, hsnCode: '998312' },
    { name: 'Surgical Extraction', code: 'EXT002', category: 'treatment', defaultPrice: 5000, taxRate: 18, hsnCode: '998312' },
    { name: 'Wisdom Tooth Removal', code: 'EXT003', category: 'treatment', defaultPrice: 7000, taxRate: 18, hsnCode: '998312' },
    { name: 'PFM Crown', code: 'CRN001', category: 'treatment', defaultPrice: 6000, taxRate: 18, hsnCode: '998312' },
    { name: 'Zirconia Crown', code: 'CRN002', category: 'treatment', defaultPrice: 12000, taxRate: 18, hsnCode: '998312' },
    { name: 'Metal Braces (Full)', code: 'BRC001', category: 'treatment', defaultPrice: 35000, taxRate: 18, hsnCode: '998312' },
    { name: 'Ceramic Braces (Full)', code: 'BRC002', category: 'treatment', defaultPrice: 55000, taxRate: 18, hsnCode: '998312' },
    { name: 'Teeth Whitening', code: 'WHT001', category: 'treatment', defaultPrice: 10000, taxRate: 18, hsnCode: '998312' },
    { name: 'Dental Implant (Single)', code: 'IMP001', category: 'treatment', defaultPrice: 35000, taxRate: 18, hsnCode: '998312' },
    { name: 'Complete Denture', code: 'DEN001', category: 'treatment', defaultPrice: 18000, taxRate: 18, hsnCode: '998312' },
    { name: 'Panoramic X-Ray (OPG)', code: 'XRAY001', category: 'lab', defaultPrice: 800, taxRate: 18, hsnCode: '998312' },
    { name: 'Periapical X-Ray', code: 'XRAY002', category: 'lab', defaultPrice: 300, taxRate: 18, hsnCode: '998312' },
    { name: 'Fluoride Treatment', code: 'FLR001', category: 'treatment', defaultPrice: 1500, taxRate: 18, hsnCode: '998312' },
    { name: 'Pit & Fissure Sealant', code: 'PFS001', category: 'treatment', defaultPrice: 1000, taxRate: 18, hsnCode: '998312' },
    { name: 'Night Guard', code: 'NGD001', category: 'treatment', defaultPrice: 4000, taxRate: 18, hsnCode: '998312' },
    { name: 'Gum Surgery (Flap)', code: 'GUM001', category: 'treatment', defaultPrice: 8000, taxRate: 18, hsnCode: '998312' },
    { name: 'Veneer (Porcelain)', code: 'VNR001', category: 'treatment', defaultPrice: 15000, taxRate: 18, hsnCode: '998312' },
    { name: 'Space Maintainer', code: 'PED001', category: 'treatment', defaultPrice: 3000, taxRate: 18, hsnCode: '998312' },
    { name: 'Pulpotomy (Primary Tooth)', code: 'PED002', category: 'treatment', defaultPrice: 2500, taxRate: 18, hsnCode: '998312' },
    { name: 'Emergency Consultation', code: 'EMRG001', category: 'consultation', defaultPrice: 800, taxRate: 18, hsnCode: '998312' },
  ];

  const serviceItems = await ServiceItem.insertMany(
    serviceItemData.map(s => ({
      ...s, taxType: 'exclusive', unit: 'service', isActive: true,
      branch: branchFCId, createdBy: doctorIds.jathar,
    }))
  );
  const serviceMap = {};
  serviceItems.forEach(s => { serviceMap[s.code] = s; });
  console.log(`  ✅ ${serviceItems.length} service items created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — INSURANCE PROVIDERS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n🏥 Phase 6: Insurance Providers...');

  const insProviders = await InsuranceProvider.insertMany([
    {
      name: 'Star Health & Allied Insurance', code: 'STAR',
      contactPerson: 'Suresh Mehta', phone: '1800-425-2255', email: 'claims@starhealth.in',
      address: { street: 'Star Health Tower, Anna Salai', city: 'Chennai', state: 'Tamil Nadu', zipCode: '600002', country: 'IN' },
      plans: [
        { name: 'Individual Health', coverageType: 'individual', maxCoverage: 300000, copayPercent: 20 },
        { name: 'Family Health Optima', coverageType: 'family', maxCoverage: 500000, copayPercent: 15 },
        { name: 'Group Mediclaim', coverageType: 'group', maxCoverage: 1000000, copayPercent: 10 },
      ],
      isActive: true,
    },
    {
      name: 'ICICI Lombard General Insurance', code: 'ICICI',
      contactPerson: 'Aarti Gokhale', phone: '1800-266-9725', email: 'health@icicilombard.com',
      address: { street: 'ICICI Lombard House, Prabhadevi', city: 'Mumbai', state: 'Maharashtra', zipCode: '400025', country: 'IN' },
      plans: [
        { name: 'iHealth', coverageType: 'individual', maxCoverage: 200000, copayPercent: 25 },
        { name: 'Complete Health Insurance', coverageType: 'family', maxCoverage: 500000, copayPercent: 20 },
      ],
      isActive: true,
    },
    {
      name: 'New India Assurance', code: 'NIA',
      contactPerson: 'Ramesh Desai', phone: '1800-209-1415', email: 'health@newindia.co.in',
      address: { street: '87 MG Road, Fort', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'IN' },
      plans: [
        { name: 'Individual Mediclaim', coverageType: 'individual', maxCoverage: 250000, copayPercent: 20 },
        { name: 'Family Floater', coverageType: 'family', maxCoverage: 500000, copayPercent: 20 },
        { name: 'Group Insurance', coverageType: 'group', maxCoverage: 700000, copayPercent: 15 },
      ],
      isActive: true,
    },
  ]);
  const insProviderMap = {};
  insProviders.forEach(p => { insProviderMap[p.code] = p; });
  console.log(`  ✅ ${insProviders.length} insurance providers created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 9 — PAYROLL
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n💵 Phase 9: Payroll...');

  const salaryTiers = {
    super_admin: { base: 150000, allowances: [{ name: 'HRA', amount: 40000, isFixed: true }, { name: 'Medical', amount: 5000, isFixed: true }, { name: 'Transport', amount: 3000, isFixed: true }], deductions: [{ name: 'PF', amount: 18000, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }, { name: 'TDS', amount: 15000, isFixed: true }] },
    doctor_senior: { base: 100000, allowances: [{ name: 'HRA', amount: 25000, isFixed: true }, { name: 'Medical', amount: 5000, isFixed: true }], deductions: [{ name: 'PF', amount: 12000, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }, { name: 'TDS', amount: 8000, isFixed: true }] },
    doctor_junior: { base: 60000, allowances: [{ name: 'HRA', amount: 15000, isFixed: true }, { name: 'Medical', amount: 3000, isFixed: true }], deductions: [{ name: 'PF', amount: 7200, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }, { name: 'TDS', amount: 4000, isFixed: true }] },
    admin: { base: 45000, allowances: [{ name: 'HRA', amount: 12000, isFixed: true }, { name: 'Medical', amount: 2000, isFixed: true }], deductions: [{ name: 'PF', amount: 5400, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
    receptionist: { base: 25000, allowances: [{ name: 'HRA', amount: 6000, isFixed: true }, { name: 'Medical', amount: 1500, isFixed: true }], deductions: [{ name: 'PF', amount: 3000, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
    support_staff: { base: 25000, allowances: [{ name: 'HRA', amount: 6000, isFixed: true }, { name: 'Medical', amount: 1500, isFixed: true }], deductions: [{ name: 'PF', amount: 3000, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
    billing_officer: { base: 35000, allowances: [{ name: 'HRA', amount: 9000, isFixed: true }, { name: 'Medical', amount: 2000, isFixed: true }], deductions: [{ name: 'PF', amount: 4200, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
    accountant: { base: 35000, allowances: [{ name: 'HRA', amount: 9000, isFixed: true }, { name: 'Medical', amount: 2000, isFixed: true }], deductions: [{ name: 'PF', amount: 4200, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
    hr_payroll_manager: { base: 45000, allowances: [{ name: 'HRA', amount: 12000, isFixed: true }, { name: 'Medical', amount: 2500, isFixed: true }], deductions: [{ name: 'PF', amount: 5400, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
    it_support: { base: 45000, allowances: [{ name: 'HRA', amount: 12000, isFixed: true }, { name: 'Medical', amount: 2000, isFixed: true }], deductions: [{ name: 'PF', amount: 5400, isFixed: true }, { name: 'Professional Tax', amount: 200, isFixed: true }] },
  };

  function getSalaryTier(user) {
    if (user.role === 'super_admin') return salaryTiers.super_admin;
    if (user.role === 'doctor') {
      const hasPostgrad = user.doctorProfile?.education?.length > 1;
      return hasPostgrad ? salaryTiers.doctor_senior : salaryTiers.doctor_junior;
    }
    return salaryTiers[user.role] || salaryTiers.support_staff;
  }

  const allEmployees = [...doctors, ...staffMembers];
  const salaryStructures = [];
  const payslips = [];

  for (const emp of allEmployees) {
    const tier = getSalaryTier(emp);
    const ssId = oid();
    salaryStructures.push({
      _id: ssId, user: emp._id, baseSalary: tier.base,
      allowances: tier.allowances, deductions: tier.deductions,
      currency: 'INR', effectiveFrom: CLINIC_OPENED, isActive: true,
      createdBy: doctorIds.jathar,
    });

    const grossPay = tier.base + tier.allowances.reduce((s, a) => s + a.amount, 0);
    const totalDeductions = tier.deductions.reduce((s, d) => s + d.amount, 0);
    const netPay = grossPay - totalDeductions;

    // Generate 8 months of payslips
    for (let m = 7; m >= 0; m--) {
      const payDate = monthsAgo(m);
      const month = payDate.getMonth() + 1;
      const year = payDate.getFullYear();
      const isCurrentMonth = m === 0;

      const paidDate = new Date(year, month, 1); // 1st of next month

      payslips.push({
        user: emp._id, salaryStructure: ssId, month, year,
        earnings: { base: tier.base, allowances: tier.allowances.map(a => ({ name: a.name, amount: a.amount })), grossPay },
        deductions: { items: tier.deductions.map(d => ({ name: d.name, amount: d.amount })), totalDeductions },
        netPay,
        status: isCurrentMonth ? 'draft' : 'paid',
        approvedBy: isCurrentMonth ? undefined : doctorIds.jathar,
        approvedAt: isCurrentMonth ? undefined : paidDate,
        paidAt: isCurrentMonth ? undefined : paidDate,
        paymentMethod: 'bank_transfer',
        createdBy: staffIds.swati,
      });
    }
  }

  await SalaryStructure.insertMany(salaryStructures);
  await Payslip.insertMany(payslips);
  console.log(`  ✅ ${salaryStructures.length} salary structures + ${payslips.length} payslips created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 10 — APPOINTMENTS (500+)
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n📋 Phase 10: Appointments...');

  const appointmentDocs = [];
  const appointmentsPerMonth = [30, 30, 60, 60, 60, 80, 80, 80]; // 8 months
  let apptSeq = 0;

  const apptTypes = [
    { value: 'consultation', weight: 35 }, { value: 'follow_up', weight: 25 },
    { value: 'procedure', weight: 30 }, { value: 'emergency', weight: 5 }, { value: 'teleconsult', weight: 5 },
  ];
  const apptSources = [
    { value: 'general', weight: 50 }, { value: 'portal', weight: 30 },
    { value: 'walk_in', weight: 15 }, { value: 'chatbot', weight: 5 },
  ];
  const durationMap = { consultation: 30, follow_up: 20, procedure: 60, emergency: 30, teleconsult: 20 };

  for (let monthIdx = 7; monthIdx >= 0; monthIdx--) {
    const count = appointmentsPerMonth[7 - monthIdx];
    const isCurrentMonth = monthIdx === 0;

    for (let a = 0; a < count; a++) {
      apptSeq++;
      const patIdx = randomInt(0, patientIds.length - 1);
      const doctorId = pick(allDoctorIds);
      const type = pickWeighted(apptTypes);
      const source = pickWeighted(apptSources);
      const scheduledAt = isCurrentMonth ? randomWeekdayInMonth(0) : randomWeekdayInMonth(monthIdx);
      const isPast = scheduledAt < new Date();
      const branch = Math.random() < 0.8 ? branchFCId : branchKTId;

      let status;
      if (!isPast) {
        status = pickWeighted([
          { value: 'confirmed', weight: 60 }, { value: 'requested', weight: 40 },
        ]);
      } else {
        status = pickWeighted([
          { value: 'completed', weight: 55 }, { value: 'cancelled', weight: 12 },
          { value: 'no_show', weight: 5 }, { value: 'completed', weight: 28 },
        ]);
      }

      // Today's appointments get special treatment
      const now = new Date();
      if (isCurrentMonth && scheduledAt.toDateString() === now.toDateString()) {
        status = pickWeighted([
          { value: 'confirmed', weight: 30 }, { value: 'checked_in', weight: 20 },
          { value: 'in_progress', weight: 20 }, { value: 'completed', weight: 30 },
        ]);
      }

      const apptDoc = {
        patient: patientIds[patIdx],
        doctor: doctorId,
        scheduledAt,
        duration: durationMap[type] || 30,
        type, status, branch, source,
        reason: pick(DENTAL_REASONS),
        createdBy: pick([staffIds.snehal, staffIds.pooja, doctorIds.jathar]),
        createdAt: new Date(scheduledAt.getTime() - randomInt(1, 7) * 86400000),
      };

      if (status === 'completed') {
        apptDoc.checkedInAt = new Date(scheduledAt.getTime() - randomInt(5, 15) * 60000);
        apptDoc.startedAt = new Date(scheduledAt.getTime() + randomInt(0, 10) * 60000);
        apptDoc.completedAt = new Date(apptDoc.startedAt.getTime() + (durationMap[type] || 30) * 60000);
      }
      if (status === 'checked_in') {
        apptDoc.checkedInAt = new Date(scheduledAt.getTime() - randomInt(5, 15) * 60000);
      }
      if (status === 'in_progress') {
        apptDoc.checkedInAt = new Date(scheduledAt.getTime() - 10 * 60000);
        apptDoc.startedAt = new Date(scheduledAt.getTime());
      }
      if (status === 'cancelled') {
        apptDoc.cancelledAt = new Date(scheduledAt.getTime() - randomInt(1, 48) * 3600000);
        apptDoc.cancelReason = pick(CANCEL_REASONS);
      }

      appointmentDocs.push(apptDoc);
    }
  }

  const insertedAppointments = await Appointment.insertMany(appointmentDocs);
  console.log(`  ✅ ${insertedAppointments.length} appointments created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 11 — QUEUE ENTRIES (today)
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n🎫 Phase 11: Queue Entries + Room-Appointment Sync...');

  const todayAppts = insertedAppointments.filter(a => a.scheduledAt.toDateString() === new Date().toDateString());
  const queueDocs = [];
  let tokenNum = 0;

  // Separate rooms by branch for assignment
  const fcRooms = rooms.filter(r => r.branch.equals(branchFCId));
  const ktRooms = rooms.filter(r => r.branch.equals(branchKTId));

  // Define a realistic "live clinic day" queue layout:
  //   Tokens 1-3: completed (seen earlier today)
  //   Tokens 4-5: in_consultation (currently with doctor in a room)
  //   Tokens 6-8: waiting (in the waiting room)
  const queueLayout = [
    { status: 'completed', priority: 'normal' },
    { status: 'completed', priority: 'normal' },
    { status: 'completed', priority: 'high' },
    { status: 'in_consultation', priority: 'normal' },
    { status: 'in_consultation', priority: 'emergency' },
    { status: 'waiting', priority: 'normal' },
    { status: 'waiting', priority: 'normal' },
    { status: 'waiting', priority: 'high' },
  ];

  // Track which rooms are assigned for the sync step
  let fcRoomIdx = 0; // index into fcRooms for assignment
  let ktRoomIdx = 0;
  const roomUpdates = []; // { roomId, update } pairs for batch update
  const apptUpdates = []; // { apptId, update } pairs for syncing appointment status

  for (let q = 0; q < Math.min(queueLayout.length, todayAppts.length); q++) {
    tokenNum++;
    const appt = todayAppts[q];
    const layout = queueLayout[q];
    const now = new Date();

    const queueDoc = {
      patient: appt.patient, doctor: appt.doctor, appointment: appt._id,
      branch: appt.branch, department: departments[0]._id,
      tokenNumber: tokenNum, status: layout.status, priority: layout.priority,
      checkedInAt: new Date(now.getTime() - (queueLayout.length - q) * 20 * 60000), // staggered check-in
      createdBy: staffIds.snehal,
    };

    if (layout.status === 'in_consultation') {
      // Assign a room from the correct branch
      const branchRooms = appt.branch.equals(branchFCId) ? fcRooms : ktRooms;
      const roomIdx = appt.branch.equals(branchFCId) ? fcRoomIdx++ : ktRoomIdx++;
      const assignedRoom = branchRooms[roomIdx];

      if (assignedRoom) {
        const consultStartedAt = new Date(now.getTime() - randomInt(5, 25) * 60000);
        queueDoc.room = assignedRoom._id;
        queueDoc.calledAt = consultStartedAt;

        // Mark room as occupied with this doctor + patient
        roomUpdates.push({
          roomId: assignedRoom._id,
          update: {
            status: 'occupied',
            currentDoctor: appt.doctor,
            currentPatient: appt.patient,
            currentAppointment: appt._id,
            occupiedSince: consultStartedAt,
          },
        });

        // Sync the appointment to in_progress with timestamps
        apptUpdates.push({
          apptId: appt._id,
          update: {
            status: 'in_progress',
            checkedInAt: queueDoc.checkedInAt,
            startedAt: consultStartedAt,
          },
        });
      }
    } else if (layout.status === 'completed') {
      // Completed consultations — assign a room reference for historical tracking
      // and mark those rooms as available (consultation is done)
      const branchRooms = appt.branch.equals(branchFCId) ? fcRooms : ktRooms;
      const completedAt = new Date(now.getTime() - randomInt(30, 90) * 60000);
      const calledAt = new Date(completedAt.getTime() - randomInt(15, 40) * 60000);

      queueDoc.calledAt = calledAt;
      queueDoc.completedAt = completedAt;

      // Sync the appointment to completed
      apptUpdates.push({
        apptId: appt._id,
        update: {
          status: 'completed',
          checkedInAt: queueDoc.checkedInAt,
          startedAt: calledAt,
          completedAt,
        },
      });

      // For the first completed entry, mark that room as "cleaning" (just finished)
      if (q === 0) {
        const cleaningRoom = branchRooms[branchRooms.length - 1]; // use last consultation room
        if (cleaningRoom) {
          queueDoc.room = cleaningRoom._id;
          roomUpdates.push({
            roomId: cleaningRoom._id,
            update: {
              status: 'cleaning',
              currentDoctor: null,
              currentPatient: null,
              currentAppointment: null,
              occupiedSince: null,
            },
          });
        }
      }
    } else {
      // Waiting patients — synced to checked_in appointment status
      apptUpdates.push({
        apptId: appt._id,
        update: {
          status: 'checked_in',
          checkedInAt: queueDoc.checkedInAt,
        },
      });
    }

    queueDocs.push(queueDoc);
  }

  if (queueDocs.length > 0) await QueueEntry.insertMany(queueDocs);

  // Apply room updates (mark occupied / cleaning rooms)
  for (const { roomId, update } of roomUpdates) {
    await ConsultationRoom.updateOne({ _id: roomId }, { $set: update });
  }

  // Sync appointment statuses to match queue state
  for (const { apptId, update } of apptUpdates) {
    await Appointment.updateOne({ _id: apptId }, { $set: update });
  }

  console.log(`  ✅ ${queueDocs.length} queue entries created`);
  console.log(`  ✅ ${roomUpdates.length} rooms synced (occupied/cleaning)`);
  console.log(`  ✅ ${apptUpdates.length} appointments synced to match queue state`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 12 — TREATMENT RECORDS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n🦷 Phase 12: Treatment Records...');

  const completedAppts = insertedAppointments.filter(a => a.status === 'completed');
  const treatmentDocs = [];

  for (let t = 0; t < completedAppts.length; t++) {
    if (Math.random() > 0.6) continue; // ~60% of completed appointments
    const appt = completedAppts[t];
    const toothNum = randomInt(11, 48);

    treatmentDocs.push({
      patient: appt.patient, doctor: appt.doctor, appointment: appt._id,
      diagnosis: pick(DENTAL_DIAGNOSES),
      treatment: pick(DENTAL_TREATMENTS),
      teeth: [{ number: toothNum, condition: pick(['caries', 'fracture', 'missing', 'restored', 'healthy']), procedure: pick(DENTAL_TREATMENTS) }],
      prescription: [pick(DENTAL_MEDICATIONS), ...(Math.random() < 0.5 ? [pick(DENTAL_MEDICATIONS)] : [])].map(m => ({ medication: m.name, dosage: m.dosage, frequency: m.frequency, duration: m.duration, notes: m.instructions })),
      notes: Math.random() < 0.3 ? 'Patient tolerated procedure well. Post-operative instructions given.' : '',
      followUpDate: Math.random() < 0.3 ? daysFromNow(randomInt(7, 30)) : undefined,
      createdBy: appt.doctor,
      createdAt: appt.completedAt || appt.scheduledAt,
    });
  }

  // Drop the problematic unique index that chokes on null externalId duplicates
  try {
    await tenantConn.collection('treatmentrecords').dropIndex('externalId_1_externalSource_1');
  } catch (e) { /* index may not exist */ }
  const insertedTreatments = await TreatmentRecord.insertMany(treatmentDocs);
  console.log(`  ✅ ${insertedTreatments.length} treatment records created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 13 — PRESCRIPTIONS + CARE TASKS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n💊 Phase 13: Prescriptions & Care Tasks...');

  const prescriptionDocs = [];
  const taskDocs = [];
  const reminderDocs = [];

  for (let p = 0; p < insertedTreatments.length; p++) {
    if (Math.random() > 0.4) continue; // ~40% of treatments
    const tr = insertedTreatments[p];
    const isRecent = new Date(tr.createdAt) > daysAgo(30);
    const meds = [pick(DENTAL_MEDICATIONS), pick(DENTAL_MEDICATIONS)];

    const prescId = oid();
    prescriptionDocs.push({
      _id: prescId,
      patient: tr.patient, doctor: tr.doctor, appointment: tr.appointment,
      branch: branchFCId,
      diagnosis: tr.diagnosis,
      medications: meds,
      status: isRecent ? 'active' : 'completed',
      createdBy: tr.doctor,
      createdAt: tr.createdAt,
    });

    // Care tasks for active prescriptions
    if (isRecent) {
      for (const med of meds) {
        const taskId = oid();
        const startDate = new Date(tr.createdAt);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + parseInt(med.duration) || 5);

        taskDocs.push({
          _id: taskId,
          prescription: prescId, patient: tr.patient, doctor: tr.doctor,
          taskType: 'medication', title: `Take ${med.name} ${med.dosage}`,
          instructions: med.instructions || 'As directed',
          frequency: med.frequency === 'Three times a day' ? 'thrice_daily' : (med.frequency === 'Twice a day' ? 'twice_daily' : 'once'),
          startDate, endDate,
          totalReminders: randomInt(10, 30),
          completedCount: randomInt(3, 15),
          skippedCount: randomInt(0, 3),
          missedCount: randomInt(0, 5),
          isActive: true,
          createdBy: tr.doctor,
        });

        // Create a few reminders per task
        for (let r = 0; r < 3; r++) {
          const schedAt = new Date(startDate);
          schedAt.setDate(schedAt.getDate() + r);
          schedAt.setHours(pick([8, 14, 20]), 0, 0, 0);
          reminderDocs.push({
            task: taskId, patient: tr.patient, prescription: prescId,
            scheduledAt: schedAt,
            status: schedAt < new Date() ? pick(['done', 'done', 'missed', 'skipped']) : 'pending',
            deliveryChannel: 'push',
          });
        }
      }
    }
  }

  if (prescriptionDocs.length) await Prescription.insertMany(prescriptionDocs);
  if (taskDocs.length) await PrescriptionTask.insertMany(taskDocs);
  if (reminderDocs.length) await CareReminder.insertMany(reminderDocs);
  console.log(`  ✅ ${prescriptionDocs.length} prescriptions, ${taskDocs.length} tasks, ${reminderDocs.length} reminders`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 14 — INVOICES + PAYMENTS + LEDGER
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n🧾 Phase 14: Invoices, Payments & Ledger...');

  const invoiceDocs = [];
  const paymentDocs = [];
  const ledgerDocs = [];
  let invSeq = 0;
  let ledgerBalance = {};

  // Map treatment types to service items for invoice line items
  const treatmentToService = [
    { match: /consultation/i, code: 'CONS001' },
    { match: /scaling/i, code: 'SCAL001' },
    { match: /root canal.*single/i, code: 'RCT001' },
    { match: /root canal.*multi/i, code: 'RCT002' },
    { match: /root canal/i, code: 'RCT001' },
    { match: /composite|filling|restoration/i, code: 'FILL001' },
    { match: /simple extraction/i, code: 'EXT001' },
    { match: /surgical extraction/i, code: 'EXT002' },
    { match: /wisdom/i, code: 'EXT003' },
    { match: /pfm crown/i, code: 'CRN001' },
    { match: /zirconia crown/i, code: 'CRN002' },
    { match: /metal braces/i, code: 'BRC001' },
    { match: /ceramic braces/i, code: 'BRC002' },
    { match: /whitening/i, code: 'WHT001' },
    { match: /implant/i, code: 'IMP001' },
    { match: /denture/i, code: 'DEN001' },
    { match: /fluoride/i, code: 'FLR001' },
    { match: /sealant/i, code: 'PFS001' },
    { match: /night guard/i, code: 'NGD001' },
    { match: /flap|gum surgery/i, code: 'GUM001' },
    { match: /veneer/i, code: 'VNR001' },
    { match: /space maintainer/i, code: 'PED001' },
    { match: /pulpotomy/i, code: 'PED002' },
  ];

  function matchService(treatmentText) {
    for (const t of treatmentToService) {
      if (t.match.test(treatmentText)) return serviceMap[t.code];
    }
    return serviceMap['CONS001']; // default to consultation
  }

  for (const appt of completedAppts) {
    invSeq++;
    const treatment = insertedTreatments.find(t => t.appointment?.equals(appt._id));
    const service = treatment ? matchService(treatment.treatment) : serviceMap['CONS001'];
    const unitPrice = service?.defaultPrice || 500;
    const qty = 1;
    const taxRate = 18;
    const subtotal = unitPrice * qty;
    const taxAmount = Math.round(subtotal * taxRate / 100);
    const totalAmount = subtotal + taxAmount;
    const cgst = Math.round(taxAmount / 2);
    const sgst = taxAmount - cgst;

    const invStatus = pickWeighted([
      { value: 'paid', weight: 70 }, { value: 'partially_paid', weight: 10 },
      { value: 'sent', weight: 10 }, { value: 'overdue', weight: 5 }, { value: 'draft', weight: 5 },
    ]);

    const invId = oid();
    const invDoc = {
      _id: invId,
      invoiceNumber: `INV-JDFC-${String(invSeq).padStart(5, '0')}`,
      patient: appt.patient, appointment: appt._id,
      doctor: appt.doctor, branch: appt.branch,
      items: [{
        description: service?.name || 'Dental Consultation',
        quantity: qty, unitPrice, discount: 0, tax: taxAmount, total: totalAmount,
        itemType: 'treatment', hsnCode: '998312', taxRate,
      }],
      subtotal, taxAmount, discountAmount: 0, totalAmount,
      cgst, sgst, igst: 0, cessAmount: 0,
      currency: 'INR', sequenceNumber: invSeq,
      status: invStatus,
      paidAmount: invStatus === 'paid' ? totalAmount : (invStatus === 'partially_paid' ? Math.round(totalAmount * 0.5) : 0),
      dueDate: new Date(appt.scheduledAt.getTime() + 7 * 86400000),
      createdBy: staffIds.rajesh,
      createdAt: appt.completedAt || appt.scheduledAt,
    };

    if (invStatus === 'paid' || invStatus === 'partially_paid') {
      const payAmount = invDoc.paidAmount;
      const payMode = pickWeighted([
        { value: 'upi', weight: 40 }, { value: 'cash', weight: 30 },
        { value: 'card', weight: 20 }, { value: 'insurance', weight: 10 },
      ]);
      const payId = oid();
      invDoc.paymentMethod = payMode;
      invDoc.paidAt = invStatus === 'paid' ? (appt.completedAt || appt.scheduledAt) : undefined;
      invDoc.payments = [payId];

      paymentDocs.push({
        _id: payId,
        invoice: invId, patient: appt.patient, amount: payAmount,
        mode: payMode, status: 'completed',
        processedBy: staffIds.rajesh,
        processedAt: appt.completedAt || appt.scheduledAt,
        branch: appt.branch,
        createdBy: staffIds.rajesh,
        createdAt: appt.completedAt || appt.scheduledAt,
      });

      // Ledger entries
      const patKey = appt.patient.toString();
      if (!ledgerBalance[patKey]) ledgerBalance[patKey] = 0;

      // Debit (invoice)
      ledgerBalance[patKey] += totalAmount;
      ledgerDocs.push({
        patient: appt.patient, type: 'debit', amount: totalAmount,
        balance: ledgerBalance[patKey],
        source: 'adjustment', reference: invId, referenceModel: 'Invoice',
        description: `Invoice ${invDoc.invoiceNumber}`,
        createdBy: staffIds.rajesh, branch: appt.branch,
      });

      // Credit (payment)
      ledgerBalance[patKey] -= payAmount;
      ledgerDocs.push({
        patient: appt.patient, type: 'credit', amount: payAmount,
        balance: ledgerBalance[patKey],
        source: 'payment', reference: payId, referenceModel: 'Payment',
        description: `Payment for ${invDoc.invoiceNumber}`,
        createdBy: staffIds.rajesh, branch: appt.branch,
      });
    }

    invoiceDocs.push(invDoc);
  }

  await Invoice.insertMany(invoiceDocs);
  if (paymentDocs.length) await Payment.insertMany(paymentDocs);
  if (ledgerDocs.length) await PatientLedger.insertMany(ledgerDocs);
  console.log(`  ✅ ${invoiceDocs.length} invoices, ${paymentDocs.length} payments, ${ledgerDocs.length} ledger entries`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 15 — INSURANCE CLAIMS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n📋 Phase 15: Insurance Claims...');

  const insurancePayments = paymentDocs.filter(p => p.mode === 'insurance');
  const claimDocs = [];

  for (const pay of insurancePayments) {
    const invoice = invoiceDocs.find(i => i._id.equals(pay.invoice));
    if (!invoice) continue;

    const patIdx = patientIds.findIndex(id => id.equals(invoice.patient));
    const insInfo = patientInsuranceMap[patIdx];
    if (!insInfo) continue;

    const provider = insProviderMap[insInfo.provider];
    if (!provider) continue;

    claimDocs.push({
      patient: invoice.patient, provider: provider._id,
      appointment: invoice.appointment, invoice: invoice._id,
      policyNumber: insInfo.policyNumber,
      claimAmount: invoice.totalAmount,
      approvedAmount: Math.round(invoice.totalAmount * 0.8),
      settledAmount: Math.round(invoice.totalAmount * 0.8),
      coPayPercent: 20, coPayAmount: Math.round(invoice.totalAmount * 0.2),
      patientResponsibility: Math.round(invoice.totalAmount * 0.2),
      status: pickWeighted([
        { value: 'approved', weight: 60 }, { value: 'under_review', weight: 20 },
        { value: 'pending', weight: 15 }, { value: 'rejected', weight: 5 },
      ]),
      submittedAt: invoice.createdAt,
      createdBy: staffIds.rajesh,
    });
  }

  if (claimDocs.length) await InsuranceClaim.insertMany(claimDocs);
  console.log(`  ✅ ${claimDocs.length} insurance claims created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 16 — NOTIFICATIONS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n🔔 Phase 16: Notifications (role-based)...');

  const notifDocs = [];

  // ── Role-specific notification pools ──
  // Each role only gets notification types they'd actually receive in production.

  const doctorNotifs = [
    // appointment — new bookings, check-ins, cancellations, no-shows
    { type: 'appointment', title: 'New Appointment Scheduled', message: 'Aarav Joshi has been scheduled for an appointment on Apr 8, 10:00 AM.' },
    { type: 'appointment', title: 'New Appointment Scheduled', message: 'Priya Kulkarni has been scheduled for a root canal on Apr 10, 2:30 PM.' },
    { type: 'appointment', title: 'Patient Checked In', message: 'Sneha Patil has checked in for their appointment.' },
    { type: 'appointment', title: 'Patient Checked In', message: 'Rohan Deshmukh has checked in for their appointment.' },
    { type: 'appointment', title: 'Appointment Cancelled', message: 'The appointment with Meera Shah on Apr 9 has been cancelled.' },
    { type: 'appointment', title: 'Patient No-Show', message: 'Vikram Thakur did not show up for their appointment on Apr 7.' },
    { type: 'appointment', title: 'New Appointment Booked', message: 'Patient Ananya Desai booked an appointment via portal.' },
    { type: 'appointment', title: 'Appointment Rescheduled', message: 'Aarav Joshi has rescheduled the appointment to Apr 12, 11:00 AM.' },
    { type: 'appointment', title: 'Patient Confirmed Attendance', message: 'Priya Kulkarni has confirmed attendance for the appointment on Apr 10.' },
    // alert — compliance
    { type: 'alert', title: 'Low Compliance Alert', message: "Patient Rohan Deshmukh's compliance for \"Amoxicillin 500mg\" has dropped to 35%. Please review." },
    { type: 'alert', title: 'Patient Missed Multiple Reminders', message: 'Sneha Patil has missed 4 consecutive reminders for "Post-RCT care". Immediate attention needed.' },
    // dental_scan — needs review
    { type: 'dental_scan', title: 'Dental Scan Needs Review', message: 'A new AI dental scan analysis is ready for your professional review.' },
    { type: 'dental_scan', title: 'Dental Scan Needs Review', message: 'A new AI dental scan analysis is ready for your professional review.' },
  ];

  const receptionistNotifs = [
    // appointment — front-desk operations
    { type: 'appointment', title: 'New Appointment', message: 'Aarav Joshi scheduled with Dr. Jathar on Apr 8, 10:00 AM.' },
    { type: 'appointment', title: 'New Appointment', message: 'Priya Kulkarni scheduled with Dr. Mehta on Apr 10, 2:30 PM.' },
    { type: 'appointment', title: 'New Appointment', message: 'Walk-in patient Vikram Thakur scheduled with Dr. Jathar on Apr 7, 4:00 PM.' },
    { type: 'appointment', title: 'Appointment Confirmed', message: "Sneha Patil's appointment on Apr 9 has been confirmed." },
    { type: 'appointment', title: 'Appointment Confirmed', message: "Rohan Deshmukh's appointment on Apr 11 has been confirmed." },
    { type: 'appointment', title: 'Appointment Cancelled', message: "Meera Shah's appointment on Apr 9 was cancelled." },
    { type: 'appointment', title: 'Patient No-Show', message: 'Ananya Desai did not show up for their Apr 7 appointment.' },
    { type: 'appointment', title: 'Appointment Completed', message: "Aarav Joshi's appointment with Dr. Jathar is complete." },
    // payment — invoices
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹8,500) for Priya Kulkarni has been auto-generated after consultation with Dr. Mehta.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹3,200) for Rohan Deshmukh has been auto-generated after consultation with Dr. Jathar.' },
    { type: 'payment', title: 'Draft Invoice Needs Review', message: 'An invoice (₹5,000) for Sneha Patil has been auto-generated. Some items need manual pricing — invoice is in draft.' },
  ];

  const adminNotifs = [
    // appointment
    { type: 'appointment', title: 'New Appointment Scheduled', message: 'Aarav Joshi has been scheduled for an appointment on Apr 8.' },
    { type: 'appointment', title: 'Appointment Cancelled', message: 'The appointment with Meera Shah on Apr 9 has been cancelled.' },
    // payment
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹8,500) for Priya Kulkarni has been auto-generated after consultation with Dr. Mehta.' },
    { type: 'payment', title: 'Draft Invoice Needs Review', message: 'An invoice (₹5,000) for Sneha Patil needs manual pricing — invoice is in draft.' },
    // alert — inventory
    { type: 'alert', title: 'Low Stock Alert', message: '3 item(s) are below minimum threshold.' },
    { type: 'alert', title: 'Expiry Alert', message: '2 item(s) are expiring within 30 days.' },
    // system
    { type: 'system', title: 'Material Restocked', message: 'Dental Composite Resin has been restocked. 4 procedure(s) may now be available.' },
    { type: 'system', title: 'System Maintenance Scheduled', message: 'System maintenance window: Sunday 2:00-4:00 AM.' },
  ];

  const billingNotifs = [
    // payment — their primary concern
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹8,500) for Priya Kulkarni has been auto-generated after consultation with Dr. Mehta.' },
    { type: 'payment', title: 'Draft Invoice Needs Review', message: 'An invoice (₹5,000) for Sneha Patil needs manual pricing — invoice is in draft.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹3,200) for Rohan Deshmukh has been auto-generated after consultation with Dr. Jathar.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹12,000) for Aarav Joshi has been auto-generated after consultation with Dr. Jathar.' },
  ];

  const patientNotifs = [
    // appointment
    { type: 'appointment', title: 'Appointment Confirmed', message: 'Your appointment with Dr. Jathar on Apr 8 has been confirmed.' },
    { type: 'appointment', title: 'Appointment Completed', message: 'Your appointment with Dr. Jathar has been completed.' },
    { type: 'appointment', title: "You're Up!", message: 'Please proceed to Room A. Token #12.' },
    { type: 'appointment', title: 'Consultation Started', message: 'Dr. Jathar has started your consultation.' },
    // payment
    { type: 'payment', title: 'Invoice Ready', message: 'Your invoice of ₹8,500 from your consultation with Dr. Jathar is ready. You can pay from the app.' },
    // reminder
    { type: 'reminder', title: 'Appointment Reminder', message: 'Your appointment with Dr. Jathar is in 1 hour. Please confirm your attendance.' },
    { type: 'reminder', title: 'Care Reminder: Amoxicillin 500mg', message: 'Time for your medication: Amoxicillin 500mg — take 1 tablet after meals.' },
    // dental_scan
    { type: 'dental_scan', title: 'Dental Scan Analysis Ready', message: 'Your dental scan has been analyzed. View your results now or wait for a doctor to review them.' },
  ];

  // Map recipients to their notification pool
  const roleNotifMap = [
    // Doctors — 10 notifs each
    ...allDoctorIds.flatMap((id) => Array.from({ length: 10 }, () => ({ recipient: id, ...pick(doctorNotifs) }))),
    // Receptionists — snehal, pooja — 10 notifs each
    ...Array.from({ length: 10 }, () => ({ recipient: staffIds.snehal, ...pick(receptionistNotifs) })),
    ...Array.from({ length: 10 }, () => ({ recipient: staffIds.pooja, ...pick(receptionistNotifs) })),
    // Support staff — anita, sunita, mangesh, rahul, prashant — 6 notifs each (same as receptionist)
    ...[staffIds.anita, staffIds.sunita, staffIds.mangesh, staffIds.rahul, staffIds.prashant]
      .flatMap((id) => Array.from({ length: 6 }, () => ({ recipient: id, ...pick(receptionistNotifs) }))),
    // Admin — vishal — 10 notifs
    ...Array.from({ length: 10 }, () => ({ recipient: staffIds.vishal, ...pick(adminNotifs) })),
    // Billing — rajesh — 8 notifs
    ...Array.from({ length: 8 }, () => ({ recipient: staffIds.rajesh, ...pick(billingNotifs) })),
    // IT support — nilesh — 4 system notifs
    ...Array.from({ length: 4 }, () => ({ recipient: staffIds.nilesh, type: 'system', title: pick(['System Maintenance Scheduled', 'Backup Completed', 'Security Update Applied']), message: pick(['System maintenance window: Sunday 2:00-4:00 AM.', 'Daily backup completed successfully.', 'Security patches applied. No action needed.']) })),
    // HR — swati — 4 system notifs
    ...Array.from({ length: 4 }, () => ({ recipient: staffIds.swati, type: 'system', title: pick(['System Maintenance Scheduled', 'Backup Completed']), message: pick(['System maintenance window: Sunday 2:00-4:00 AM.', 'Daily backup completed successfully.']) })),
    // Accountant — deepak — 6 payment notifs
    ...Array.from({ length: 6 }, () => ({ recipient: staffIds.deepak, ...pick(billingNotifs) })),
    // Patients — 6 notifs each
    ...patientUserDocs.flatMap((u) => Array.from({ length: 6 }, () => ({ recipient: u._id, ...pick(patientNotifs) }))),
  ];

  for (const entry of roleNotifMap) {
    const daysBack = randomInt(0, 30);
    const isRead = Math.random() < 0.6;
    notifDocs.push({
      recipient: entry.recipient,
      title: entry.title,
      message: entry.message,
      type: entry.type,
      isRead,
      readAt: isRead ? daysAgo(daysBack) : undefined,
      createdAt: daysAgo(daysBack),
    });
  }

  await Notification.insertMany(notifDocs);
  console.log(`  ✅ ${notifDocs.length} role-based notifications created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 17 — REVIEWS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n⭐ Phase 17: Reviews...');

  const reviewDocs = [];
  // Use completed appointments to avoid unique index conflict on { patient, appointment }
  const completedForReviews = insertedAppointments
    .filter(a => a.status === 'completed')
    .sort(() => Math.random() - 0.5)
    .slice(0, 50);
  const reviewSeen = new Set();
  for (const appt of completedForReviews) {
    const key = `${appt.patient}_${appt._id}`;
    if (reviewSeen.has(key)) continue;
    reviewSeen.add(key);

    const patIdx = patientIds.findIndex(id => id.equals(appt.patient));
    if (patIdx < 0) continue;

    const rating = pickWeighted([
      { value: 5, weight: 40 }, { value: 4, weight: 35 }, { value: 3, weight: 15 },
      { value: 2, weight: 7 }, { value: 1, weight: 3 },
    ]);

    reviewDocs.push({
      patient: appt.patient, doctor: appt.doctor, appointment: appt._id,
      rating, comment: pick(REVIEW_COMMENTS),
      isAnonymous: Math.random() < 0.15,
      status: Math.random() < 0.9 ? 'approved' : 'pending',
      createdBy: patientUserDocs[patIdx]?._id || appt.patient,
      createdAt: appt.completedAt || daysAgo(randomInt(1, 180)),
    });
  }

  await Review.insertMany(reviewDocs);
  console.log(`  ✅ ${reviewDocs.length} reviews created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 18 — DENTAL SCANS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n📸 Phase 18: Dental Scans...');

  const scanDocs = [];
  const scanResultDocs = [];

  for (let s = 0; s < 12; s++) {
    const patIdx = randomInt(0, patientIds.length - 1);
    const scanId = oid();
    const angles = ['front', 'left', 'right', 'upper', 'lower'];

    scanDocs.push({
      _id: scanId,
      patient: patientIds[patIdx], status: 'completed', scanType: 'intraoral',
      images: angles.map(angle => ({
        angle, fileUrl: `/uploads/scans/${SLUG}/scan_${scanId}_${angle}.jpg`,
        fileName: `scan_${angle}.jpg`, fileSize: randomInt(500000, 2000000),
        uploadedAt: daysAgo(randomInt(1, 60)),
      })),
      consentGiven: true, consentTimestamp: daysAgo(randomInt(1, 60)),
      scanStartedAt: daysAgo(randomInt(1, 60)),
      completedAt: daysAgo(randomInt(1, 60)),
      doctorReview: Math.random() < 0.7 ? {
        reviewedBy: pick(allDoctorIds),
        reviewedAt: daysAgo(randomInt(0, 30)),
        verdict: pick(['confirmed', 'confirmed', 'modified']),
        clinicalNotes: 'Scan reviewed. Findings consistent with clinical examination.',
        urgency: pick(['none', 'routine', 'soon']),
      } : undefined,
      createdBy: pick(allDoctorIds),
    });

    const obsTypes = ['plaque', 'inflammation', 'discoloration', 'cavity', 'gum_recession', 'misalignment'];
    scanResultDocs.push({
      scan: scanId, patient: patientIds[patIdx],
      observations: Array.from({ length: randomInt(1, 4) }, () => ({
        type: pick(obsTypes),
        area: pick(['upper left quadrant', 'lower right quadrant', 'anterior region', 'posterior region']),
        toothNumbers: [randomInt(1, 32)],
        confidence: pick(['low', 'medium', 'high']),
        description: `${pick(['Mild', 'Moderate', 'Significant'])} ${pick(obsTypes)} observed in the ${pick(['buccal', 'lingual', 'occlusal', 'mesial'])} surface.`,
      })),
      overallSummary: 'AI analysis complete. Findings suggest routine follow-up recommended. Please consult your dentist for clinical verification.',
      recommendedSpecs: ['General Dentistry'],
      disclaimer: 'This AI analysis is for informational purposes only and does not constitute medical advice.',
      analysisModel: 'dental-vision-v2',
      analysisLatencyMs: randomInt(2000, 8000),
    });
  }

  await DentalScan.insertMany(scanDocs);
  await DentalScanResult.insertMany(scanResultDocs);
  console.log(`  ✅ ${scanDocs.length} dental scans + ${scanResultDocs.length} results created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 19 — CONSENTS
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n📝 Phase 19: Consents...');

  const consentDocs = [];
  for (let c = 0; c < patientIds.length; c++) {
    const patId = patientIds[c];
    consentDocs.push(
      { patient: patId, consentType: 'data_sharing', status: 'active', grantedAt: monthsAgo(randomInt(0, 7)), createdBy: patientUserDocs[c]._id },
      { patient: patId, consentType: 'treatment', status: 'active', grantedAt: monthsAgo(randomInt(0, 7)), createdBy: patientUserDocs[c]._id },
    );
  }

  await Consent.insertMany(consentDocs);
  console.log(`  ✅ ${consentDocs.length} consent records created`);

  // ═════════════════════════════════════════════════════════════════════════
  //  PHASE 20 — PLATFORM CROSS-REFERENCES
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n🔗 Phase 20: Platform Cross-References...');

  // 20a. UserDirectory entries
  const udDocs = [];
  for (const doc of [...doctors, ...staffMembers]) {
    udDocs.push({
      email: doc.email.toLowerCase(), tenantSlug: SLUG,
      clinicId: clinic._id, clinicName: clinic.name,
      clinicCode: clinic.clinicCode || 'JATHR4521',
      userId: doc._id.toString(), role: doc.role,
    });
  }
  for (let i = 0; i < patientUserDocs.length; i++) {
    udDocs.push({
      email: patientUserDocs[i].email.toLowerCase(), tenantSlug: SLUG,
      clinicId: clinic._id, clinicName: clinic.name,
      clinicCode: clinic.clinicCode || 'JATHR4521',
      userId: patientUserDocs[i]._id.toString(), role: 'patient',
    });
  }

  // Upsert to avoid duplicates
  for (const ud of udDocs) {
    await UserDirectory.updateOne(
      { email: ud.email, tenantSlug: ud.tenantSlug },
      { $set: ud },
      { upsert: true },
    );
  }
  console.log(`  ✅ ${udDocs.length} UserDirectory entries`);

  // 20b. PlatformPatient entries
  for (let i = 0; i < Math.min(patientUserDocs.length, 50); i++) {
    const pu = patientUserDocs[i];
    await PlatformPatient.updateOne(
      { email: pu.email.toLowerCase() },
      {
        $set: { name: pu.name, phone: pu.phone, password: pu.password, isActive: true },
        $addToSet: {
          connectedClinics: {
            clinicId: clinic._id, tenantSlug: SLUG,
            clinicName: clinic.name, clinicCode: clinic.clinicCode || 'JATHR4521',
            tenantUserId: pu._id.toString(),
            role: 'patient', connectedAt: new Date(),
          },
        },
      },
      { upsert: true },
    );
  }
  console.log(`  ✅ PlatformPatient entries created`);

  // 20c. FeaturedDoctor entries
  const featuredDoctors = doctors.filter(d => d.isFeaturedOnPlatform);
  for (const doc of featuredDoctors) {
    await FeaturedDoctor.updateOne(
      { clinicSlug: SLUG, tenantDoctorId: doc._id.toString() },
      {
        $set: {
          clinicId: clinic._id, clinicSlug: SLUG, clinicName: clinic.name,
          clinicCity: 'Pune',
          location: { type: 'Point', coordinates: [73.8408, 18.5167] },
          tenantDoctorId: doc._id.toString(),
          name: doc.name,
          specializations: [doc.specialization],
          bio: doc.doctorProfile.bio,
          education: doc.doctorProfile.education,
          experienceYears: doc.doctorProfile.experienceYears,
          qualifications: doc.doctorProfile.qualifications,
          languages: doc.doctorProfile.languages,
          consultationFee: doc.consultationFee,
          acceptingNewPatients: true,
          branchId: doc.branch.toString(),
          branchName: doc.branch.equals(branchFCId) ? 'Jathar Dental — FC Road (Main)' : 'Jathar Dental — Kothrud',
          branchCode: doc.branch.equals(branchFCId) ? 'JDFC' : 'JDKT',
          averageRating: +(4 + Math.random() * 0.8).toFixed(1),
          totalReviews: randomInt(20, 120),
          isActive: true, publishedAt: CLINIC_OPENED,
          verifiedByPlatform: true, verifiedAt: CLINIC_OPENED,
        },
      },
      { upsert: true },
    );
  }
  console.log(`  ✅ ${featuredDoctors.length} FeaturedDoctor entries`);

  // 20d. Update Clinic usage
  await Clinic.updateOne({ slug: SLUG }, {
    $set: {
      status: 'active',
      activatedAt: CLINIC_OPENED,
      'subscription.plan': 'professional',
      'subscription.status': 'active',
      'subscription.currentPeriodEnd': daysFromNow(30),
      'features.maxDoctors': 10,
      'features.maxStaff': 30,
      'features.maxBranches': 3,
      'features.maxStorageMB': 10240,
      'features.maxSmsPerMonth': 2000,
      'features.smsEnabled': true,
      'features.teleHealthEnabled': true,
      'features.customBranding': true,
      'superAdmin.name': 'Dr. Sandeep Jathar',
      'superAdmin.email': 'dr.sandeep@jathardental.in',
      'superAdmin.phone': '9822345678',
      'superAdmin.provisionedAt': CLINIC_OPENED,
      'usage.doctorsCount': doctors.length,
      'usage.staffCount': staffMembers.length,
      'usage.branchesCount': 2,
      'usage.patientsCount': patientDocs.length,
      'usage.lastSyncedAt': new Date(),
      'onboarding.completedAt': CLINIC_OPENED,
      'onboarding.steps.profileComplete': true,
      'onboarding.steps.firstDoctorAdded': true,
      'onboarding.steps.firstPatientAdded': true,
      'address.street': '2nd Floor, Sagar Arcade, FC Road',
      'address.locality': 'Deccan Gymkhana',
      'address.city': 'Pune',
      'address.state': 'Maharashtra',
      'address.zipCode': '411004',
      'address.country': 'IN',
      location: { type: 'Point', coordinates: [73.8408, 18.5167] },
    },
  });
  console.log('  ✅ Clinic record updated with usage data');

  // ═════════════════════════════════════════════════════════════════════════
  //  DONE
  // ═════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 JATHAR DENTAL CLINIC SEEDED SUCCESSFULLY!');
  console.log('═'.repeat(60));
  console.log(`
  📊 Summary:
     Branches:         ${branches.length}
     Departments:      ${departments.length}
     Doctors:          ${doctors.length}
     Staff:            ${staffMembers.length}
     Patients:         ${patientDocs.length}
     Rooms:            ${rooms.length}
     Service Items:    ${serviceItems.length}
     Ins. Providers:   ${insProviders.length}
     Salary Structs:   ${salaryStructures.length}
     Payslips:         ${payslips.length}
     Appointments:     ${insertedAppointments.length}
     Queue Entries:    ${queueDocs.length}
     Treatment Recs:   ${insertedTreatments.length}
     Prescriptions:    ${prescriptionDocs.length}
     Invoices:         ${invoiceDocs.length}
     Payments:         ${paymentDocs.length}
     Ledger Entries:   ${ledgerDocs.length}
     Ins. Claims:      ${claimDocs.length}
     Notifications:    ${notifDocs.length}
     Reviews:          ${reviewDocs.length}
     Dental Scans:     ${scanDocs.length}
     Consents:         ${consentDocs.length}

  🔑 Login Credentials:
     SuperAdmin:  dr.sandeep@jathardental.in / Doctor@2025
     Admin:       vishal@jathardental.in / Staff@2025
     Doctor:      dr.priya@jathardental.in / Doctor@2025
     Receptionist: snehal@jathardental.in / Staff@2025
  `);

  await tenantConn.close();
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
