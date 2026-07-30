import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Search, Download, ChevronLeft, ChevronRight, Users, FileText, ChevronDown } from 'lucide-react';
import { getJob, listJobApplications, downloadApplicantResume } from '../api';

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ApplicantsTable() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [apps, setApps] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCover, setExpandedCover] = useState(null);
  const [resumeBusyId, setResumeBusyId] = useState(null);
  const [resumeError, setResumeError] = useState('');

  const handleResumeDownload = async (app) => {
    setResumeBusyId(app._id);
    setResumeError('');
    try {
      await downloadApplicantResume(app._id, app.resume?.fileName);
    } catch (err) {
      setResumeError(err.message || 'Could not download this resume.');
    } finally {
      setResumeBusyId(null);
    }
  };
  const limit = 20;

  useEffect(() => {
    getJob(jobId)
      .then((r) => setJob(r.data))
      .catch(() => {});
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    listJobApplications(jobId, { page, limit, search: search.trim() || undefined })
      .then((r) => {
        setApps(Array.isArray(r.data) ? r.data : r.data?.items || []);
        setTotal(r.meta?.total ?? r.data?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId, page, search]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/clinic/jobs" className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{job?.title || 'Applicants'}</h1>
            <p className="text-sm text-neutral-500">{total} applicant{total !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400">Loading...</div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-neutral-200 mb-3" />
            <p className="text-neutral-500 font-medium">No applicants yet</p>
            <p className="text-sm text-neutral-400 mt-1">Applications will appear here once candidates apply</p>
          </div>
        ) : (
          <>
            {resumeError && (
              <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700">
                {resumeError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Email</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Phone</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Applied</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Resume</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Cover Letter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {apps.map((app) => (
                    <tr key={app._id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm font-medium text-neutral-900 whitespace-nowrap">{app.applicantName}</td>
                      <td className="px-5 py-3.5 text-sm text-neutral-600 whitespace-nowrap">
                        <a href={`mailto:${app.applicantEmail}`} className="hover:text-primary-600 transition-colors">{app.applicantEmail}</a>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-neutral-600 whitespace-nowrap">{app.applicantPhone || '—'}</td>
                      <td className="px-5 py-3.5 text-sm text-neutral-500 whitespace-nowrap">{formatDate(app.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        {app.resume?.fileUrl ? (
                          <button
                            type="button"
                            onClick={() => handleResumeDownload(app)}
                            disabled={resumeBusyId === app._id}
                            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {resumeBusyId === app._id ? 'Downloading…' : (app.resume.fileName || 'Resume')}
                          </button>
                        ) : (
                          <span className="text-sm text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {app.coverLetter ? (
                          <button
                            onClick={() => setExpandedCover(expandedCover === app._id ? null : app._id)}
                            className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" /> View
                            <ChevronDown className={`w-3 h-3 transition-transform ${expandedCover === app._id ? 'rotate-180' : ''}`} />
                          </button>
                        ) : (
                          <span className="text-sm text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Expanded cover letter rows */}
                  {apps.map((app) =>
                    expandedCover === app._id && app.coverLetter ? (
                      <tr key={`${app._id}-cover`}>
                        <td colSpan={6} className="px-5 py-3 bg-neutral-50">
                          <p className="text-sm text-neutral-700 whitespace-pre-wrap max-w-3xl">{app.coverLetter}</p>
                        </td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100">
                <p className="text-sm text-neutral-500">
                  Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-neutral-600 px-2">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
