import { MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const statusColors = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-neutral-100 text-neutral-600',
  closed: 'bg-neutral-100 text-neutral-400',
  filled: 'bg-blue-100 text-blue-700',
};

export default function JobPostingRow({ job, onView, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const dropdownH = 130; // approximate height of the 3-item menu
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < dropdownH;

      setMenuPos({
        top: openUpward ? rect.top - dropdownH : rect.bottom + 4,
        left: rect.right - 160, // 160 = w-40 (10rem)
      });
    }
  }, [menuOpen]);

  const postedDate = job.publishedAt
    ? new Date(job.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Not published';

  return (
    <tr className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
      <td className="px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{job.title}</p>
          <p className="text-xs text-neutral-500 mt-0.5">Posted {postedDate}</p>
        </div>
      </td>
      <td className="px-5 py-4 text-sm text-neutral-600">{job.department}</td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-neutral-900">{job.stats?.applications || 0}</span>
          <span className="text-xs text-neutral-500">applicants</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[job.status] || statusColors.draft}`}>
          {job.status}
        </span>
      </td>
      <td className="px-5 py-4">
        <button
          ref={btnRef}
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4 text-neutral-500" />
        </button>

        {menuOpen && createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
            <div
              className="fixed z-[70] w-40 bg-white rounded-xl border border-neutral-200 shadow-lg py-1"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <button
                onClick={() => { onView?.(job); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                <Eye className="w-4 h-4" /> View
              </button>
              <button
                onClick={() => { onEdit?.(job); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => { onDelete?.(job); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </>,
          document.body,
        )}
      </td>
    </tr>
  );
}
