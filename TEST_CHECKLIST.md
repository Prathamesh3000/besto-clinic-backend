# BestoClinic — Bug Verification Checklist

**Environment (verified ready):**

| | |
|---|---|
| Frontend | http://localhost:5173 (Vite, proxies `/api` → 5016) |
| API | http://localhost:5016 — confirmed running **current** code |
| Redis | running |
| Database | **production Atlas** — you are testing against live data |

---

## ⚠️ Read before you start

1. **Log out and log back in first.** Permissions are cached in `localStorage` at
   login. Without this, menus and buttons will still reflect the old permission set
   and several tests will fail for the wrong reason.

2. **Zeros are often correct.** The newest appointment in the system is 2026-07-07;
   today is later than that. Every "Today / Upcoming / This week" panel legitimately
   reads 0. That is a **data** problem, not a bug — do not log it again.

3. **Logo and resume files are missing from disk.** The database references them but
   `uploads/` was wiped (ephemeral storage). Those will 404. The *code* is fixed;
   the *files* are gone. Needs a persistent volume.

4. Bugs marked **[AUTO ✓]** below were already verified by the automated suite
   (18/18 passed). Re-test them in the UI only if you want visual confirmation.

---

## A. Automated — already verified ✓

No action needed; listed so you know they were covered.

| Bug | Result |
|---|---|
| #39/#40/#42 RBAC | receptionist reads appointments / invoices / queue / patients — all **200** (was 403) |
| #38 payment history | department_manager — **200** (was 403) |
| #21/#22/#23 gender filter | all=44, male=26 (100% male), female=18 (100% female) |
| #37 invoice PDF | **200**, valid `%PDF-`, 2204 bytes |
| #10 asset 404 vs 401 | missing logo → **404**; `/uploads/xrays` → **401** (auth preserved) |
| #5 department dropdown | returns `["Administration","Clinical","Dental"]` (was `[]`) |
| #7 resume route | responds **404 "Application not found"** instead of hanging forever |
| #6 active jobs count | API `0` == DB `status:active` `0` — count logic is correct |
| #10b doctor stats | payload exposes `todayTotal` (the key the UI now reads) |
| #26 care tasks | status resolves to `"active"` (was `undefined`); Active filter returns rows |

---

## B. Manual UI tests

Tick each. If something fails, note the **role**, **screen**, and **browser console error**.

### B1 · Clinic portal — Appointments

- [ ] **#11 / #12 / #18 — appointment times.** Open **Appointments**. Check the time
      shown in **List**, **Board**, **Timeline** and **Calendar** views for the *same*
      appointment. All four must show the **same** time, and it must match the time in
      the appointment drawer. *(Calendar was previously placing appointments 5½ hours
      off; the others were +5:30 on the label.)*
- [ ] **#36 — filter tabs.** The status pills (All / Requested / Confirmed / Checked In
      / In Progress / Completed / Cancelled) must all be reachable — the row scrolls
      horizontally instead of clipping "Cancelled". Dropdowns sit on their own row.
- [ ] **#8 — doctor picker shows "Dr."** Click **New Appointment** → Doctor dropdown.
      Every entry reads `Dr. <name> — <specialisation>`, with **no** "Dr. Dr.".
- [ ] **#35 — in-progress consultation.** Go to **Consultations**, open one with status
      **In Progress**. If it has no record yet you should get *"This consultation has
      not been started yet"* plus an **Open Consultation** button — **not** a red error.
      *(1 of 8 in-progress appointments is in this state, so try a few.)*

### B2 · Clinic portal — Billing / Insurance

- [ ] **#30 — Record Payment modal.** Billing → an invoice → **Record Payment**. The
      **Cancel** and **Record Payment** buttons must be normal height (they were
      stretching to ~300px tall).
- [ ] **#31 — insurance white page.** Insurance → **Providers** tab → click the **eye**
      icon on any provider. A modal must open with the address rendered as text.
      Previously this blanked the entire app to white.
- [ ] **Error boundary.** If any screen does crash now, you should see *"Something went
      wrong on this screen"* with **Try again** / **Go back**, and the sidebar should
      still work — never a blank white page.
- [ ] **Void invoice.** Billing → open a **non-paid** invoice → **Void**. It should
      succeed (it previously called an endpoint that did not exist).

### B3 · Clinic portal — Recruitment

- [ ] **#5 — department dropdown.** Jobs → **New Job** → click the **Department**
      field. It must list **your clinic's** departments (Administration, Clinical,
      Dental for jathar-dental), not just generic defaults.
- [ ] **#6 — active jobs count.** Publish a **draft** job, then return to the Jobs
      dashboard. **Active Listings** must increment. *(Currently 0 active / 19 closed /
      5 draft, so publish one to actually exercise this.)*
- [ ] **#7 — applicant resume.** Jobs → a job → **Applicants** → click the resume.
      It must download **or** show a clear error message — it must not hang or do
      nothing. ⚠️ Expect *"Resume file is no longer available on the server"* for
      existing records: the DB rows point at files that no longer exist on disk.
      To test the happy path, submit a **new** application from the careers page first.

### B4 · Clinic portal — Other

- [ ] **#13 — Bulk Uploads layout.** People → **Bulk Uploads**. Cards should be 2-per-row
      on a normal laptop (4-up only on a very wide monitor), with the Upload/Template
      buttons fully readable and not overflowing.
