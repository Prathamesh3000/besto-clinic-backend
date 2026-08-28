'use strict';

/**
 * Job Portal Service — clinic-facing and public-facing job posting operations.
 *
 * Clinic-facing: create, update, publish, close jobs; manage applications; view dashboard.
 * Public-facing: browse active jobs, view details, apply.
 */

const JobPosting = require('../../models/platform/JobPosting');
const JobApplication = require('../../models/platform/JobApplication');
const Clinic = require('../../models/platform/Clinic');
const creditService = require('../../services/credit.service');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { uploadFile } = require('../../services/storage.service');
const {
  JOB_STATUS,
  JOB_CREDIT_COSTS,
  CREDIT_ACTION,
} = require('../../config/constants');
const logger = require('../../utils/logger');

// ═══════════════════════════════════════════════════════════
//  Clinic-Facing (Tenant-Authenticated)
// ═══════════════════════════════════════════════════════════

/**
 * Resolve the clinic ObjectId from the tenant slug.
 * @param {string} tenantSlug
 * @returns {Promise<Clinic>}
 */
async function _resolveClinic(tenantSlug) {
  const clinic = await Clinic.findOne({ slug: tenantSlug }).select(
    'name logo address features',
  );
  if (!clinic) throw ApiError.notFound('Clinic not found');
  return clinic;
}

/**
 * Ensure the clinic has the job portal feature enabled.
 */
function _ensureJobPortalEnabled(clinic) {
  if (!clinic.features?.jobPortalEnabled) {
    throw ApiError.forbidden('Job portal is not enabled on your plan');
  }
}

// ─── CRUD ───────────────────────────────────────────────

/**
 * Create a new job posting (status: draft — no credits deducted).
 */
async function createJobPosting(data, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  _ensureJobPortalEnabled(clinic);

  const posting = await JobPosting.create({
    clinic: clinic._id,
    clinicName: clinic.name,
    clinicLogo: clinic.logo,
    clinicLocation: {
      city: clinic.address?.city,
      state: clinic.address?.state,
      country: clinic.address?.country || 'IN',
    },
    title: data.title,
    department: data.department,
    employmentType: data.employmentType,
    description: data.description,
    compensation: data.compensation,
    requirements: data.requirements,
    location: data.location,
    isFeatured: data.isFeatured || false,
    createdBy: user.userId,
  });

  return posting;
}

/**
 * Update a draft or active job posting.
 */
async function updateJobPosting(jobId, data, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  const posting = await JobPosting.findOne({ _id: jobId, clinic: clinic._id });

  if (!posting) throw ApiError.notFound('Job posting not found');
  if (posting.status === JOB_STATUS.CLOSED || posting.status === JOB_STATUS.FILLED) {
    throw ApiError.badRequest('Cannot edit a closed or filled job posting');
  }

  // Featuring costs credits, and they are only taken at publish. Turning the
  // flag on afterwards was therefore a way to buy featured placement for free —
  // publish cheap, then edit. Charge for it here instead, exactly as publish
  // would have. Draft postings stay free to toggle: publish bills them.
  const wantsFeature = data.isFeatured === true && !posting.isFeatured;
  const chargeForFeature = wantsFeature && posting.status === JOB_STATUS.ACTIVE;

  if (chargeForFeature) {
    // Deduct first — if the wallet is short this throws and nothing is saved,
    // so the posting can never end up featured without being paid for.
    await creditService.deductCredits(
      clinic._id,
      JOB_CREDIT_COSTS.FEATURE,
      CREDIT_ACTION.JOB_POST_PUBLISH,
      { jobPosting: posting._id },
      user.userId,
      `Featured upgrade for live job: ${posting.title}`,
    );
  }

  const allowedFields = [
    'title', 'department', 'employmentType', 'description',
    'compensation', 'requirements', 'location', 'isFeatured',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      posting[field] = data[field];
    }
  }

  if (chargeForFeature) {
    posting.creditCost = (posting.creditCost || 0) + JOB_CREDIT_COSTS.FEATURE;
    logger.info(
      'Job posting %s featured after publish — %d credits charged',
      posting._id, JOB_CREDIT_COSTS.FEATURE,
    );
  }

  await posting.save();
  return posting;
}

/**
 * Publish a draft job posting (draft → active).
 * Deducts credits from the clinic's wallet.
 */
