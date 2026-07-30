'use strict';

const jobPortalService = require('./jobPortal.service');
const ApiResponse = require('../../utils/ApiResponse');

// ─── Clinic-Facing ──────────────────────────────────────

exports.createJob = async (req, res) => {
  const posting = await jobPortalService.createJobPosting(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Job posting created', posting));
};

exports.updateJob = async (req, res) => {
  const posting = await jobPortalService.updateJobPosting(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Job posting updated', posting));
};

exports.publishJob = async (req, res) => {
  const posting = await jobPortalService.publishJobPosting(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Job posting published', posting));
};

exports.closeJob = async (req, res) => {
  const posting = await jobPortalService.closeJobPosting(req.params.id, req.user, req.tenantSlug, req.body.reason);
  res.json(ApiResponse.success('Job posting closed', posting));
};

exports.deleteJob = async (req, res) => {
  await jobPortalService.deleteJobPosting(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.deleted('Job posting deleted'));
};

exports.listJobs = async (req, res) => {
  const { items, total, page, limit } = await jobPortalService.listClinicJobPostings(req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Job postings retrieved', items, { page, limit, total }));
};

exports.getJob = async (req, res) => {
  const posting = await jobPortalService.getClinicJobPostingById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Job posting retrieved', posting));
};

exports.getDashboard = async (req, res) => {
  const stats = await jobPortalService.getClinicDashboardStats(req.tenantSlug);
  res.json(ApiResponse.success('Dashboard stats retrieved', stats));
};

exports.listApplicationsForJob = async (req, res) => {
  const { items, total, page, limit } = await jobPortalService.listApplicationsForJob(
    req.params.id, req.query, req.user, req.tenantSlug,
  );
  res.json(ApiResponse.paginated('Applications retrieved', items, { page, limit, total }));
};

// ─── Public-Facing ──────────────────────────────────────

exports.listPublicJobs = async (req, res) => {
  const { items, total, page, limit } = await jobPortalService.listPublicJobs(req.query);
  res.json(ApiResponse.paginated('Jobs retrieved', items, { page, limit, total }));
};

exports.getPublicJob = async (req, res) => {
  const posting = await jobPortalService.getPublicJobById(req.params.slug);
  res.json(ApiResponse.success('Job retrieved', posting));
};

exports.applyToJob = async (req, res) => {
  const application = await jobPortalService.applyToJob(req.params.id, req.body);
  res.status(201).json(ApiResponse.created('Application submitted', application));
};

exports.downloadApplicationResume = async (req, res) => {
  const { absolutePath, fileName } = await jobPortalService.getApplicationResume(
    req.params.applicationId,
    req.tenantSlug,
  );
  // res.download sets Content-Disposition: attachment and streams the file.
  res.download(absolutePath, fileName);
};

exports.getDistinctDepartments = async (req, res) => {
  // req.tenantSlug is set on the authenticated /jobs route and absent on the
  // public /public/jobs route — which is exactly the scoping distinction the
  // service needs. See getDistinctDepartments() for why.
  const departments = await jobPortalService.getDistinctDepartments({
    tenantSlug: req.tenantSlug,
  });
  res.json(ApiResponse.success('Departments retrieved', departments));
};
