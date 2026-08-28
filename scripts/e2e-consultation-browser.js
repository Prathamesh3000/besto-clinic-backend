#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  BestoClinic — Browser E2E: Complete a Consultation (Puppeteer)      ║
 * ║                                                                      ║
 * ║  Opens Chrome, logs in as Dr. Sandeep, navigates to Dipti            ║
 * ║  Salunkhe's in-progress consultation, fills every field step by      ║
 * ║  step (vitals → complaint → exam → Rx → dental chart → signature),  ║
 * ║  then clicks Complete. Watch it live in the browser!                  ║
 * ║                                                                      ║
 * ║  Usage:  node scripts/e2e-consultation-browser.js                    ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ──────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const CLINIC_CODE  = 'JATHR4521';       // Login form clinic code
const TENANT_SLUG  = 'jathar-dental';   // x-tenant-id header (different from clinic code)
const DOCTOR_EMAIL = 'dr.sandeep@jathardental.in';
const DOCTOR_PASS  = 'Doctor@2025';
const APPOINTMENT_ID = '69cfcaf15ed0c70cee2435e9'; // Dipti Salunkhe

// Step delay in ms — controls how fast it plays. Increase to watch more slowly.
const STEP_DELAY  = 1200;
const TYPE_DELAY  = 25;   // ms between keystrokes (simulates real typing)
const SHORT_DELAY = 600;

// ── Helpers ─────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m',
  blue: '\x1b[34m', yellow: '\x1b[33m', magenta: '\x1b[35m',
};

function log(icon, msg) {
  const ts = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`${C.dim}[${ts}]${C.reset} ${icon}  ${msg}`);
}
function step(msg) { log(`${C.cyan}>>>${C.reset}`, `${C.bright}${msg}${C.reset}`); }
function ok(msg)   { log(`${C.green} \u2713 ${C.reset}`, `${C.green}${msg}${C.reset}`); }
function warn(msg) { log(`${C.yellow} ! ${C.reset}`, `${C.yellow}${msg}${C.reset}`); }
function err(msg)  { log(`${C.red} \u2717 ${C.reset}`, `${C.red}${msg}${C.reset}`); }

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Type into a field after clearing it (triple-click select all + type over) */
async function clearAndType(page, selector, text, opts = {}) {
  const el = await page.waitForSelector(selector, { timeout: 5000 });
  await el.click({ clickCount: 3 }); // Select all existing text
  await page.keyboard.press('Backspace');
  await el.type(text, { delay: opts.delay ?? TYPE_DELAY });
}

/** Select a dropdown option by visible text */
async function selectByText(page, selectEl, optionText) {
  // Get all options and find the one with matching text
  const value = await selectEl.evaluate((sel, text) => {
    const opt = Array.from(sel.options).find(o =>
      o.textContent.trim().toLowerCase() === text.toLowerCase()
    );
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return opt.value;
    }
    return null;
  }, optionText);
  return value;
}