async function publishJobPosting(jobId, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  _ensureJobPortalEnabled(clinic);

  const posting = await JobPosting.findOne({ _id: jobId, clinic: clinic._id });
  if (!posting) throw ApiError.notFound('Job posting not found');
  if (posting.status !== JOB_STATUS.DRAFT) {
    throw ApiError.badRequest(
      `Only draft postings can be published (this posting is already ${posting.status})`,
    );
  }

  // Calculate credit cost
  let totalCost = JOB_CREDIT_COSTS.PUBLISH;
  if (posting.isFeatured) {
    totalCost += JOB_CREDIT_COSTS.FEATURE;
  }

  // Deduct credits
  await creditService.deductCredits(
    clinic._id,
    totalCost,
    CREDIT_ACTION.JOB_POST_PUBLISH,
    { jobPosting: posting._id },
    user.userId,
    `Published job: ${posting.title}${posting.isFeatured ? ' (featured)' : ''}`,
  );

  // Update posting
  const now = new Date();
  posting.status = JOB_STATUS.ACTIVE;
  posting.creditCost = totalCost;
  posting.publishedAt = now;
  posting.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await posting.save();

  return posting;
}

/**
 * Repost a closed or filled posting as a fresh draft.
 *
 * Closed and filled postings are immutable — applicants applied to that exact
 * listing, so it stays intact as history. Reposting clones its content into a
 * new draft the clinic can edit and publish normally; stats, applications and
 * lifecycle dates start clean. No credits are charged here — the clone is a
 * draft, and publishing it charges as usual.
 *
 * Idempotent while the clone is still a draft: reposting the same source again
 * reopens that draft instead of piling up duplicate rows.
 *
 * @returns {Promise<{draft: JobPosting, reused: boolean}>}
 */
async function repostJobPosting(jobId, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  _ensureJobPortalEnabled(clinic);

  const source = await JobPosting.findOne({ _id: jobId, clinic: clinic._id });
  if (!source) throw ApiError.notFound('Job posting not found');
  if (source.status !== JOB_STATUS.CLOSED && source.status !== JOB_STATUS.FILLED) {
    throw ApiError.badRequest(
      `Only closed or filled postings can be reposted (this posting is ${source.status})`,
    );
  }

  // Once the earlier clone has been published it is a listing in its own right,
  // so only an unpublished draft counts as "the repost already in progress".
  const pending = await JobPosting.findOne({
    clinic: clinic._id,
    repostedFrom: source._id,
    status: JOB_STATUS.DRAFT,
  });
  if (pending) return { draft: pending, reused: true };

  const data = source.toObject();

  // Clinic name/logo/address may have changed since the original was posted, so
  // re-denormalize from the current clinic record rather than copying stale values.
  const draft = await JobPosting.create({
    clinic: clinic._id,
    clinicName: clinic.name,
    clinicLogo: clinic.logo,
    clinicLocation: {
      city: clinic.address?.city,
      state: clinic.address?.state,
      country: clinic.address?.country || 'IN',
    },
    title: data.title,
    department: data.department,
    employmentType: data.employmentType,
    description: data.description,
    compensation: data.compensation,
    requirements: data.requirements,
    location: data.location,
    isFeatured: data.isFeatured,
    status: JOB_STATUS.DRAFT,
    repostedFrom: source._id,
    createdBy: user.userId,
  });

  logger.info(
    `Job posting ${source._id} reposted as draft ${draft._id} by user ${user.userId}`,
  );

  return { draft, reused: false };
}

/**
 * Close or fill a job posting (active → closed | filled).
 */
async function closeJobPosting(jobId, user, tenantSlug, reason = 'closed') {
  const clinic = await _resolveClinic(tenantSlug);
  const posting = await JobPosting.findOne({ _id: jobId, clinic: clinic._id });

  if (!posting) throw ApiError.notFound('Job posting not found');
  if (posting.status !== JOB_STATUS.ACTIVE) {
    throw ApiError.badRequest('Only active postings can be closed');
  }

  posting.status = reason === 'filled' ? JOB_STATUS.FILLED : JOB_STATUS.CLOSED;
  posting.closedAt = new Date();
  await posting.save();

  return posting;
}

/**
 * Soft-delete a job posting.
 */
async function deleteJobPosting(jobId, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  const posting = await JobPosting.findOne({ _id: jobId, clinic: clinic._id });

  if (!posting) throw ApiError.notFound('Job posting not found');

  posting.deletedAt = new Date();
  await posting.save();
  return posting;
}

