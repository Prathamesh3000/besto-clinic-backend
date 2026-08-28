'use strict';

/**
 * Seed script — creates DoctorSchedule and DoctorLeave entries for all
 * existing doctors in a tenant database.
 *
 * Usage:
 *   node scripts/seed-schedules.js <tenant-slug>
 *   e.g.  node scripts/seed-schedules.js smilecare-dental
 *
 * What it does:
 *   1. Connects to platform DB → finds clinic by slug
 *   2. Connects to tenant DB → loads existing doctors & branches
 *   3. Creates DoctorSchedule per doctor per branch (upserts — safe to re-run)
 *   4. Creates a few realistic DoctorLeave entries for demo/testing
 *
 * Each specialization gets a different realistic schedule:
 *   - General Dentistry:   Mon-Fri 09:00-18:00, Sat 09:00-13:00
 *   - Periodontics:        Mon-Fri 10:00-19:00, Sat 10:00-14:00
 *   - Orthodontics:        Mon-Fri 09:30-17:30, Sat OFF
 *   - Cosmetic Dentistry:  Mon-Fri 10:00-18:00, Sat 10:00-14:00
 *   - Endodontics:         Mon-Fri 09:00-17:00, Sat 09:00-13:00
 *   - Oral Surgery:        Mon-Fri 08:00-16:00, Sat OFF (surgeons start early)
 *   - Prosthodontics:      Mon-Fri 09:00-17:30, Sat 09:00-12:00
 *   - Pediatric Dentistry: Mon-Fri 10:00-17:00, Sat 10:00-14:00 (kid-friendly hours)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const SLUG = process.argv[2];
if (!SLUG) {
  console.error('Usage: node scripts/seed-schedules.js <tenant-slug>');
  process.exit(1);
}

// ── Specialization-based schedules ──────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function buildWeek(weekdayStart, weekdayEnd, weekdayBreakStart, weekdayBreakEnd, satStart, satEnd, satBreakStart, satBreakEnd) {
  return DAYS.map((day) => {
    if (day === 'sunday') {
      return { day, isWorking: false, startTime: '09:00', endTime: '18:00', breakStart: null, breakEnd: null };
    }
    if (day === 'saturday') {
      if (!satStart) {
        return { day, isWorking: false, startTime: '09:00', endTime: '18:00', breakStart: null, breakEnd: null };
      }
      return { day, isWorking: true, startTime: satStart, endTime: satEnd, breakStart: satBreakStart || null, breakEnd: satBreakEnd || null };
    }
    // weekday
    return { day, isWorking: true, startTime: weekdayStart, endTime: weekdayEnd, breakStart: weekdayBreakStart || null, breakEnd: weekdayBreakEnd || null };
  });
}

const SCHEDULE_BY_SPECIALIZATION = {
  'General Dentistry': {
    slotDuration: 30,
    bufferMinutes: 5,
    minNoticeMinutes: 15,
    maxAdvanceDays: 60,
    weeklySchedule: buildWeek('09:00', '18:00', '13:00', '14:00', '09:00', '13:00', null, null),
  },
  Periodontics: {
    slotDuration: 45,
    bufferMinutes: 10,
    minNoticeMinutes: 30,
    maxAdvanceDays: 45,
    weeklySchedule: buildWeek('10:00', '19:00', '13:30', '14:30', '10:00', '14:00', null, null),
  },
  Orthodontics: {
    slotDuration: 30,
    bufferMinutes: 5,
    minNoticeMinutes: 15,
    maxAdvanceDays: 90,
    weeklySchedule: buildWeek('09:30', '17:30', '13:00', '13:30', null, null, null, null), // Sat OFF
  },
  'Cosmetic Dentistry': {
    slotDuration: 45,
    bufferMinutes: 15,
    minNoticeMinutes: 30,
    maxAdvanceDays: 60,
    weeklySchedule: buildWeek('10:00', '18:00', '13:00', '14:00', '10:00', '14:00', null, null),
  },
  Endodontics: {
    slotDuration: 60, // RCT procedures are longer
    bufferMinutes: 15,
    minNoticeMinutes: 30,
    maxAdvanceDays: 30,
    weeklySchedule: buildWeek('09:00', '17:00', '12:30', '13:30', '09:00', '13:00', null, null),
  },
  'Oral Surgery': {
    slotDuration: 60, // surgeries need more time
    bufferMinutes: 30,
    minNoticeMinutes: 60,
    maxAdvanceDays: 30,
    weeklySchedule: buildWeek('08:00', '16:00', '12:00', '13:00', null, null, null, null), // Sat OFF
  },
  Prosthodontics: {
    slotDuration: 45,
    bufferMinutes: 10,
    minNoticeMinutes: 30,
    maxAdvanceDays: 45,
    weeklySchedule: buildWeek('09:00', '17:30', '13:00', '14:00', '09:00', '12:00', null, null),
  },
  'Pediatric Dentistry': {
    slotDuration: 20, // shorter for kids
    bufferMinutes: 5,
    minNoticeMinutes: 15,
    maxAdvanceDays: 30,
    weeklySchedule: buildWeek('10:00', '17:00', '13:00', '13:30', '10:00', '14:00', null, null),
  },
};

// Default schedule for specializations not listed above
const DEFAULT_SCHEDULE = {
  slotDuration: 30,
  bufferMinutes: 5,
  minNoticeMinutes: 15,
  maxAdvanceDays: 60,
  weeklySchedule: buildWeek('09:00', '18:00', '13:00', '14:00', '09:00', '13:00', null, null),
};

// ── Sample leaves (relative to today) ────────────────────────────

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildLeaves(today) {
  // Returns an array of leave templates; each doctor gets one leave picked round-robin
  return [
    {
      startDate: addDays(today, 7),
      endDate: addDays(today, 7),
      reason: 'Annual dental conference — Indian Dental Association',
      leaveType: 'conference',
      status: 'approved',
    },
    {
      startDate: addDays(today, 14),
      endDate: addDays(today, 15),
      reason: 'Personal time off',
      leaveType: 'personal',
      status: 'approved',
    },
    {
      startDate: addDays(today, 21),
      endDate: addDays(today, 23),
      reason: 'Attending advanced implantology workshop',
      leaveType: 'conference',
      status: 'approved',
    },
    {
      startDate: addDays(today, 10),
      endDate: addDays(today, 10),
      reason: 'Planned medical check-up',
      leaveType: 'planned',
      status: 'approved',
    },
    {
      startDate: addDays(today, 30),
      endDate: addDays(today, 34),
      reason: 'Family vacation',
      leaveType: 'personal',
      status: 'approved',
    },
    {
      startDate: addDays(today, 5),
      endDate: addDays(today, 5),
      reason: 'National oral health camp volunteering',
      leaveType: 'other',
      status: 'approved',
    },
    {
      startDate: addDays(today, 18),
      endDate: addDays(today, 19),
      reason: 'CME credit training program',
      leaveType: 'conference',
      status: 'approved',
    },
    {
      startDate: addDays(today, 25),
      endDate: addDays(today, 25),
      reason: 'Personal day',
      leaveType: 'personal',
      status: 'pending', // one pending leave for demo
    },
  ];
}

// ── Main ──────────────────────────────────────────────────

async function seed() {
  const env = require('../src/config/env');

  // ── 1. Connect to platform DB & find clinic ───────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

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
  const DoctorSchedule = tenantConn.model('DoctorSchedule');
  const DoctorLeave = tenantConn.model('DoctorLeave');

  // ── 3. Fetch existing doctors and branches ─────────────
  const doctors = await User.find({ role: 'doctor', deletedAt: null, isActive: true });
  const branches = await Branch.find({ deletedAt: null, isActive: true });

  if (doctors.length === 0) {
    console.error('No active doctors found! Run seed-featured-doctors.js first.');
    await tenantConn.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  if (branches.length === 0) {
    console.error('No active branches found!');
    await tenantConn.close();
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found ${doctors.length} active doctor(s):`);
  for (const doc of doctors) {
    console.log(`  • ${doc.name} — ${doc.specialization || 'No specialization'} (branch: ${doc.branch || 'unassigned'})`);
  }
  console.log(`\nFound ${branches.length} branch(es):`);
  for (const b of branches) {
    console.log(`  • ${b.name} (${b._id})`);
  }

  // ── 4. Create/update DoctorSchedule entries ────────────
  console.log('\n--- Seeding Doctor Schedules ---');
  let scheduleCreated = 0;
  let scheduleUpdated = 0;

  for (const doctor of doctors) {
    // Determine which branch to assign
    const branchId = doctor.branch || branches[0]._id;
    const branch = branches.find((b) => b._id.toString() === branchId.toString()) || branches[0];

    // Pick schedule config by specialization
    const spec = doctor.specialization?.trim() || '';
    const config = SCHEDULE_BY_SPECIALIZATION[spec] || DEFAULT_SCHEDULE;

    const filter = { doctor: doctor._id, branch: branch._id, deletedAt: null };
    const update = {
      doctor: doctor._id,
      branch: branch._id,
      slotDuration: config.slotDuration,
      bufferMinutes: config.bufferMinutes ?? 0,
      minNoticeMinutes: config.minNoticeMinutes ?? 60,
      maxAdvanceDays: config.maxAdvanceDays ?? 60,
      weeklySchedule: config.weeklySchedule,
      isActive: true,
      deletedAt: null,
    };

    const result = await DoctorSchedule.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      scheduleCreated++;
      console.log(`  + ${doctor.name} (${spec || 'default'}) @ ${branch.name}`);
      // Log summary
      const workingDays = config.weeklySchedule.filter((d) => d.isWorking).map((d) => d.day.slice(0, 3));
      const sample = config.weeklySchedule.find((d) => d.isWorking);
      const noticeLabel = config.minNoticeMinutes >= 60 ? `${Math.round(config.minNoticeMinutes / 60)}h` : `${config.minNoticeMinutes}m`;
      console.log(`    ${workingDays.join(', ')} | ${sample?.startTime}-${sample?.endTime} | slot: ${config.slotDuration}min | buffer: ${config.bufferMinutes ?? 0}min | notice: ${noticeLabel} | max: ${config.maxAdvanceDays ?? 60}d`);
      if (sample?.breakStart) console.log(`    break: ${sample.breakStart}-${sample.breakEnd}`);
    } else {
      scheduleUpdated++;
      console.log(`  ~ ${doctor.name} (${spec || 'default'}) — updated`);
    }
  }

  console.log(`\nSchedules: ${scheduleCreated} created, ${scheduleUpdated} updated`);

  // ── 5. Create DoctorLeave entries ──────────────────────
  console.log('\n--- Seeding Doctor Leaves ---');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leaveTemplates = buildLeaves(today);

  let leaveCreated = 0;
  let leaveSkipped = 0;

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    // Each doctor gets 1-2 leaves, round-robin through templates
    const leavesForDoctor = [
      leaveTemplates[i % leaveTemplates.length],
    ];
    // Give every other doctor a second leave
    if (i % 2 === 0 && leaveTemplates[(i + 3) % leaveTemplates.length]) {
      leavesForDoctor.push(leaveTemplates[(i + 3) % leaveTemplates.length]);
    }

    for (const template of leavesForDoctor) {
      // Check for duplicate (same doctor, same start date)
      const existing = await DoctorLeave.findOne({
        doctor: doctor._id,
        startDate: template.startDate,
        deletedAt: null,
      });

      if (existing) {
        leaveSkipped++;
        console.log(`  ○ ${doctor.name}: ${template.startDate.toISOString().slice(0, 10)} — already exists`);
        continue;
      }

      await DoctorLeave.create({
        doctor: doctor._id,
        startDate: template.startDate,
        endDate: template.endDate,
        reason: template.reason,
        leaveType: template.leaveType,
        branch: null, // applies to all branches
        status: template.status,
      });
      leaveCreated++;

      const dateRange = template.startDate.toISOString().slice(0, 10) === template.endDate.toISOString().slice(0, 10)
        ? template.startDate.toISOString().slice(0, 10)
        : `${template.startDate.toISOString().slice(0, 10)} → ${template.endDate.toISOString().slice(0, 10)}`;

      console.log(`  + ${doctor.name}: ${dateRange} (${template.leaveType}, ${template.status})`);
      console.log(`    "${template.reason}"`);
    }
  }

  console.log(`\nLeaves: ${leaveCreated} created, ${leaveSkipped} skipped (already exist)`);

  // ── 6. Verification ──────────────────────────────────
  console.log('\n=== Verification ===');

  const totalSchedules = await DoctorSchedule.countDocuments({ deletedAt: null, isActive: true });
  const totalLeaves = await DoctorLeave.countDocuments({ deletedAt: null });
  const pendingLeaves = await DoctorLeave.countDocuments({ deletedAt: null, status: 'pending' });
  const approvedLeaves = await DoctorLeave.countDocuments({ deletedAt: null, status: 'approved' });

  console.log(`  Total active schedules: ${totalSchedules}`);
  console.log(`  Total leaves: ${totalLeaves} (${approvedLeaves} approved, ${pendingLeaves} pending)`);

  // Print schedule summary table
  console.log('\n  Schedule Summary:');
  console.log('  ┌────────────────────────────┬──────┬────────┬─────────┬─────────┬──────────────┬──────────────┬───────────────┐');
  console.log('  │ Doctor                     │ Slot │ Buffer │ Notice  │ MaxAdv  │ Weekday      │ Saturday     │ Break         │');
  console.log('  ├────────────────────────────┼──────┼────────┼─────────┼─────────┼──────────────┼──────────────┼───────────────┤');

  const allSchedules = await DoctorSchedule.find({ deletedAt: null, isActive: true }).populate('doctor', 'name');
  for (const sched of allSchedules) {
    const name = (sched.doctor?.name || 'Unknown').padEnd(26).slice(0, 26);
    const slot = String(sched.slotDuration).padStart(4);
    const buf = String(sched.bufferMinutes ?? 0).padStart(4) + 'm';
    const notice = sched.minNoticeMinutes >= 60
      ? `${Math.round(sched.minNoticeMinutes / 60)}h`.padStart(5)
      : `${sched.minNoticeMinutes}m`.padStart(5);
    const maxAdv = `${sched.maxAdvanceDays ?? 60}d`.padStart(5);
    const weekday = sched.weeklySchedule.find((d) => d.day === 'monday');
    const sat = sched.weeklySchedule.find((d) => d.day === 'saturday');

    const wdHours = weekday?.isWorking ? `${weekday.startTime}-${weekday.endTime}` : 'OFF';
    const satHours = sat?.isWorking ? `${sat.startTime}-${sat.endTime}` : 'OFF';
    const brk = weekday?.breakStart ? `${weekday.breakStart}-${weekday.breakEnd}` : '—';

    console.log(`  │ ${name} │ ${slot} │ ${buf}  │ ${notice}   │ ${maxAdv}   │ ${wdHours.padEnd(12)} │ ${satHours.padEnd(12)} │ ${brk.padEnd(13)} │`);
  }
  console.log('  └────────────────────────────┴──────┴────────┴─────────┴─────────┴──────────────┴──────────────┴───────────────┘');

  // ── Cleanup ────────────────────────────────────────────
  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\nDone!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
