'use strict';

/**
 * Re-seeds notifications for jathar-dental-clinic with role-based data.
 * Drops all existing notifications and inserts role-appropriate ones.
 *
 * Usage: node scripts/reseed-notifications.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const SLUG = 'jathar-dental';

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(randomInt(7, 20), randomInt(0, 59)); return d; }

async function main() {
  const uri = process.env.PLATFORM_DB_URI;
  if (!uri) { console.error('No PLATFORM_DB_URI found in .env'); process.exit(1); }

  // Connect to platform DB to look up clinic
  await mongoose.connect(uri);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');
  let clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic) {
    // Try without the exact slug
    const all = await Clinic.find({}).select('slug name').lean();
    console.log('Available clinics:', all.map((c) => c.slug));
    process.exit(1);
  }
  if (!clinic.dbUri) {
    // Construct dbUri from platform URI
    const tenantDbName = `bestoclinic_${SLUG.replace(/-/g, '_')}`;
    clinic.dbUri = uri.replace(/\/[^/]+\?/, `/${tenantDbName}?`);
    console.log(`  Constructed dbUri for ${tenantDbName}`);
  }
  console.log(`✅ Found clinic: ${clinic.name}`);

  // Connect directly to tenant DB (no Redis needed)
  const tenantConn = await mongoose.createConnection(clinic.dbUri, { maxPoolSize: 3 }).asPromise();
  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  const User = tenantConn.model('User');
  const Notification = tenantConn.model('Notification');
  console.log('✅ Connected to tenant DB');

  // ── Find users by role ──
  const allUsers = await User.find({ deletedAt: null }).select('_id role name').lean();
  const byRole = {};
  for (const u of allUsers) {
    if (!byRole[u.role]) byRole[u.role] = [];
    byRole[u.role].push(u._id);
  }

  console.log('\nUsers by role:');
  for (const [role, ids] of Object.entries(byRole)) {
    console.log(`  ${role}: ${ids.length}`);
  }

  // ── Drop existing notifications ──
  const deleted = await Notification.deleteMany({});
  console.log(`\nDeleted ${deleted.deletedCount} old notifications`);

  // ── Role-specific notification pools ──
  // Each role only gets types they'd receive in production.

  const doctorNotifs = [
    { type: 'appointment', title: 'New Appointment Scheduled', message: 'Aarav Joshi has been scheduled for an appointment on Apr 8, 10:00 AM.' },
    { type: 'appointment', title: 'New Appointment Scheduled', message: 'Priya Kulkarni has been scheduled for a root canal on Apr 10, 2:30 PM.' },
    { type: 'appointment', title: 'Patient Checked In', message: 'Sneha Patil has checked in for their appointment.' },
    { type: 'appointment', title: 'Patient Checked In', message: 'Rohan Deshmukh has checked in for their appointment.' },
    { type: 'appointment', title: 'Appointment Cancelled', message: 'The appointment with Meera Shah on Apr 9 has been cancelled.' },
    { type: 'appointment', title: 'Patient No-Show', message: 'Vikram Thakur did not show up for their appointment on Apr 7.' },
    { type: 'appointment', title: 'New Appointment Booked', message: 'Patient Ananya Desai booked an appointment via portal.' },
    { type: 'appointment', title: 'Appointment Rescheduled', message: 'Aarav Joshi has rescheduled the appointment to Apr 12, 11:00 AM.' },
    { type: 'appointment', title: 'Patient Confirmed Attendance', message: 'Priya Kulkarni has confirmed attendance for the appointment on Apr 10.' },
    { type: 'alert', title: 'Low Compliance Alert', message: "Patient Rohan Deshmukh's compliance for \"Amoxicillin 500mg\" has dropped to 35%. Please review." },
    { type: 'alert', title: 'Patient Missed Multiple Reminders', message: 'Sneha Patil has missed 4 consecutive reminders for "Post-RCT care". Immediate attention needed.' },
    { type: 'dental_scan', title: 'Dental Scan Needs Review', message: 'A new AI dental scan analysis is ready for your professional review.' },
  ];

  const receptionistNotifs = [
    { type: 'appointment', title: 'New Appointment', message: 'Aarav Joshi scheduled with Dr. Jathar on Apr 8, 10:00 AM.' },
    { type: 'appointment', title: 'New Appointment', message: 'Priya Kulkarni scheduled with Dr. Mehta on Apr 10, 2:30 PM.' },
    { type: 'appointment', title: 'New Appointment', message: 'Walk-in patient Vikram Thakur scheduled with Dr. Jathar on Apr 7, 4:00 PM.' },
    { type: 'appointment', title: 'Appointment Confirmed', message: "Sneha Patil's appointment on Apr 9 has been confirmed." },
    { type: 'appointment', title: 'Appointment Confirmed', message: "Rohan Deshmukh's appointment on Apr 11 has been confirmed." },
    { type: 'appointment', title: 'Appointment Cancelled', message: "Meera Shah's appointment on Apr 9 was cancelled." },
    { type: 'appointment', title: 'Patient No-Show', message: 'Ananya Desai did not show up for their Apr 7 appointment.' },
    { type: 'appointment', title: 'Appointment Completed', message: "Aarav Joshi's appointment with Dr. Jathar is complete." },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹8,500) for Priya Kulkarni has been auto-generated after consultation with Dr. Mehta.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹3,200) for Rohan Deshmukh has been auto-generated after consultation with Dr. Jathar.' },
    { type: 'payment', title: 'Draft Invoice Needs Review', message: 'An invoice (₹5,000) for Sneha Patil has been auto-generated. Some items need manual pricing — invoice is in draft.' },
  ];

  const adminNotifs = [
    { type: 'appointment', title: 'New Appointment Scheduled', message: 'Aarav Joshi has been scheduled for an appointment on Apr 8.' },
    { type: 'appointment', title: 'Appointment Cancelled', message: 'The appointment with Meera Shah on Apr 9 has been cancelled.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹8,500) for Priya Kulkarni has been auto-generated after consultation with Dr. Mehta.' },
    { type: 'payment', title: 'Draft Invoice Needs Review', message: 'An invoice (₹5,000) for Sneha Patil needs manual pricing — invoice is in draft.' },
    { type: 'alert', title: 'Low Stock Alert', message: '3 item(s) are below minimum threshold.' },
    { type: 'alert', title: 'Expiry Alert', message: '2 item(s) are expiring within 30 days.' },
    { type: 'system', title: 'Material Restocked', message: 'Dental Composite Resin has been restocked. 4 procedure(s) may now be available.' },
    { type: 'system', title: 'System Maintenance Scheduled', message: 'System maintenance window: Sunday 2:00-4:00 AM.' },
  ];

  const billingNotifs = [
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹8,500) for Priya Kulkarni has been auto-generated after consultation with Dr. Mehta.' },
    { type: 'payment', title: 'Draft Invoice Needs Review', message: 'An invoice (₹5,000) for Sneha Patil needs manual pricing — invoice is in draft.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹3,200) for Rohan Deshmukh has been auto-generated after consultation with Dr. Jathar.' },
    { type: 'payment', title: 'Invoice Sent to Patient', message: 'An invoice (₹12,000) for Aarav Joshi has been auto-generated after consultation with Dr. Jathar.' },
  ];

  const patientNotifs = [
    { type: 'appointment', title: 'Appointment Confirmed', message: 'Your appointment with Dr. Jathar on Apr 8 has been confirmed.' },
    { type: 'appointment', title: 'Appointment Completed', message: 'Your appointment with Dr. Jathar has been completed.' },
    { type: 'appointment', title: "You're Up!", message: 'Please proceed to Room A. Token #12.' },
    { type: 'appointment', title: 'Consultation Started', message: 'Dr. Jathar has started your consultation.' },
    { type: 'payment', title: 'Invoice Ready', message: 'Your invoice of ₹8,500 from your consultation with Dr. Jathar is ready. You can pay from the app.' },
    { type: 'reminder', title: 'Appointment Reminder', message: 'Your appointment with Dr. Jathar is in 1 hour. Please confirm your attendance.' },
    { type: 'reminder', title: 'Care Reminder: Amoxicillin 500mg', message: 'Time for your medication: Amoxicillin 500mg — take 1 tablet after meals.' },
    { type: 'dental_scan', title: 'Dental Scan Analysis Ready', message: 'Your dental scan has been analyzed. View your results now or wait for a doctor to review them.' },
  ];

  const systemNotifs = [
    { type: 'system', title: 'System Maintenance Scheduled', message: 'System maintenance window: Sunday 2:00-4:00 AM.' },
    { type: 'system', title: 'Backup Completed', message: 'Daily backup completed successfully.' },
    { type: 'system', title: 'Security Update Applied', message: 'Security patches applied. No action needed.' },
  ];

  // ── Build role → pool mapping ──
  const rolePoolMap = {
    doctor:             { pool: doctorNotifs, count: 12 },
    receptionist:       { pool: receptionistNotifs, count: 12 },
    support_staff:      { pool: receptionistNotifs, count: 8 },
    admin:              { pool: adminNotifs, count: 12 },
    super_admin:        { pool: adminNotifs, count: 12 },
    manager:            { pool: adminNotifs, count: 10 },
    billing_officer:    { pool: billingNotifs, count: 8 },
    accountant:         { pool: billingNotifs, count: 6 },
    it_support:         { pool: systemNotifs, count: 4 },
    hr_payroll_manager: { pool: systemNotifs, count: 4 },
    patient:            { pool: patientNotifs, count: 8 },
  };

  const notifDocs = [];

  for (const [role, userIds] of Object.entries(byRole)) {
    const config = rolePoolMap[role];
    if (!config) continue;
    for (const userId of userIds) {
      for (let i = 0; i < config.count; i++) {
        const notif = pick(config.pool);
        const daysBack = randomInt(0, 30);
        const isRead = Math.random() < 0.55;
        notifDocs.push({
          recipient: userId,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          isRead,
          readAt: isRead ? daysAgo(daysBack) : undefined,
          createdAt: daysAgo(daysBack),
        });
      }
    }
  }

  await Notification.insertMany(notifDocs);
  console.log(`\n✅ ${notifDocs.length} role-based notifications seeded`);

  // ── Summary ──
  const typeCounts = {};
  const roleCounts = {};
  for (const doc of notifDocs) {
    typeCounts[doc.type] = (typeCounts[doc.type] || 0) + 1;
  }
  for (const [role, ids] of Object.entries(byRole)) {
    roleCounts[role] = ids.length * (rolePoolMap[role]?.count || 0);
  }
  console.log('\nBy type:', typeCounts);
  console.log('By role:', roleCounts);

  await tenantConn.close();
  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