- [ ] **#26 — Care Tasks action column.** Doctor portal → **Care Tasks**. Every row must
      show a **View** button, and active rows also a **Summary** button. The **Status**
      column must show `active`/`completed`, never blank. The **Active** / **Completed**
      filter tabs must actually filter.
- [ ] **#11 — Cancel leave.** Doctor portal → **Schedule** → cancel a leave request →
      **Confirm**. It must succeed (was "Validation Failed").
- [ ] **#10 — doctor dashboard counts.** Doctor portal → **My Dashboard**. Today's
      appointments and Patients cards must show real numbers. ⚠️ Today's will legitimately
      be **0** until the demo data is refreshed — verify by checking the **Patients this
      month** card is non-zero instead.

### B5 · Patient portal

- [ ] **#9 — no double "Dr."** Book Appointment → doctor list. Names read `Dr. Amrut
      Desai`, never `Dr. Dr. Amrut Desai`. Check the doctor card, the summary step and
      the confirmation.
- [ ] **#14 — Medical Records.** Dashboard → **Medical Records** quick action → must
      land on the **Records** tab (not Prescriptions). Also test the **All Records**
      link lower down the dashboard.
- [ ] **#15 — notifications scrolling.** Open **Notifications**, ideally on a phone or
      a narrow window. You must be able to scroll to the **last** item; nothing should
      hide under the bottom nav bar.
- [ ] **#16 — notification bell.** Click the **bell** in the header, then click any
      notification. The dropdown must close and take you to the Notifications page.
      *(It previously only marked it read and appeared to do nothing.)*

### B6 · Public site / chatbot

- [ ] **#9 — clinic logo on Browse → Doctors.** Doctor cards should show the clinic
      logo. ⚠️ Falls back to a map-pin icon because the logo files are missing on disk —
      that fallback is the fix working. Not a code bug.
- [ ] **#16 — clinic link from chatbot.** Chatbot → Find Dentists → click a doctor.
      A new tab must open the doctor profile — **not** a black page reading "Not Found".
- [ ] **#7 — chatbot location.** Chatbot → Find Dentists → allow location. From outside
      the 10 known metros it must show the **city picker** rather than claiming
      "You're in Pune". Nearby, it now says *"Showing dentists near <city>"*.
- [ ] **#6 — Prescription Reader.** Chatbot → Prescription Reader → upload an image.
      ⚠️ Expect *"File storage is not writable on the server"* until a persistent
      volume is mounted — but you must **no longer** see a raw
      `EACCES: permission denied, open '/app/uploads/...'`.
- [ ] **Careers page.** Submit a job application end to end, and confirm the
      **Cancel** button closes the popup.

### B7 · Teleconsultation — needs two browsers

Use two windows (one doctor, one patient — a normal window and a private window).

- [ ] **#19 — mute shows the right name.** Mute **your own** mic. The *remote* "Muted"
      badge must **not** light up with your own name. Each side should only ever show
      the **other** person as muted.
- [ ] **#15 / #27 — self camera.** Your own picture-in-picture tile must show your
      camera, not a black rectangle. Check on **both** sides, and again after a reconnect.
- [ ] **#12 / #1 — End Call.** Have **one** side end the call, then have the **other**
      side also press End Call. The second press must tear down cleanly — no
      "Cannot transition from ended to ended" and no stuck screen.
- [ ] **#28 / #2 — patient closes the tab.** Close the patient tab mid-call. The doctor
      shows "reconnecting", then within **30 seconds** resolves to "Patient left the
      call" — it must not sit on reconnecting forever.
- [ ] **#14 — chat "processing".** Send a chat message. It must stop showing
      "processing" once delivered.
- [ ] **#13 — chat basics.** Messages from the other party must appear **live, without
      a page reload**; your messages right-aligned/coloured differently from theirs;
      oldest at top, newest at bottom; image attachments preview inline.
- [ ] **#20 — second incoming call.** After finishing a call, have the doctor call the
      patient again while the patient is still on the post-call screen. Accepting must
      open the call module, not leave them stranded on "Consultation complete".

---

## C. Known non-code issues — do not log these again

| Item | Why |
|---|---|
| #24 / #29 / #34 zero counts | Correct. 0 future appointments, 0 VideoSessions, 0 upcoming leaves. Needs a **demo-data refresh**. |
| #10 missing logos | DB rows point at files wiped from ephemeral storage. Needs a **persistent volume**. |
| #6 prescription upload EACCES | Same storage problem. `STORAGE_PROVIDER=s3` will **not** help — `_uploadToS3` is an unimplemented stub and there is no AWS SDK installed. |
| #5 / #25 (batch 1) | Not reproducible. #25's payload validates against all 17 real schedule documents. Retest after deploy. |

---

## D. If something fails

Capture: **role**, **URL**, **browser console error**, and the failing **Network**
request (method, path, status, response body). The status code alone usually
identifies the layer:

- **401** on a page you are logged into → stale `localStorage` token; log out/in
- **403** → permission; report the exact `Missing required permission(s): …` string
- **404** on an API call → client/server route mismatch
- **Hangs forever** → an unwrapped async handler (this class of bug was fixed in the
  job portal; if you see it elsewhere, that module needs `asyncHandler` too)
