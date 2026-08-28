'use strict';

/**
 * Seed script — creates sample job postings for all eligible clinics
 * and ensures credit wallets are properly provisioned.
 *
 * What this script does:
 * 1. Ensures all plans have correct jobPortal features (jobPortalEnabled + jobPostingCredits)
 * 2. Syncs plan features to all clinics on those plans
 * 3. Creates/fixes credit wallets for every clinic with jobPortalEnabled
 * 4. Seeds sample job postings (mix of active + draft) for eligible clinics
 *
 * Usage: npm run seed:jobs
 *        node scripts/seed-jobs.js
 *
 * Safe to re-run — idempotent (skips existing jobs by slug, upserts wallets).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// ─── Job Templates ────────────────────────────────────────

const JOB_TEMPLATES = [
  // ── Dental ──
  {
    title: 'Senior Dental Hygienist',
    department: 'Dental',
    employmentType: 'full_time',
    description:
      'About the Role\nWe are looking for a Senior Dental Hygienist to join our growing team. You will be responsible for providing preventive dental care and educating patients on maintaining good oral hygiene.\n\nResponsibilities\n- Perform dental cleanings, scaling, and root planing\n- Take dental X-rays and impressions\n- Educate patients on proper oral hygiene techniques\n- Document treatment plans and patient progress\n- Assist dentists during procedures as needed\n\nWhat We Offer\n- Competitive salary with performance incentives\n- Health insurance coverage\n- Continuing education allowance\n- Friendly and supportive work environment',
    compensation: { salaryMin: 25000, salaryMax: 40000, currency: 'INR', showSalary: true, hasBenefits: true },
    requirements: {
      experienceLevel: 'mid',
      certifications: ['BDS', 'Dental Hygienist Certificate'],
      skills: ['Periodontics', 'Patient Education', 'Dental X-Ray', 'Infection Control'],
    },
    location: { type: 'on_site' },
    isFeatured: true,
  },
  {
    title: 'Dental Receptionist',
    department: 'Reception',
    employmentType: 'full_time',
    description:
      'About the Role\nWe need a friendly and organized Dental Receptionist to be the first point of contact for our patients. You will manage appointments, handle patient queries, and ensure smooth front-desk operations.\n\nResponsibilities\n- Greet patients and manage check-in/check-out procedures\n- Schedule and confirm appointments\n- Handle phone calls and patient inquiries\n- Process billing and insurance documentation\n- Maintain patient records in the clinic management system\n\nRequirements\n- Excellent communication skills in English and Hindi\n- Basic computer proficiency\n- Previous front-desk or customer service experience preferred\n- Friendly and professional demeanor',
    compensation: { salaryMin: 12000, salaryMax: 18000, currency: 'INR', showSalary: true, hasBenefits: false },
    requirements: {
      experienceLevel: 'entry',
      certifications: [],
      skills: ['Communication', 'Scheduling', 'Billing', 'MS Office'],
    },
    location: { type: 'on_site' },
    isFeatured: false,
  },
  // ── Nursing ──
  {
    title: 'Registered Staff Nurse',
    department: 'Nursing',
    employmentType: 'full_time',
    description:
      'About the Role\nWe are seeking a dedicated Registered Staff Nurse to provide high-quality patient care. You will work closely with doctors and other healthcare professionals to deliver excellent clinical outcomes.\n\nResponsibilities\n- Administer medications and treatments as prescribed\n- Monitor patient vital signs and report changes\n- Maintain accurate patient records and documentation\n- Coordinate with physicians on patient care plans\n- Educate patients and families about health conditions\n\nWhat We Offer\n- Attractive salary with shift allowances\n- Provident Fund and ESI benefits\n- Accommodation support for outstation candidates\n- Career growth opportunities',
    compensation: { salaryMin: 20000, salaryMax: 35000, currency: 'INR', showSalary: true, hasBenefits: true },
    requirements: {
      experienceLevel: 'entry',
      certifications: ['GNM', 'BSc Nursing'],
      skills: ['Patient Care', 'IV Therapy', 'Vital Signs Monitoring', 'EMR Systems'],
    },
    location: { type: 'on_site' },
    isFeatured: false,
  },
  // ── Administration ──
  {
    title: 'Clinic Operations Manager',
    department: 'Administration',
    employmentType: 'full_time',
    description:
      'About the Role\nWe are looking for an experienced Operations Manager to oversee daily clinic operations, manage staff, and drive efficiency improvements across all departments.\n\nResponsibilities\n- Oversee day-to-day clinic operations and workflow\n- Manage staff scheduling, performance, and training\n- Ensure compliance with healthcare regulations\n- Coordinate with vendors and manage supply chain\n- Prepare operational reports and budgets\n- Implement process improvements for better patient experience\n\nRequirements\n- MBA or equivalent in Healthcare Management preferred\n- Minimum 3 years of healthcare operations experience\n- Strong leadership and organizational skills\n- Proficiency in clinic management software',
    compensation: { salaryMin: 40000, salaryMax: 65000, currency: 'INR', showSalary: true, hasBenefits: true },
    requirements: {
      experienceLevel: 'senior',
      certifications: ['MBA Healthcare', 'Hospital Administration'],
      skills: ['Operations Management', 'Staff Management', 'Budgeting', 'Compliance'],
    },
    location: { type: 'on_site' },
    isFeatured: true,
  },
  // ── Specialist ──
  {
    title: 'Consultant Cardiologist',
    department: 'Cardiology',
    employmentType: 'full_time',
    description:
      'About the Role\nWe are hiring a Consultant Cardiologist to lead our cardiology department. You will be responsible for diagnosing and treating cardiovascular conditions, performing procedures, and mentoring junior doctors.\n\nResponsibilities\n- Diagnose and treat cardiovascular diseases\n- Perform echocardiograms, stress tests, and interventional procedures\n- Collaborate with multidisciplinary teams on complex cases\n- Mentor and train resident doctors\n- Participate in clinical research and quality improvement programs\n\nWhat We Offer\n- Highly competitive salary package\n- Academic and research support\n- State-of-the-art cardiac catheterization lab\n- Conference and CME sponsorship',
    compensation: { salaryMin: 150000, salaryMax: 300000, currency: 'INR', showSalary: true, hasBenefits: true },
    requirements: {
      experienceLevel: 'senior',
      certifications: ['MD Medicine', 'DM Cardiology', 'MCI Registration'],
      skills: ['Echocardiography', 'Interventional Cardiology', 'Critical Care', 'Research'],
    },
    location: { type: 'on_site' },
    isFeatured: true,
  },
  // ── Technician ──
  {
    title: 'Lab Technician',
    department: 'Laboratory',
    employmentType: 'full_time',
    description:
      'About the Role\nWe need a skilled Lab Technician to handle diagnostic laboratory testing. You will process patient samples, operate lab equipment, and ensure accurate and timely results.\n\nResponsibilities\n- Collect and process blood and urine samples\n- Operate and maintain lab equipment (CBC analyzers, biochemistry analyzers)\n- Perform routine diagnostic tests and report results\n- Ensure quality control procedures are followed\n- Maintain lab hygiene and safety standards\n\nRequirements\n- DMLT or BSc MLT qualification required\n- 1-2 years of clinical laboratory experience preferred\n- Knowledge of lab safety protocols\n- Attention to detail and accuracy',
    compensation: { salaryMin: 15000, salaryMax: 22000, currency: 'INR', showSalary: true, hasBenefits: false },
    requirements: {
      experienceLevel: 'entry',
      certifications: ['DMLT', 'BSc MLT'],
      skills: ['Sample Processing', 'Lab Equipment', 'Quality Control', 'Safety Protocols'],
    },
    location: { type: 'on_site' },
    isFeatured: false,
  },
  // ── Part-time / Contract roles ──
  {
    title: 'Part-time Physiotherapist',
    department: 'Specialist',
    employmentType: 'part_time',
    description:
      'About the Role\nWe are looking for a Part-time Physiotherapist to provide rehabilitation services to our orthopedic and post-surgical patients. Flexible morning or evening shifts available.\n\nResponsibilities\n- Assess patients and develop rehabilitation plans\n- Perform therapeutic exercises and manual therapy\n- Monitor patient progress and adjust treatment\n- Educate patients on home exercises\n- Maintain treatment records\n\nSchedule\n- 4 hours per day, 5 days a week\n- Morning (8 AM - 12 PM) or Evening (4 PM - 8 PM) shifts available',
    compensation: { salaryMin: 15000, salaryMax: 25000, currency: 'INR', showSalary: true, hasBenefits: false },
    requirements: {
      experienceLevel: 'mid',
      certifications: ['BPT', 'MPT'],
      skills: ['Manual Therapy', 'Rehabilitation', 'Patient Assessment', 'Exercise Prescription'],
    },
    location: { type: 'on_site' },
    isFeatured: false,
  },
  {
    title: 'Medical Billing Specialist',
    department: 'Finance',
    employmentType: 'full_time',
    description:
      'About the Role\nWe need a Medical Billing Specialist to manage patient billing, insurance claims, and revenue cycle operations. You will work with the finance team to ensure timely and accurate billing.\n\nResponsibilities\n- Process patient bills and insurance claims\n- Verify insurance coverage and benefits\n- Follow up on denied or pending claims\n- Generate billing reports and track collections\n- Coordinate with clinical staff on coding accuracy\n\nRequirements\n- Bachelor\'s degree in Commerce or related field\n- Experience with medical billing software\n- Knowledge of insurance claim procedures\n- Excellent attention to detail',
    compensation: { salaryMin: 18000, salaryMax: 28000, currency: 'INR', showSalary: true, hasBenefits: false },
    requirements: {
      experienceLevel: 'mid',
      certifications: [],
      skills: ['Medical Billing', 'Insurance Claims', 'Revenue Cycle', 'Tally/Accounting Software'],
    },
    location: { type: 'on_site' },
    isFeatured: false,
  },
  {
    title: 'Telemedicine Coordinator',
    department: 'Clinical',
    employmentType: 'full_time',
    description:
      'About the Role\nAs a Telemedicine Coordinator, you will manage our virtual consultation platform, ensuring seamless teleconsultation experiences for both doctors and patients.\n\nResponsibilities\n- Schedule and manage telemedicine appointments\n- Assist patients with virtual consultation setup\n- Troubleshoot technical issues during consultations\n- Coordinate follow-ups between patients and doctors\n- Generate reports on telemedicine utilization\n\nRequirements\n- Strong technical aptitude\n- Excellent communication and coordination skills\n- Experience in healthcare setting preferred\n- Comfortable working with video conferencing tools',
    compensation: { salaryMin: 20000, salaryMax: 30000, currency: 'INR', showSalary: true, hasBenefits: false },
    requirements: {
      experienceLevel: 'entry',
      certifications: [],
      skills: ['Telemedicine Platforms', 'Scheduling', 'Technical Support', 'Patient Communication'],
    },
    location: { type: 'hybrid' },
    isFeatured: false,
  },
  {
    title: 'Pediatric Consultant',
    department: 'Pediatrics',
    employmentType: 'full_time',
    description:
      'About the Role\nWe are looking for a compassionate Pediatric Consultant to provide comprehensive care for infants, children, and adolescents. You will work in a child-friendly environment with a dedicated pediatric team.\n\nResponsibilities\n- Diagnose and treat childhood illnesses and conditions\n- Conduct well-child examinations and immunizations\n- Counsel parents on child development and nutrition\n- Handle pediatric emergencies\n- Collaborate with other specialists for complex cases\n\nWhat We Offer\n- Competitive remuneration\n- Modern pediatric ward and NICU facility\n- Supportive multidisciplinary team\n- Work-life balance with structured schedules',
    compensation: { salaryMin: 80000, salaryMax: 150000, currency: 'INR', showSalary: true, hasBenefits: true },
    requirements: {
      experienceLevel: 'senior',
      certifications: ['MD Pediatrics', 'DCH', 'MCI Registration'],
      skills: ['Neonatology', 'Vaccination', 'Child Development', 'Emergency Pediatrics'],
    },
    location: { type: 'on_site' },
    isFeatured: true,
  },
];

// Which jobs go to which clinic type (by plan)
const CLINIC_JOB_MAP = {
  // Professional plans get 3-4 jobs each
  professional: {
    'smilecare-dental':        [0, 1, 2],        // Dental Hygienist, Receptionist, Nurse
    'ortholife-clinic':        [2, 6, 3],         // Nurse, Physiotherapist, Operations Manager
    'neurohealth-clinic':      [2, 7, 8],         // Nurse, Billing Specialist, Telemedicine Coordinator
    'momcare-hospital':        [2, 9, 3, 1],      // Nurse, Pediatric Consultant, Ops Manager, Receptionist
  },
  // Enterprise plans get 4-5 jobs each
  enterprise: {
    'healthplus-hospital':     [4, 2, 3, 5, 7],   // Cardiologist, Nurse, Ops Manager, Lab Tech, Billing
    'cardiocare-heart':        [4, 2, 5, 8, 6],    // Cardiologist, Nurse, Lab Tech, Telemedicine, Physiotherapist
  },
};

// ─── Main Seed Function ───────────────────────────────────

async function seed() {
  const env = require('../src/config/env');

  try {
    await mongoose.connect(env.PLATFORM_DB_URI);
    console.log('Connected to platform DB');

    // Register models
    require('../src/models/platform/Clinic');
    require('../src/models/platform/Subscription');
    require('../src/models/platform/PlatformUser');
    require('../src/models/platform/Plan');
    require('../src/models/platform/CreditWallet');
    require('../src/models/platform/CreditTransaction');
    require('../src/models/platform/JobPosting');

    const Plan = mongoose.model('Plan');
    const Clinic = mongoose.model('Clinic');
    const CreditWallet = mongoose.model('CreditWallet');
    const CreditTransaction = mongoose.model('CreditTransaction');
    const JobPosting = mongoose.model('JobPosting');

    // ═══════════════════════════════════════════════════════
    // STEP 1: Ensure plans have correct jobPortal features
    // ═══════════════════════════════════════════════════════

    console.log('\n--- Step 1: Sync plan job portal features ---');

    const planFeatures = [
      { slug: 'free',         jobPortalEnabled: false, jobPostingCredits: 0 },
      { slug: 'starter',      jobPortalEnabled: false, jobPostingCredits: 0 },
      { slug: 'professional', jobPortalEnabled: true,  jobPostingCredits: 5 },
      { slug: 'enterprise',   jobPortalEnabled: true,  jobPostingCredits: 20 },
    ];

    for (const pf of planFeatures) {
      const result = await Plan.updateOne(
        { slug: pf.slug },
        { $set: { 'features.jobPortalEnabled': pf.jobPortalEnabled, 'features.jobPostingCredits': pf.jobPostingCredits } },
      );
      if (result.matchedCount > 0) {
        console.log(`  Plan "${pf.slug}": jobPortalEnabled=${pf.jobPortalEnabled}, credits=${pf.jobPostingCredits}`);
      } else {
        console.log(`  Plan "${pf.slug}" not found — skipped`);
      }
    }

    // ═══════════════════════════════════════════════════════
    // STEP 2: Sync features from plans to clinics
    // ═══════════════════════════════════════════════════════

    console.log('\n--- Step 2: Sync clinic features from their plans ---');

    const allPlans = await Plan.find({}).lean();
    const planMap = Object.fromEntries(allPlans.map((p) => [p.slug, p]));

    const allClinics = await Clinic.find({ deletedAt: null }).select('name slug subscription features');

    let syncedCount = 0;
    for (const clinic of allClinics) {
      const clinicPlan = clinic.subscription?.plan;
      const plan = planMap[clinicPlan];
      if (!plan) continue;

      // Check if features need syncing
      const needsSync =
        clinic.features?.jobPortalEnabled !== plan.features?.jobPortalEnabled ||
        clinic.features?.jobPostingCredits !== plan.features?.jobPostingCredits;

      if (needsSync) {
        await Clinic.updateOne(
          { _id: clinic._id },
          {
            $set: {
              'features.jobPortalEnabled': plan.features.jobPortalEnabled,
              'features.jobPostingCredits': plan.features.jobPostingCredits,
            },
          },
        );
        console.log(`  Synced "${clinic.name}" (${clinicPlan}): jobPortalEnabled=${plan.features.jobPortalEnabled}, credits=${plan.features.jobPostingCredits}`);
        syncedCount++;
      }
    }
    if (syncedCount === 0) console.log('  All clinics already in sync');

    // ═══════════════════════════════════════════════════════
    // STEP 3: Audit & fix credit wallets
    // ═══════════════════════════════════════════════════════

    console.log('\n--- Step 3: Audit credit wallets ---');

    // Reload clinics with updated features
    const eligibleClinics = await Clinic.find({
      'features.jobPortalEnabled': true,
      status: 'active',
      deletedAt: null,
    }).select('_id name slug features subscription');

    console.log(`  Found ${eligibleClinics.length} clinic(s) with job portal enabled`);

    let walletsCreated = 0;
    let walletsFixed = 0;

    for (const clinic of eligibleClinics) {
      const monthlyCredits = clinic.features?.jobPostingCredits || 0;
      let wallet = await CreditWallet.findOne({ clinic: clinic._id });

      if (!wallet) {
        // Create wallet with initial grant equal to plan's monthly credits
        wallet = await CreditWallet.create({
          clinic: clinic._id,
          balance: monthlyCredits,
          totalPurchased: monthlyCredits,
          totalConsumed: 0,
        });

        // Record the initial grant transaction
        if (monthlyCredits > 0) {
          await CreditTransaction.create({
            wallet: wallet._id,
            clinic: clinic._id,
            type: 'plan_grant',
            amount: monthlyCredits,
            balanceAfter: monthlyCredits,
            action: 'plan_monthly_grant',
            reference: {},
            description: `Initial credit grant — ${monthlyCredits} credits (seed)`,
            performedBy: 'system',
          });
        }

        console.log(`  CREATED wallet for "${clinic.name}" — balance: ${monthlyCredits}`);
        walletsCreated++;
      } else if (wallet.balance === 0 && wallet.totalConsumed === 0 && wallet.totalPurchased === 0 && monthlyCredits > 0) {
        // Wallet exists but has never received credits — grant initial batch
        const updated = await CreditWallet.findByIdAndUpdate(
          wallet._id,
          {
            $inc: { balance: monthlyCredits, totalPurchased: monthlyCredits },
            $set: { lastTopUpAt: new Date() },
          },
          { new: true },
        );

        await CreditTransaction.create({
          wallet: wallet._id,
          clinic: clinic._id,
          type: 'plan_grant',
          amount: monthlyCredits,
          balanceAfter: updated.balance,
          action: 'plan_monthly_grant',
          reference: {},
          description: `Initial credit grant — ${monthlyCredits} credits (seed fix)`,
          performedBy: 'system',
        });

        console.log(`  FIXED wallet for "${clinic.name}" — granted ${monthlyCredits} credits (was 0)`);
        walletsFixed++;
      } else {
        console.log(`  OK wallet for "${clinic.name}" — balance: ${wallet.balance}, consumed: ${wallet.totalConsumed}`);
      }
    }

    console.log(`\n  Wallets: ${walletsCreated} created, ${walletsFixed} fixed, ${eligibleClinics.length - walletsCreated - walletsFixed} already OK`);

    // ═══════════════════════════════════════════════════════
    // STEP 4: Seed job postings
    // ═══════════════════════════════════════════════════════

    console.log('\n--- Step 4: Seed job postings ---');

    let jobsCreated = 0;
    let jobsSkipped = 0;

    for (const [planSlug, clinicMap] of Object.entries(CLINIC_JOB_MAP)) {
      for (const [clinicSlug, templateIndexes] of Object.entries(clinicMap)) {
        const clinic = await Clinic.findOne({ slug: clinicSlug }).select('_id name slug address features');
        if (!clinic) {
          console.log(`  Clinic "${clinicSlug}" not found — skipping`);
          continue;
        }

        // Get wallet for credit deduction on published jobs
        const wallet = await CreditWallet.findOne({ clinic: clinic._id });

        for (let i = 0; i < templateIndexes.length; i++) {
          const template = JOB_TEMPLATES[templateIndexes[i]];
          const slugBase = template.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 60);
          const jobSlug = `${slugBase}-${clinicSlug}`;

          // Check if job already exists
          const existing = await JobPosting.findOne({ slug: jobSlug }).setOptions({ skipSoftDelete: true });
          if (existing) {
            console.log(`  SKIP "${template.title}" at ${clinic.name} (already exists)`);
            jobsSkipped++;
            continue;
          }

          // First job per clinic is a draft, rest are active
          const isDraft = i === templateIndexes.length - 1 && templateIndexes.length > 2;
          const isActive = !isDraft;
          const now = new Date();
          const creditCost = isActive ? (template.isFeatured ? 3 : 1) : 0;

          const jobData = {
            clinic: clinic._id,
            clinicName: clinic.name,
            clinicLocation: {
              city: clinic.address?.city,
              state: clinic.address?.state,
              country: clinic.address?.country || 'IN',
            },
            title: template.title,
            slug: jobSlug,
            department: template.department,
            employmentType: template.employmentType,
            description: template.description,
            compensation: template.compensation,
            requirements: template.requirements,
            location: {
              ...template.location,
              city: clinic.address?.city || '',
              state: clinic.address?.state || '',
            },
            isFeatured: isActive ? template.isFeatured : false,
            status: isActive ? 'active' : 'draft',
            creditCost,
            publishedAt: isActive ? now : null,
            expiresAt: isActive ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
            stats: { views: isActive ? Math.floor(Math.random() * 200) + 10 : 0, applications: 0 },
            createdBy: 'seed-script',
          };

          await JobPosting.create(jobData);

          // Deduct credits for published jobs
          if (isActive && wallet && wallet.balance >= creditCost) {
            await CreditWallet.findByIdAndUpdate(
              wallet._id,
              {
                $inc: { balance: -creditCost, totalConsumed: creditCost },
                $set: { lastDeductionAt: now },
              },
              { new: true },
            );

            const updatedWallet = await CreditWallet.findById(wallet._id);
            await CreditTransaction.create({
              wallet: wallet._id,
              clinic: clinic._id,
              type: 'deduction',
              amount: -creditCost,
              balanceAfter: updatedWallet.balance,
              action: 'job_post_publish',
              reference: {},
              description: `Published job: ${template.title}${template.isFeatured ? ' (featured)' : ''} (seed)`,
              performedBy: 'system',
            });

            // Update local wallet reference for subsequent iterations
            wallet.balance = updatedWallet.balance;
          }

          const statusLabel = isActive ? (template.isFeatured ? 'ACTIVE+FEATURED' : 'ACTIVE') : 'DRAFT';
          console.log(`  CREATED [${statusLabel}] "${template.title}" at ${clinic.name} (cost: ${creditCost})`);
          jobsCreated++;
        }
      }
    }

    console.log(`\n  Jobs: ${jobsCreated} created, ${jobsSkipped} skipped (already existed)`);

    // ═══════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════

    console.log('\n' + '='.repeat(60));
    console.log('SEED COMPLETE');
    console.log('='.repeat(60));

    // Final audit
    const totalJobs = await JobPosting.countDocuments({ deletedAt: null });
    const activeJobs = await JobPosting.countDocuments({ status: 'active', deletedAt: null });
    const draftJobs = await JobPosting.countDocuments({ status: 'draft', deletedAt: null });
    const totalWallets = await CreditWallet.countDocuments();

    console.log(`\nFinal State:`);
    console.log(`  Total job postings: ${totalJobs} (${activeJobs} active, ${draftJobs} drafts)`);
    console.log(`  Total credit wallets: ${totalWallets}`);

    console.log(`\nWallet Balances:`);
    for (const clinic of eligibleClinics) {
      const w = await CreditWallet.findOne({ clinic: clinic._id });
      if (w) {
        console.log(`  ${clinic.name}: balance=${w.balance}, purchased=${w.totalPurchased}, consumed=${w.totalConsumed}`);
      }
    }

    console.log(`\nJob Postings by Clinic:`);
    for (const clinic of eligibleClinics) {
      const jobs = await JobPosting.find({ clinic: clinic._id, deletedAt: null }).select('title status isFeatured');
      if (jobs.length > 0) {
        console.log(`  ${clinic.name}:`);
        for (const j of jobs) {
          const label = j.status === 'active' ? (j.isFeatured ? 'ACTIVE+FEATURED' : 'ACTIVE') : 'DRAFT';
          console.log(`    [${label}] ${j.title}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

seed();