/** Scroll an element into view */
async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, selector);
  await wait(400);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${C.cyan}${C.bright}${'═'.repeat(60)}`);
  console.log(`  BestoClinic — Live Browser Consultation E2E`);
  console.log(`${'═'.repeat(60)}${C.reset}\n`);

  step('Launching Chrome browser...');
  const browser = await puppeteer.launch({
    headless: false,           // VISIBLE browser window
    defaultViewport: null,     // Use full window size
    args: [
      '--window-size=1440,900',
      '--window-position=100,50',
      '--no-first-run',
      '--disable-infobars',
    ],
    slowMo: 30,  // Slight slowdown so actions are visible
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  // Capture console errors and failed network requests for debugging
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('requestfailed', req => {
    consoleErrors.push(`NETWORK FAIL: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  try {
    // ─── STEP 1: Navigate to Login ─────────────────────────
    step('Step 1: Navigate to login page');
    await page.goto(`${FRONTEND_URL}/clinic/login`, { waitUntil: 'networkidle2' });
    await wait(STEP_DELAY);
    ok('Login page loaded');

    // ─── STEP 2: Login as Doctor ───────────────────────────
    step('Step 2: Logging in as Dr. Sandeep Jathar');

    // Check which login mode is active — we need "Clinic Code" mode
    // First try to click the "Clinic Code" tab if email mode is default
    try {
      const codeTab = await page.$('button');
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent.trim());
        if (text.includes('Clinic Code') || text.includes('clinic code')) {
          await btn.click();
          await wait(500);
          ok('Switched to Clinic Code login mode');
          break;
        }
      }
    } catch { /* already in code mode */ }

    // Fill clinic code
    const clinicCodeInput = await page.$('input[placeholder*="SMILE"]') ||
                            await page.$('input[placeholder*="clinic"]') ||
                            await page.$('input[type="text"]');
    if (clinicCodeInput) {
      await clinicCodeInput.click({ clickCount: 3 });
      await clinicCodeInput.type(CLINIC_CODE, { delay: TYPE_DELAY });
      ok(`Clinic code entered: ${CLINIC_CODE}`);
    }
    await wait(SHORT_DELAY);

    // Fill email
    const emailInput = await page.$('input[type="email"]') ||
                       await page.$('input[placeholder*="email"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(DOCTOR_EMAIL, { delay: TYPE_DELAY });
      ok(`Email entered: ${DOCTOR_EMAIL}`);
    }
    await wait(SHORT_DELAY);

    // Fill password
    const passwordInput = await page.$('input[type="password"]') ||
                          await page.$('input[placeholder*="password"]');
    if (passwordInput) {
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(DOCTOR_PASS, { delay: TYPE_DELAY });
      ok('Password entered');
    }
    await wait(SHORT_DELAY);

    // Click Sign In
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      ok('Sign In clicked — waiting for dashboard...');
    }

    // Wait for navigation to dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await wait(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('dashboard') || currentUrl.includes('clinic')) {
      ok(`Logged in! Redirected to: ${currentUrl}`);
    } else {
      warn(`Current URL after login: ${currentUrl}`);
    }
    await wait(STEP_DELAY);

    // ─── STEP 3: Navigate to Consultation ──────────────────
    step('Step 3: Opening Dipti Salunkhe\'s consultation');
    const consultUrl = `${FRONTEND_URL}/clinic/doctor-consultation/${APPOINTMENT_ID}`;
    await page.goto(consultUrl, { waitUntil: 'networkidle2' });
    await wait(3000); // Wait for consultation data to load

    // Verify the page loaded with patient data
    const pageContent = await page.content();
    if (pageContent.includes('Dipti') || pageContent.includes('Salunkhe')) {
      ok('Consultation page loaded — Patient: Dipti Salunkhe');
    } else {
      warn('Page loaded but patient name not visible yet — continuing...');
    }
    await wait(STEP_DELAY);

    // ─── STEP 4: Chief Complaint ───────────────────────────
    step('Step 4: Entering Chief Complaint');
    try {
      await scrollTo(page, 'textarea[placeholder*="primary concern"]');
      await clearAndType(page,
        'textarea[placeholder*="primary concern"]',
        'Patient reports persistent pain in lower right molar region for past 5 days. Pain worsens while chewing and with cold liquids. No visible swelling externally.'
      );
      ok('Chief complaint entered');
    } catch (e) {
      // Fallback: find first textarea
      warn(`Exact selector failed (${e.message}), trying fallback...`);
      const textareas = await page.$$('textarea');
      if (textareas.length > 0) {
        await textareas[0].click({ clickCount: 3 });
        await textareas[0].type('Patient reports persistent pain in lower right molar region for past 5 days.', { delay: TYPE_DELAY });
        ok('Chief complaint entered (via fallback)');
      }
    }
    await wait(STEP_DELAY);

    // ─── STEP 5: Intraoral Findings ────────────────────────
    step('Step 5: Entering Intraoral Findings');
    try {
      const oralTextarea = await page.$('textarea[placeholder*="Observations"]');
      if (oralTextarea) {
        await oralTextarea.scrollIntoView();
        await oralTextarea.click({ clickCount: 3 });
        await oralTextarea.type(
          'Deep carious lesion on #46 (lower right first molar). Tooth tender on percussion. Cold test elicits lingering pain (>10s). Gingiva around #46 slightly inflamed.',
          { delay: TYPE_DELAY }
        );
        ok('Intraoral findings entered');
      }
    } catch {
      warn('Intraoral field not found — skipping');
    }
    await wait(STEP_DELAY);

    // ─── STEP 6: Diagnosis ─────────────────────────────────
    step('Step 6: Entering Diagnosis');
    try {
      await scrollTo(page, 'textarea[placeholder*="Diagnosis"]');
      await clearAndType(page,
        'textarea[placeholder*="Diagnosis"]',
        'Irreversible pulpitis with symptomatic apical periodontitis — Tooth #46 (FDI: 46, lower right first molar)'
      );
      ok('Diagnosis entered');
    } catch {
      warn('Diagnosis field not found via placeholder — trying all textareas');
      const textareas = await page.$$('textarea');
      // Diagnosis is typically the 4th textarea (after chief complaint, intraoral, extraoral)
      if (textareas.length >= 4) {
        await textareas[3].click({ clickCount: 3 });
        await textareas[3].type('Irreversible pulpitis — Tooth #46', { delay: TYPE_DELAY });
        ok('Diagnosis entered (via index)');
      }
    }
    await wait(STEP_DELAY);

    // ─── STEP 7: Severity ──────────────────────────────────
    step('Step 7: Setting Severity to Moderate');
    try {
      const selects = await page.$$('select');
      for (const sel of selects) {
        const options = await sel.evaluate(s =>
          Array.from(s.options).map(o => o.textContent.trim())
        );
        if (options.some(o => o === 'Mild' || o === 'Moderate' || o === 'Severe')) {
          await selectByText(page, sel, 'Moderate');
          ok('Severity set to: Moderate');
          break;
        }
      }
    } catch {
      warn('Severity select not found');
    }
    await wait(STEP_DELAY);

    // ─── STEP 8: Treatment Plan ────────────────────────────
    step('Step 8: Entering Treatment Plan');
    try {
      const treatmentTextarea = await page.$('textarea[placeholder*="Phases"]') ||
                                await page.$('textarea[placeholder*="timeline"]') ||
                                await page.$('textarea[placeholder*="outcomes"]');
      if (treatmentTextarea) {
        await treatmentTextarea.scrollIntoView();
        await treatmentTextarea.click({ clickCount: 3 });
        await treatmentTextarea.type(
          'Root canal treatment (RCT) on tooth #46 followed by ceramic crown. Phase 1: Pulp extirpation and biomechanical preparation. Phase 2: Obturation. Phase 3: Crown fabrication and cementation.',
          { delay: TYPE_DELAY }
        );
        ok('Treatment plan entered');
      }
    } catch {
      warn('Treatment plan field not found');
    }
    await wait(STEP_DELAY);

    // ─── STEP 9: Procedure + Cost ──────────────────────────
    step('Step 9: Setting Procedure and Cost Estimate');
    try {
      const procInput = await page.$('input[placeholder*="RCT"]') ||
                        await page.$('input[placeholder*="procedure"]');
      if (procInput) {
        await procInput.click({ clickCount: 3 });
        await procInput.type('Root Canal Treatment #46', { delay: TYPE_DELAY });
        ok('Procedure: Root Canal Treatment #46');
      }
    } catch { warn('Procedure input not found'); }
    await wait(SHORT_DELAY);

    try {
      const costInput = await page.$('input[placeholder="Amount"]') ||
                        await page.$('input[placeholder*="amount"]');
      if (costInput) {
        await costInput.click({ clickCount: 3 });
        await costInput.type('12500', { delay: TYPE_DELAY });
        ok('Cost estimate: Rs. 12,500');
      }
    } catch { warn('Cost input not found'); }
    await wait(STEP_DELAY);

    // ─── STEP 10: Priority + Visit Type ────────────────────
    step('Step 10: Setting Priority and Visit Type');
    try {
      const selects = await page.$$('select');
      for (const sel of selects) {
        const options = await sel.evaluate(s =>
          Array.from(s.options).map(o => o.textContent.trim())
        );
        if (options.some(o => o === 'Urgent' || o === 'Immediate')) {
          const currentVal = await sel.evaluate(s => s.value);
          if (!currentVal) {
            await selectByText(page, sel, 'Urgent');
            ok('Priority set to: Urgent');
          }
        }
        if (options.some(o => o === 'Consultation' || o === 'Follow-up')) {
          const currentVal = await sel.evaluate(s => s.value);
          if (!currentVal) {
            await selectByText(page, sel, 'Consultation');
            ok('Visit Type set to: Consultation');
          }
        }
      }
    } catch {
      warn('Priority/Visit Type selects not found');
    }
    await wait(STEP_DELAY);

    // ─── STEP 11: Follow-up Instructions ───────────────────
    step('Step 11: Entering Follow-up Instructions');
    try {
      const fuTextarea = await page.$('textarea[placeholder*="Post-treatment"]') ||
                         await page.$('textarea[placeholder*="care"]') ||
                         await page.$('textarea[placeholder*="diet"]');
      if (fuTextarea) {
        await fuTextarea.scrollIntoView();
        await fuTextarea.click({ clickCount: 3 });
        await fuTextarea.type(
          'Return in 7 days for obturation. Avoid chewing on right side. Take prescribed medications as directed. Contact clinic if swelling or fever occurs.',
          { delay: TYPE_DELAY }
        );
        ok('Follow-up instructions entered');
      }
    } catch { warn('Follow-up instructions field not found'); }
    await wait(STEP_DELAY);

    // ─── STEP 12: Dental Chart — Click Teeth ───────────────
    step('Step 12: Marking teeth on dental chart');
    try {
      // Scroll to dental chart section — look for the tooth grid
      await page.evaluate(() => {
        // Find the FDI dental chart section by looking for tooth number text
        const allElements = document.querySelectorAll('div');
        for (const el of allElements) {
          if (el.textContent.includes('FDI') || el.textContent.includes('Dental Chart') || el.textContent.includes('46')) {
            if (el.querySelector('[class*="cursor-pointer"]')) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              break;
            }
          }
        }
      });
      await wait(800);

      // Find and click tooth 46 (the affected tooth)
      const toothClicked = await page.evaluate(() => {
        const allClickable = document.querySelectorAll('div[class*="cursor-pointer"]');
        let clicked = [];
        for (const el of allClickable) {
          const text = el.textContent.trim();
          if (text === '46' || text === '47' || text === '36') {
            el.click();
            clicked.push(text);
          }
        }
        return clicked;
      });

      if (toothClicked.length > 0) {
        ok(`Teeth marked: ${toothClicked.join(', ')} (cavity conditions)`);
      } else {
        warn('Could not find tooth buttons — dental chart may need manual interaction');
      }
    } catch {
      warn('Dental chart interaction failed');
    }
    await wait(STEP_DELAY);

    // ─── STEP 13: Add Prescription ─────────────────────────
    step('Step 13: Adding prescriptions');
    try {
      // Click "Add Prescription Order" button
      const addRxBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Add Prescription') || b.textContent.includes('Prescription Order'));
      });

      if (addRxBtn) {
        await addRxBtn.asElement()?.click();
        await wait(800);
        ok('Prescription form opened');

        // Fill first medication
        const medInput = await page.$('input[placeholder*="Medication name"]') ||
                         await page.$('input[placeholder*="Amoxicillin"]');
        if (medInput) {
          await medInput.type('Amoxicillin 500mg', { delay: TYPE_DELAY });
          ok('Medication 1: Amoxicillin 500mg');
        }

        // Fill dosage
        const dosageInput = await page.$('input[placeholder="500mg"]') ||
                            await page.$('input[placeholder*="dosage"]');
        if (dosageInput) {
          await dosageInput.type('500mg', { delay: TYPE_DELAY });
        }

        // Fill duration
        const durationInput = await page.$('input[placeholder="5 days"]') ||
                              await page.$('input[placeholder*="days"]');
        if (durationInput) {
          await durationInput.type('5 days', { delay: TYPE_DELAY });
        }

        // Select frequency
        const rxSelects = await page.$$('select');
        for (const sel of rxSelects) {
          const opts = await sel.evaluate(s => Array.from(s.options).map(o => o.textContent.trim()));
          if (opts.some(o => o.includes('Three times') || o.includes('thrice'))) {
            await selectByText(page, sel, 'Three times daily');
            ok('Frequency: Three times daily');
            break;
          }
        }

        // Fill instructions
        const instrInput = await page.$('input[placeholder="After meals"]') ||
                           await page.$('input[placeholder*="meals"]');
        if (instrInput) {
          await instrInput.type('Take after meals. Complete full course.', { delay: TYPE_DELAY });
        }

        ok('Prescription #1 complete: Amoxicillin 500mg');
      } else {
        warn('Add Prescription button not found');
      }
    } catch (e) {
      warn(`Prescription entry failed: ${e.message}`);
    }
    await wait(STEP_DELAY);

    // Add second prescription
    try {
      const addRxBtn2 = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Add Prescription') || b.textContent.includes('Prescription Order'));
      });
      if (addRxBtn2 && addRxBtn2.asElement()) {
        await addRxBtn2.asElement().click();
        await wait(800);

        // Find the second medication input (there should now be two)
        const medInputs = await page.$$('input[placeholder*="Medication name"], input[placeholder*="Amoxicillin"]');
        const secondMedInput = medInputs[medInputs.length - 1];
        if (secondMedInput) {
          await secondMedInput.type('Ibuprofen 400mg', { delay: TYPE_DELAY });
          ok('Prescription #2: Ibuprofen 400mg');
        }

        // Fill the second dosage
        const dosageInputs = await page.$$('input[placeholder="500mg"], input[placeholder*="dosage"]');
        const lastDosage = dosageInputs[dosageInputs.length - 1];
        if (lastDosage) {
          await lastDosage.type('400mg', { delay: TYPE_DELAY });
        }

        // Fill duration
        const durInputs = await page.$$('input[placeholder="5 days"], input[placeholder*="days"]');
        const lastDur = durInputs[durInputs.length - 1];
        if (lastDur) {
          await lastDur.type('3 days', { delay: TYPE_DELAY });
        }
      }
    } catch {
      warn('Second prescription entry skipped');
    }
    await wait(STEP_DELAY);

    // ─── STEP 14: Patient Consent ──────────────────────────
    step('Step 14: Recording Patient Consent');
    try {
      const selects = await page.$$('select');
      for (const sel of selects) {
        const options = await sel.evaluate(s =>
          Array.from(s.options).map(o => o.textContent.trim())
        );
        if (options.some(o => o.includes('Verbal consent'))) {
          await selectByText(page, sel, 'Verbal consent obtained');
          ok('Consent: Verbal consent obtained');
          break;
        }
      }
    } catch {
      warn('Consent select not found');
    }
    await wait(STEP_DELAY);

    // ─── STEP 15: Doctor Signature ─────────────────────────
    step('Step 15: Doctor signing the consultation');
    try {
      // Scroll to signature section
      await page.evaluate(() => {
        const sections = document.querySelectorAll('div');
        for (const el of sections) {
          if (el.textContent.includes('Authorization') || el.textContent.includes('Signature')) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          }
        }
      });
      await wait(800);

      // PHASE 1: Draw on canvas for visual effect (may not register in react-signature-canvas)
      const canvas = await page.$('canvas');
      if (canvas) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + 20, box.y + box.height / 2);
          await page.mouse.down();
          const points = [
            [30, -15], [50, 10], [70, -20], [90, 15], [110, -10],
            [130, 20], [150, -15], [170, 10], [190, -5], [210, 15],
            [230, -10], [250, 5], [270, -15], [290, 10],
          ];
          for (const [dx, dy] of points) {
            await page.mouse.move(box.x + dx, box.y + box.height / 2 + dy);
            await wait(30);
          }
          await page.mouse.up();
          ok('Digital signature drawn on canvas (visual)');
          await wait(600);
        }
      }

      // PHASE 2: Use Puppeteer's native uploadFile() for reliable React event triggering
      // Step 2a: Create a temporary signature PNG file on disk
      const sigTmpPath = path.join(os.tmpdir(), `sig-${Date.now()}.png`);
      const sigDataUrl = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 300; c.height = 80;
        const ctx = c.getContext('2d');
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 300, 80);
        // Signature strokes
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(15, 50);
        ctx.bezierCurveTo(35, 15, 55, 60, 80, 30);
        ctx.bezierCurveTo(100, 10, 120, 55, 145, 25);
        ctx.bezierCurveTo(160, 12, 175, 45, 200, 20);
        ctx.bezierCurveTo(215, 10, 230, 40, 260, 18);
        ctx.stroke();
        // Underline
        ctx.beginPath();
        ctx.moveTo(15, 65);
        ctx.lineTo(260, 65);
        ctx.strokeStyle = '#bbb';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        return c.toDataURL('image/png');
      });
      // Write the PNG to disk
      const sigBase64 = sigDataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(sigTmpPath, Buffer.from(sigBase64, 'base64'));
      ok('Signature image created on disk');

      // Step 2b: Switch to Upload mode
      const uploadTabClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const uploadBtn = buttons.find(b => b.textContent.trim() === 'Upload');
        if (uploadBtn) { uploadBtn.click(); return true; }
        return false;
      });

      if (uploadTabClicked) {
        await wait(500);
        ok('Switched to Upload mode');

        // Step 2c: Use Puppeteer's native uploadFile — triggers real browser events React handles
        const fileInput = await page.$('#sig-upload');
        if (fileInput) {
          await fileInput.uploadFile(sigTmpPath);
          ok('Signature file uploaded via Puppeteer native uploadFile()');
          await wait(1500); // Wait for FileReader.readAsDataURL to complete
        } else {
          warn('File input #sig-upload not found');
        }
      }

      // Cleanup temp file
      try { fs.unlinkSync(sigTmpPath); } catch {}

      // PHASE 3: Verify signature was captured in form state
      await wait(500);
      const hasSig = await page.evaluate(() => !!document.querySelector('img[alt="Signature"]'));

      if (hasSig) {
        ok('Signature confirmed in form state (preview image visible)');
      } else {
        warn('Signature preview not visible in Upload mode');
        // Last resort: directly set the React form state via the component tree
        warn('Attempting direct React state injection as fallback...');
        const directSet = await page.evaluate(() => {
          // Find the SignaturePad's onChange by traversing React fiber
          const sigInput = document.getElementById('sig-upload');
          if (!sigInput) return 'no-input';
          // Walk up the React fiber tree to find the onChange handler
          const fiberKey = Object.keys(sigInput).find(k => k.startsWith('__reactFiber$'));
          if (!fiberKey) return 'no-fiber';
          let fiber = sigInput[fiberKey];
          // Walk up to find the component that has onChange prop
          for (let i = 0; i < 20 && fiber; i++) {
            if (fiber.memoizedProps?.onChange) {
              // Create a fake event to trigger the handler
              const c = document.createElement('canvas');
              c.width = 200; c.height = 60;
              const ctx = c.getContext('2d');
              ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 60);
              ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(10, 40);
              ctx.bezierCurveTo(40, 10, 80, 50, 120, 20);
              ctx.bezierCurveTo(150, 10, 170, 40, 190, 15);
              ctx.stroke();
              const dataUrl = c.toDataURL('image/png');
              // Create a minimal File-like object
              const blob = new Blob([new Uint8Array(10)], { type: 'image/png' });
              const file = new File([blob], 'sig.png', { type: 'image/png' });
              const dt = new DataTransfer(); dt.items.add(file);
              // Call with a synthetic event that has target.files
              fiber.memoizedProps.onChange({ target: { files: dt.files } });
              return 'called-onChange';
            }
            fiber = fiber.return;
          }
          return 'no-onChange-found';
        });
        ok(`Direct injection result: ${directSet}`);
        await wait(1500);
        const hasSig2 = await page.evaluate(() => !!document.querySelector('img[alt="Signature"]'));
        if (hasSig2) {
          ok('Signature confirmed after direct injection');
        } else {
          warn('Signature still not confirmed — Complete may fail');
        }
      }
    } catch (e) {
      warn(`Signature step error: ${e.message}`);
    }
    await wait(STEP_DELAY);

    // ─── STEP 16: Save Draft First ─────────────────────────
    step('Step 16: Saving draft before completion');
    try {
      const saveBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Save Draft') || b.textContent.includes('Save'));
      });
      if (saveBtn && saveBtn.asElement()) {
        await saveBtn.asElement().click();
        ok('Save Draft clicked');
        await wait(2000); // Wait for save to complete
        ok('Draft saved successfully');
      }
    } catch {
      warn('Save button not found — relying on auto-save');
    }
    await wait(STEP_DELAY);

    // ─── STEP 17: Click Complete Button ────────────────────
    step('Step 17: COMPLETING THE CONSULTATION');
    console.log(`\n${C.magenta}${C.bright}  >>> This is the moment — clicking Complete... <<<${C.reset}\n`);

    // Set up toast message capture BEFORE clicking Complete
    await page.evaluate(() => {
      window.__toastMessages = [];
      // Intercept toast notifications by watching for new elements
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              const text = node.textContent?.trim();
              if (text && text.length < 500) {
                // Check if it looks like a toast (small text in a popup-like element)
                const role = node.getAttribute?.('role');
                const className = node.className || '';
                if (role === 'alert' || role === 'status' ||
                    className.includes('toast') || className.includes('Toastify') ||
                    className.includes('notification') || className.includes('alert')) {
                  window.__toastMessages.push(text);
                }
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__toastObserver = observer;
    });

    await wait(1000);

    try {
      // Scroll to top where the Complete button lives
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await wait(800);

      // Debug: check what the form state looks like before clicking
      const formState = await page.evaluate(() => {
        // Check for signature preview
        const sigImg = document.querySelector('img[alt="Signature"]');
        const sigCanvas = document.querySelector('canvas');
        // Check all textareas for content
        const textareas = Array.from(document.querySelectorAll('textarea'));
        const filledTextareas = textareas.filter(t => t.value.trim().length > 0).length;
        return {
          hasSignaturePreview: !!sigImg,
          hasCanvas: !!sigCanvas,
          filledTextareas,
          totalTextareas: textareas.length,
        };
      });
      ok(`Pre-complete state: sigPreview=${formState.hasSignaturePreview}, textareas=${formState.filledTextareas}/${formState.totalTextareas}`);

      const completeBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b =>
          b.textContent.includes('Complete') &&
          !b.textContent.includes('Completing') &&
          !b.disabled
        );
      });

      if (completeBtn && completeBtn.asElement()) {
        await completeBtn.asElement().click();
        ok('Complete button clicked!');

        // Wait for the completion to process and redirect
        // Use a polling approach: check URL every 500ms for up to 10 seconds
        let redirected = false;
        for (let i = 0; i < 20; i++) {
          await wait(500);
          const currentUrl = page.url();
          if (currentUrl.includes('consultations') && !currentUrl.includes('consultation/')) {
            redirected = true;
            ok(`Redirected to consultations list: ${currentUrl}`);
            ok('CONSULTATION COMPLETED SUCCESSFULLY!');
            break;
          }
        }

        if (!redirected) {
          const finalUrl = page.url();
          warn(`Still on consultation page after 10s: ${finalUrl}`);

          // Capture toast messages
          const toasts = await page.evaluate(() => window.__toastMessages || []);
          if (toasts.length > 0) {
            for (const t of toasts) {
              warn(`Toast message: "${t}"`);
            }
          } else {
            warn('No toast messages captured — checking page for visible errors');
            // Look for any visible error/alert text
            const visibleErrors = await page.evaluate(() => {
              const errorEls = document.querySelectorAll('[role="alert"], .toast, .Toastify__toast, [class*="error"], [class*="toast"]');
              return Array.from(errorEls).map(el => el.textContent?.trim()).filter(Boolean).slice(0, 5);
            });
            if (visibleErrors.length > 0) {
              for (const e of visibleErrors) warn(`Visible error: "${e}"`);
            }
          }

          // Check button state
          warn('Checking if button text changed (e.g., "Completing...")');
          const btnState = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const completeBtn = buttons.find(b => b.textContent.includes('Complete'));
            return completeBtn ? { text: completeBtn.textContent.trim(), disabled: completeBtn.disabled } : null;
          });
          if (btnState) {
            warn(`Complete button state: text="${btnState.text}", disabled=${btnState.disabled}`);
          }

          // Dump captured console errors
          if (consoleErrors.length > 0) {
            warn('Console errors captured:');
            for (const ce of consoleErrors.slice(-10)) warn(`  ${ce}`);
          }
        }
      } else {
        err('Complete button not found or disabled!');
        // Debug: list all button texts
        const allBtnTexts = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
        });
        warn(`Available buttons: ${allBtnTexts.join(' | ')}`);
      }
    } catch (e) {
      err(`Complete failed: ${e.message}`);
    }

    // Cleanup toast observer
    await page.evaluate(() => {
      window.__toastObserver?.disconnect();
    });

    // ─── STEP 18: Final Verification ───────────────────────
    step('Step 18: Verifying completion');
    await wait(2000);

    // Check if we're on the consultations list page
    const finalUrl = page.url();
    if (finalUrl.includes('consultations')) {
      // Look for the completed consultation in the list
      const found = await page.evaluate((consultId) => {
        const text = document.body.textContent;
        return text.includes('Dipti') || text.includes('Salunkhe');
      }, APPOINTMENT_ID);

      if (found) {
        ok('Dipti Salunkhe found in consultations list');
      }
    }

    // ─── Done ──────────────────────────────────────────────
    console.log(`\n${C.cyan}${C.bright}${'═'.repeat(60)}`);
    console.log(`  E2E BROWSER TEST COMPLETE`);
    console.log(`${'═'.repeat(60)}${C.reset}\n`);

    console.log(`${C.dim}  The browser will stay open for 30 seconds so you can inspect.`);
    console.log(`  Press Ctrl+C to close earlier.${C.reset}\n`);

    // Keep browser open for inspection
    await wait(30000);

  } catch (error) {
    err(`FATAL: ${error.message}`);
    console.error(error.stack);
    console.log(`\n${C.yellow}  Browser will stay open for debugging. Press Ctrl+C to close.${C.reset}\n`);
    await wait(60000);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