// ─── Listing & Dashboard ────────────────────────────────

/**
 * List job postings for the authenticated clinic.
 *
 * A closed/filled posting that has been reposted is "superseded" — its content
 * now lives on in the clone, so showing both means the same role appears twice.
 * The unfiltered view hides superseded originals; picking an explicit status
 * shows everything, so the history stays reachable.
 */
async function listClinicJobPostings(query, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  const { skip, limit, page } = parsePagination(query);

  const filter = { clinic: clinic._id };
  if (query.status) {
    filter.status = query.status;
  } else {
    // distinct() is not matched by the pre(/^find/) soft-delete hook, so a
    // deleted clone would otherwise keep hiding the original forever.
    const supersededIds = await JobPosting.distinct('repostedFrom', {
      clinic: clinic._id,
      repostedFrom: { $ne: null },
      deletedAt: null,
    });
    if (supersededIds.length) filter._id = { $nin: supersededIds };
  }

  const [items, total] = await Promise.all([
    JobPosting.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    JobPosting.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Get a single job posting for the authenticated clinic.
 */
async function getClinicJobPostingById(jobId, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  const posting = await JobPosting.findOne({ _id: jobId, clinic: clinic._id }).lean();
  if (!posting) throw ApiError.notFound('Job posting not found');
  return posting;
}

/**
 * Get dashboard stats for the authenticated clinic.
 */
async function getClinicDashboardStats(tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);
  const clinicId = clinic._id;

  const [activeListings, totalApplicants] = await Promise.all([
    JobPosting.countDocuments({ clinic: clinicId, status: JOB_STATUS.ACTIVE }),
    JobApplication.countDocuments({ clinic: clinicId }),
  ]);

  const balance = await creditService.getBalance(clinicId);

  return {
    activeListings,
    totalApplicants,
    creditBalance: balance.balance,
  };
}

// ─── Application Management ─────────────────────────────

/**
 * List applications for a specific job (flat paginated list).
 */
async function listApplicationsForJob(jobId, query, user, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);

  // Verify job belongs to clinic
  const posting = await JobPosting.findOne({ _id: jobId, clinic: clinic._id });
  if (!posting) throw ApiError.notFound('Job posting not found');

  const { skip, limit, page } = parsePagination(query);

  const filter = { jobPosting: jobId, clinic: clinic._id };

  // Search by applicant name or email
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { applicantName: { $regex: escaped, $options: 'i' } },
      { applicantEmail: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    JobApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    JobApplication.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Resolve an applicant's resume for download.
 *
 * Resumes live under /uploads/resumes, which is NOT one of the public static
 * dirs in app.js — everything outside logos/avatars requires a Bearer token.
 * The applicants table linked to the file with a plain <a href>, and an anchor
 * cannot send an Authorization header, so every click failed with 401. Streaming
 * it through an authenticated route keeps resumes private (they carry PII) while
 * letting the client fetch them with its token.
 *
 * @returns {{ absolutePath: string, fileName: string }}
 */
async function getApplicationResume(applicationId, tenantSlug) {
  const clinic = await _resolveClinic(tenantSlug);

  // Scoped by clinic so one tenant cannot read another tenant's applicants.
  const application = await JobApplication.findOne({
    _id: applicationId,
    clinic: clinic._id,
    deletedAt: null,
  }).lean();

  if (!application) throw ApiError.notFound('Application not found');
  if (!application.resume?.fileUrl) throw ApiError.notFound('No resume was attached to this application');

  const path = require('path');
  const fs = require('fs');

  // Stored as a site-relative path like /uploads/resumes/<uuid>.pdf. Resolve it
  // under the uploads root and confirm it stayed there — never trust a stored
  // value to build a filesystem path unchecked.
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const relative = String(application.resume.fileUrl).replace(/^\/+/, '');
  const absolutePath = path.resolve(process.cwd(), relative);

  if (!absolutePath.startsWith(uploadsRoot + path.sep)) {
    throw ApiError.badRequest('Invalid resume path');
  }
  if (!fs.existsSync(absolutePath)) {
    throw ApiError.notFound('Resume file is no longer available on the server');
  }

  return {
    absolutePath,
    fileName: application.resume.fileName || path.basename(absolutePath),
  };
}

// ═══════════════════════════════════════════════════════════
//  Public-Facing (No Auth / Candidate Auth)
// ═══════════════════════════════════════════════════════════

/**
 * List active public jobs with search and filters.
 */
async function listPublicJobs(query = {}) {
  const { skip, limit, page } = parsePagination(query);

  const filter = {
    status: JOB_STATUS.ACTIVE,
    $or: [
      { expiresAt: { $gt: new Date() } },
      { expiresAt: null },
    ],
  };

  // Search by title, department, or clinic name
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { department: { $regex: escaped, $options: 'i' } },
      { clinicName: { $regex: escaped, $options: 'i' } },
    ];
    // Remove the previous $or for expiresAt and combine
    delete filter.$or;
    filter.$and = [
      {
        $or: [
          { expiresAt: { $gt: new Date() } },
          { expiresAt: null },
        ],
      },
      {
        $or: [
          { title: { $regex: escaped, $options: 'i' } },
          { department: { $regex: escaped, $options: 'i' } },
          { clinicName: { $regex: escaped, $options: 'i' } },
        ],
      },
    ];
  }

  // Additional filters
  if (query.city) filter['location.city'] = { $regex: query.city, $options: 'i' };
  if (query.employmentType) filter.employmentType = query.employmentType;
  if (query.experienceLevel) filter['requirements.experienceLevel'] = query.experienceLevel;
  if (query.department) filter.department = { $regex: query.department, $options: 'i' };

  // Sort: featured first, then by date
  let sort = { isFeatured: -1, publishedAt: -1 };
  if (query.sort === 'salary_high') sort = { 'compensation.salaryMax': -1 };
  else if (query.sort === 'salary_low') sort = { 'compensation.salaryMin': 1 };

  const [items, total] = await Promise.all([
    JobPosting.find(filter)
      .select('-createdBy -deletedAt -stats')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    JobPosting.countDocuments(filter),
  ]);

  // Backfill clinicLogo for any items missing it
  const missing = items.filter((j) => !j.clinicLogo && j.clinic);
  if (missing.length > 0) {
    const clinicIds = [...new Set(missing.map((j) => j.clinic.toString()))];
    const clinics = await Clinic.find({ _id: { $in: clinicIds } }).select('logo').lean();
    const logoMap = Object.fromEntries(clinics.filter((c) => c.logo).map((c) => [c._id.toString(), c.logo]));
    for (const job of missing) {
      const logo = logoMap[job.clinic.toString()];
      if (logo) {
        job.clinicLogo = logo;
        // Persist for future requests (fire-and-forget)
        JobPosting.updateOne({ _id: job._id }, { $set: { clinicLogo: logo } }).catch(() => {});
      }
    }
  }

  return { items, total, page, limit };
}

/**
 * Get a public job by slug or ID. Increments view count.
 */
async function getPublicJobById(jobIdOrSlug) {
  let posting;
  // Try slug first, then ObjectId
  if (/^[a-z0-9-]+-[a-z0-9]+$/.test(jobIdOrSlug)) {
    posting = await JobPosting.findOne({
      slug: jobIdOrSlug,
      status: JOB_STATUS.ACTIVE,
    }).select('-createdBy -deletedAt');
  }

  if (!posting) {
    posting = await JobPosting.findOne({
      _id: jobIdOrSlug,
      status: JOB_STATUS.ACTIVE,
    }).select('-createdBy -deletedAt');
  }

  if (!posting) throw ApiError.notFound('Job posting not found');

  // Backfill clinicLogo if missing (handles jobs created before the field existed,
  // or when the clinic uploaded a logo after the job was posted)
  if (!posting.clinicLogo && posting.clinic) {
    const clinic = await Clinic.findById(posting.clinic).select('logo').lean();
    if (clinic?.logo) {
      posting.clinicLogo = clinic.logo;
      // Persist for future requests (fire-and-forget)
      JobPosting.updateOne({ _id: posting._id }, { $set: { clinicLogo: clinic.logo } }).catch(() => {});
    }
  }

  // Increment view counter (fire-and-forget)
  JobPosting.updateOne(
    { _id: posting._id },
    { $inc: { 'stats.views': 1 } },
  ).catch(() => {}); // best-effort

  return posting;
}

/**
 * Public applicant applies to a job (no account needed).
 */
async function applyToJob(jobId, applicationData) {
  const posting = await JobPosting.findOne({
    _id: jobId,
    status: JOB_STATUS.ACTIVE,
  });
  if (!posting) throw ApiError.notFound('This job posting is no longer accepting applications');

  // Check for duplicate application by email
  const existing = await JobApplication.findOne({
    jobPosting: jobId,
    applicantEmail: applicationData.email.toLowerCase().trim(),
  });
  if (existing) throw ApiError.conflict('You have already applied to this position');

  // Decode and upload resume file
  const buffer = Buffer.from(applicationData.resumeData, 'base64');
  const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5 MB
  if (buffer.length > MAX_RESUME_SIZE) {
    throw ApiError.badRequest('Resume file size must be under 5 MB');
  }

  const { fileUrl, fileName } = await uploadFile(
    { buffer, originalname: applicationData.resumeFileName, mimetype: applicationData.resumeMimeType },
    'resumes',
  );

  const application = await JobApplication.create({
    jobPosting: jobId,
    clinic: posting.clinic,
    applicantName: applicationData.name,
    applicantEmail: applicationData.email,
    applicantPhone: applicationData.phone || null,
    resume: { fileUrl, fileName: applicationData.resumeFileName },
    coverLetter: applicationData.coverLetter || null,
  });

  // Increment application counter (fire-and-forget)
  JobPosting.updateOne(
    { _id: jobId },
    { $inc: { 'stats.applications': 1 } },
  ).catch(() => {});

  // Lazy require — emailQueue getter triggers Redis, so we must not import at module level
  const { emailQueue } = require('../../jobs/queues');

  // Queue confirmation email to the candidate (retryable via BullMQ)
  try {
    await emailQueue.add('send-email', {
      type: 'application-confirmation',
      payload: {
        email: applicationData.email,
        name: applicationData.name,
        jobTitle: posting.title,
        clinicName: posting.clinicName,
      },
    });
  } catch (err) {
    logger.warn('applyToJob: failed to queue candidate email — %s', err.message);
  }

  // Queue notification email to the clinic admin
  try {
    const clinic = await Clinic.findById(posting.clinic)
      .select('email superAdmin name slug')
      .lean();
    const adminEmail = clinic?.superAdmin?.email || clinic?.email;
    if (adminEmail) {
      const env = require('../../config/env');
      const dashboardUrl = `${env.FRONTEND_URL}/clinic/jobs/${jobId}/applicants`;
      await emailQueue.add('send-email', {
        type: 'new-application-notice',
        payload: {
          email: adminEmail,
          clinicName: clinic.name || posting.clinicName,
          jobTitle: posting.title,
          applicantName: applicationData.name,
          applicantEmail: applicationData.email,
          dashboardUrl,
        },
      });
    }
  } catch (err) {
    logger.warn('applyToJob: failed to queue admin notice email — %s', err.message);
  }

  return application;
}

/**
 * Distinct department values for the department combobox / filter.
 *
 * Two different callers need two different scopes:
 *
 *  - Public careers page (`tenantSlug` omitted): every clinic's live openings,
 *    so the filter only offers departments a visitor can actually browse.
 *
 *  - Tenant create-job combobox (`tenantSlug` given): **this clinic's own**
 *    postings in any state. Scoping to ACTIVE returned an empty list whenever a
 *    clinic had nothing published — which is every clinic until the first job
 *    goes live — so the combobox fell back to generic defaults and never showed
 *    the departments the clinic actually recruits for. It also previously
 *    returned other clinics' department names, since there was no clinic filter.
 *
 * @param {{ tenantSlug?: string }} [opts]
 */
async function getDistinctDepartments({ tenantSlug } = {}) {
  let filter;

  if (tenantSlug) {
    const clinic = await _resolveClinic(tenantSlug);
    filter = { clinic: clinic._id, deletedAt: null };
  } else {
    filter = {
      status: JOB_STATUS.ACTIVE,
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: null },
      ],
    };
  }

  const departments = await JobPosting.distinct('department', filter);
  return departments.filter(Boolean).sort();
}

module.exports = {
  // Clinic-facing
  createJobPosting,
  updateJobPosting,
  publishJobPosting,
  repostJobPosting,
  closeJobPosting,
  deleteJobPosting,
  listClinicJobPostings,
  getClinicJobPostingById,
  getClinicDashboardStats,
  listApplicationsForJob,
  getApplicationResume,
  // Public-facing
  listPublicJobs,
  getPublicJobById,
  applyToJob,
  getDistinctDepartments,
};
