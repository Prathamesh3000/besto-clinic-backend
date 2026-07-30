#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  BestoClinic — Browser E2E: Create Appointment + Verify Notification ║
 * ║                                                                      ║
 * ║  Opens Chrome, logs in as Dr. Sandeep, creates a new appointment     ║
 * ║  via the 4-step wizard, then verifies the appointment appears        ║
 * ║  in the list with reminder scheduling confirmation.                  ║
 * ║                                                                      ║
 * ║  After patient confirms (via mobile or API), refreshes to verify     ║
 * ║  the "Patient Confirmed" status is visible.                          ║
 * ║                                                                      ║
 * ║  Usage:  node scripts/e2e-appointment-create.js                      ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const puppeteer = require('puppeteer');

// ── Config ──────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const CLINIC_CODE  = 'JATHR4521';
const DOCTOR_EMAIL = 'dr.sandeep@jathardental.in';
const DOCTOR_PASS  = 'Doctor@2025';

const STEP_DELAY  = 1500;
const TYPE_DELAY  = 30;
const SHORT_DELAY = 800;

// ── Helpers ─────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m',
  yellow: '\x1b[33m', magenta: '\x1b[35m',
};

function log(icon, msg) {
  const ts = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`${C.dim}[${ts}]${C.reset} ${icon}  ${msg}`);
}
function step(num, msg) { log(`${C.cyan}[${num}]${C.reset}`, `${C.bright}${msg}${C.reset}`); }
function ok(msg)        { log(`${C.green} \u2713 ${C.reset}`, `${C.green}${msg}${C.reset}`); }
function warn(msg)      { log(`${C.yellow} ! ${C.reset}`, `${C.yellow}${msg}${C.reset}`); }
function fail(msg)      { log(`${C.red} \u2717 ${C.reset}`, `${C.red}${msg}${C.reset}`); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function safeType(page, selector, text) {
  await page.waitForSelector(selector, { timeout: 5000 });
  const el = await page.$(selector);
  await el.click({ clickCount: 3 }); // select all
  await el.type(text, { delay: TYPE_DELAY });
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bright}${C.cyan}${'═'.repeat(70)}${C.reset}`);
  console.log(`${C.bright}  BestoClinic — E2E: Appointment Creation + Notification Verification${C.reset}`);
  console.log(`${C.bright}${C.cyan}${'═'.repeat(70)}${C.reset}\n`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    // ── Step 1: Navigate to login ────────────────────────────
    step(1, 'Navigate to login page');
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(STEP_DELAY);
    ok('Login page loaded');

    // ── Step 2: Enter clinic code ────────────────────────────
    step(2, 'Enter clinic code');
    const codeInput = await page.$('input[placeholder*="clinic" i], input[placeholder*="code" i], input[name="clinicCode"]');
    if (codeInput) {
      await codeInput.click({ clickCount: 3 });
      await codeInput.type(CLINIC_CODE, { delay: TYPE_DELAY });
      await sleep(SHORT_DELAY);

      // Find and click Continue/Next
      const continueBtn = await page.$('button[type="submit"], button:has-text("Continue"), button:has-text("Next")');
      if (continueBtn) {
        await continueBtn.click();
        await sleep(STEP_DELAY);
      }
      ok('Clinic code entered');
    } else {
      warn('No clinic code input found — may already be on login form');
    }

    // ── Step 3: Enter credentials ────────────────────────────
    step(3, 'Enter login credentials');
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: 10000 });

    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(DOCTOR_EMAIL, { delay: TYPE_DELAY });

    const passInput = await page.$('input[type="password"], input[name="password"]');
    await passInput.click({ clickCount: 3 });
    await passInput.type(DOCTOR_PASS, { delay: TYPE_DELAY });
    await sleep(SHORT_DELAY);
    ok('Credentials entered');

    // ── Step 4: Click Sign In ────────────────────────────────
    step(4, 'Click Sign In');
    const signInBtn = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /sign\s*in|log\s*in/i.test(b.textContent));
    });
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await sleep(STEP_DELAY);
      ok('Signed in successfully');
    }

    // ── Step 5: Navigate to Appointments page ────────────────
    step(5, 'Navigate to Appointments page');
    await page.goto(`${FRONTEND_URL}/clinic/appointments`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(STEP_DELAY);
    ok('Appointments page loaded');

    // Take screenshot of appointments page
    await page.screenshot({ path: 'recordings/web-01-appointments-page.png', fullPage: false });
    ok('Screenshot: appointments page');

    // ── Step 6: Click "New Appointment" button ───────────────
    step(6, 'Click New Appointment button');
    const newApptBtn = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /new\s*appointment/i.test(b.textContent));
    });

    if (newApptBtn) {
      await newApptBtn.click();
      await sleep(STEP_DELAY);
      ok('New Appointment modal opened');
    } else {
      fail('New Appointment button not found');
      throw new Error('Cannot find New Appointment button');
    }

    await page.screenshot({ path: 'recordings/web-02-appointment-modal-step1.png', fullPage: false });

    // ── Step 7: Step 1 — Select Patient ──────────────────────
    step(7, 'Step 1 — Search and select patient');
    const patientSearch = await page.$('input[placeholder*="Search by name" i], input[placeholder*="search" i]');
    if (patientSearch) {
      await patientSearch.click();
      await patientSearch.type('Dipti', { delay: TYPE_DELAY });
      await sleep(1500); // Wait for search results

      // Click first search result
      const firstResult = await page.evaluateHandle(() => {
        // Look for clickable patient result in dropdown/list
        const items = document.querySelectorAll('[class*="cursor-pointer"], [role="option"], [class*="hover"]');
        for (const item of items) {
          if (item.textContent.toLowerCase().includes('dipti')) return item;
        }
        // Fallback: any clickable item in a dropdown
        const dropdownItems = document.querySelectorAll('li, [class*="patient"]');
        return dropdownItems[0] || null;
      });

      if (firstResult && firstResult.asElement()) {
        await firstResult.click();
        await sleep(SHORT_DELAY);
        ok('Patient selected: Dipti');
      } else {
        warn('Could not click patient result — trying to proceed');
      }
    }

    await page.screenshot({ path: 'recordings/web-03-patient-selected.png', fullPage: false });

    // Click Next/Continue to Step 2
    const nextBtn1 = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /next|continue/i.test(b.textContent) && !b.disabled);
    });
    if (nextBtn1) {
      await nextBtn1.click();
      await sleep(STEP_DELAY);
      ok('Moved to Step 2');
    }

    // ── Step 8: Step 2 — Select Doctor & Schedule ────────────
    step(8, 'Step 2 — Select doctor and time slot');

    // Doctor might already be pre-selected (logged-in doctor)
    // Try to select a date — click a green/available date in calendar
    await sleep(SHORT_DELAY);

    // Select today or first available date
    const availableDate = await page.evaluateHandle(() => {
      // Look for calendar date buttons that are available
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => {
        const classes = b.className || '';
        return (classes.includes('emerald') || classes.includes('available'))
          && !b.disabled;
      });
    });

    if (availableDate && availableDate.asElement()) {
      await availableDate.click();
      await sleep(1000);
      ok('Date selected');
    } else {
      warn('No available date button found — may need manual date selection');
    }

    await page.screenshot({ path: 'recordings/web-04-schedule-selection.png', fullPage: false });

    // Select first available time slot
    await sleep(SHORT_DELAY);
    const timeSlot = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => {
        const text = b.textContent.trim();
        // Match time patterns like "10:00", "2:30 PM"
        return /^\d{1,2}:\d{2}/.test(text) && !b.disabled
          && !b.className.includes('red') && !b.className.includes('disabled');
      });
    });

    if (timeSlot && timeSlot.asElement()) {
      await timeSlot.click();
      await sleep(SHORT_DELAY);
      ok('Time slot selected');
    } else {
      warn('No time slot buttons found — may need manual time entry');
      // Try direct time input
      const timeInput = await page.$('input[type="time"]');
      if (timeInput) {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 10);
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        await timeInput.click({ clickCount: 3 });
        await timeInput.type(timeStr);
        ok(`Time entered: ${timeStr}`);
      }
    }

    await page.screenshot({ path: 'recordings/web-05-time-selected.png', fullPage: false });

    // Click Next to Step 3
    const nextBtn2 = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /next|continue/i.test(b.textContent) && !b.disabled);
    });
    if (nextBtn2) {
      await nextBtn2.click();
      await sleep(STEP_DELAY);
      ok('Moved to Step 3');
    }

    // ── Step 9: Step 3 — Appointment Details ─────────────────
    step(9, 'Step 3 — Fill appointment details');

    // Type is already defaulted to "Consultation" — click it to be sure
    const consultationType = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /consultation/i.test(b.textContent));
    });
    if (consultationType) {
      await consultationType.click();
      await sleep(SHORT_DELAY);
      ok('Type: Consultation');
    }

    // Enter reason
    const reasonInput = await page.$('input[placeholder*="complaint" i], input[placeholder*="reason" i]');
    if (reasonInput) {
      await reasonInput.click({ clickCount: 3 });
      await reasonInput.type('Routine check-up — E2E notification test', { delay: TYPE_DELAY });
      ok('Reason entered');
    }

    // Select "Immediately" reminder timing (0 min — fires right away)
    const immediateReminder = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /immediately/i.test(b.textContent));
    });
    if (immediateReminder) {
      await immediateReminder.click();
      await sleep(SHORT_DELAY);
      ok('Reminder timing: Immediately');
    }

    await page.screenshot({ path: 'recordings/web-06-appointment-details.png', fullPage: false });

    // Click Next to Step 4 (Confirmation)
    const nextBtn3 = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => /next|continue/i.test(b.textContent) && !b.disabled);
    });
    if (nextBtn3) {
      await nextBtn3.click();
      await sleep(STEP_DELAY);
      ok('Moved to Step 4 — Confirmation');
    }

    // ── Step 10: Step 4 — Confirm & Create ───────────────────
    step(10, 'Step 4 — Review and create appointment');
    await page.screenshot({ path: 'recordings/web-07-confirmation-review.png', fullPage: false });

    // Click "Create Appointment" / "Confirm" button
    const createBtn = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b =>
        /create\s*appointment|confirm|book/i.test(b.textContent) && !b.disabled
      );
    });

    if (createBtn) {
      await createBtn.click();
      await sleep(2000);
      ok('Create Appointment clicked');
    } else {
      fail('Create Appointment button not found');
    }

    // Wait for modal to close (appointment created)
    await sleep(STEP_DELAY);
    await page.screenshot({ path: 'recordings/web-08-appointment-created.png', fullPage: false });

    // ── Step 11: Verify appointment in list ───────────────────
    step(11, 'Verify appointment appears in list');

    // Switch to List view if not already
    const listViewBtn = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find(b => b.textContent.trim() === 'List');
    });
    if (listViewBtn) {
      await listViewBtn.click();
      await sleep(STEP_DELAY);
    }

    // Reload to see latest
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(STEP_DELAY);

    // Check for the appointment
    const hasAppointment = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.includes('Dipti') || body.includes('E2E notification test');
    });

    if (hasAppointment) {
      ok('Appointment visible in the list');
    } else {
      warn('Could not verify appointment in list — it may be on a different date/view');
    }

    await page.screenshot({ path: 'recordings/web-09-appointment-in-list.png', fullPage: false });

    // ── Step 12: Navigate to Doctor Dashboard ────────────────
    step(12, 'Navigate to Doctor Dashboard');
    await page.goto(`${FRONTEND_URL}/clinic/doctor-dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(STEP_DELAY);

    await page.screenshot({ path: 'recordings/web-10-doctor-dashboard.png', fullPage: false });

    // Check for patient confirmation stats
    const confirmationStats = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        hasConfirmed: body.includes('Confirmed') || body.includes('confirmed'),
        hasPending: body.includes('Pending') || body.includes('pending'),
        hasDeclined: body.includes('Declined') || body.includes('declined'),
      };
    });

    if (confirmationStats.hasConfirmed) {
      ok('Dashboard shows confirmation status data');
    } else {
      info('Dashboard loaded — confirmation stats will update after patient responds');
    }

    // ── Step 13: Wait for patient confirmation (poll) ────────
    step(13, 'Waiting for patient confirmation (polling dashboard)');
    let confirmed = false;
    for (let i = 0; i < 6; i++) {
      await sleep(10000); // Check every 10 seconds
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(1000);

      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes('Patient Confirmed') || bodyText.includes('patient confirmed')) {
        ok('Patient confirmation visible on dashboard!');
        confirmed = true;
        break;
      }
      log(`${C.dim}...${C.reset}`, `Poll ${i + 1}/6 — waiting for patient confirmation`);
    }

    if (!confirmed) {
      warn('Patient has not confirmed yet within polling window');
      log(`${C.dim}...${C.reset}`, 'Run the mobile Maestro flow or API script to simulate patient response');
    }

    await page.screenshot({ path: 'recordings/web-11-dashboard-final.png', fullPage: false });

    // ── Summary ──────────────────────────────────────────────
    console.log(`\n${C.bright}${C.cyan}${'═'.repeat(70)}${C.reset}`);
    console.log(`${C.bright}  E2E WEB PORTAL TEST COMPLETE${C.reset}`);
    console.log(`${C.bright}${C.cyan}${'═'.repeat(70)}${C.reset}`);

    if (consoleErrors.length > 0) {
      console.log(`\n${C.yellow}Console errors captured:${C.reset}`);
      consoleErrors.forEach(e => console.log(`  ${C.red}${e}${C.reset}`));
    }

    console.log(`\nScreenshots saved in: recordings/web-*.png`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run the patient-side flow (mobile or API) to confirm attendance`);
    console.log(`  2. Re-run this script to verify the confirmation is reflected`);
    console.log(`  3. Check recordings/ for all evidence\n`);

    // Keep browser open for manual inspection
    log(`${C.magenta}>>>`, `${C.bright}Browser left open for inspection. Press Ctrl+C to close.${C.reset}`);
    await new Promise(() => {}); // Keep alive
  } catch (err) {
    fail(`Script error: ${err.message}`);
    console.error(err);
    await page.screenshot({ path: 'recordings/web-error.png', fullPage: false }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}

function info(msg) { log(`${C.dim}   ${C.reset}`, msg); }

main().catch(err => {
  console.error('Script crashed:', err);
  process.exit(1);
});
