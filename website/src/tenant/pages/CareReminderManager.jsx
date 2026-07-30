/**
 * CareReminderManager - Comprehensive post-consultation care tracking dashboard
 *
 * Features:
 * - Prescription cards grouped by date
 * - Task list with progress bars
 * - Expandable timeline view per task
 * - Edit task schedule functionality
 * - Toggle task active/inactive
 * - Export compliance report
 *
 * @version 1.0
 * @date April 2026
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  Edit2,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Pill,
  User,
  FileText,
} from 'lucide-react';
import CareTaskChecklist from '../components/consultation/CareTaskChecklist';
import { stripDrPrefix } from '../../utils/doctorName';
import CareReminderTimePicker from '../components/consultation/CareReminderTimePicker';

/* ── Helper Functions ──────────────────────────────────── */

function formatDate(dateStr) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calculateCompletionRate(reminders) {
  if (!reminders || reminders.length === 0) return 0;
  const completed = reminders.filter((r) => r.status === 'completed').length;
  return Math.round((completed / reminders.length) * 100);
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

/* ── ProgressBar Component ────────────────────────────── */

function ProgressBar({ completed, total, skipped, missed }) {
  const completedPercent = (completed / total) * 100;
  const skippedPercent = (skipped / total) * 100;
  const missedPercent = (missed / total) * 100;
  const pendingPercent = 100 - completedPercent - skippedPercent - missedPercent;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-neutral-600">Progress</span>
        <span className="font-semibold text-neutral-900">
          {completed}/{total} completed
        </span>
      </div>
      <div className="h-2 bg-neutral-200 rounded-full overflow-hidden flex">
        {completedPercent > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${completedPercent}%` }}
            title={`${completed} completed`}
          />
        )}
        {skippedPercent > 0 && (
          <div
            className="bg-neutral-400"
            style={{ width: `${skippedPercent}%` }}
            title={`${skipped} skipped`}
          />
        )}
        {missedPercent > 0 && (
          <div
            className="bg-red-500"
            style={{ width: `${missedPercent}%` }}
            title={`${missed} missed`}
          />
        )}
        {pendingPercent > 0 && (
          <div
            className="bg-blue-300"
            style={{ width: `${pendingPercent}%` }}
            title={`${total - completed - skipped - missed} pending`}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-neutral-600">{completed} Done</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-neutral-400" />
          <span className="text-neutral-600">{skipped} Skipped</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-neutral-600">{missed} Missed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-300" />
          <span className="text-neutral-600">{total - completed - skipped - missed} Pending</span>
        </div>
      </div>
    </div>
  );
}

/* ── TaskCard Component ───────────────────────────────── */

function TaskCard({ task, onEditTimes, onToggleTimeline, onDeactivate, isExpanded }) {
  const completedCount = task.reminders?.filter((r) => r.status === 'completed').length || 0;
  const skippedCount = task.reminders?.filter((r) => r.status === 'skipped').length || 0;
  const missedCount = task.reminders?.filter((r) => r.status === 'missed').length || 0;
  const totalReminders = task.reminders?.length || 0;

  const taskTypeIcons = {
    medication: Pill,
    hygiene: CheckCircle2,
    post_care: AlertCircle,
    dietary: FileText,
    follow_up: Calendar,
  };

  const TaskIcon = taskTypeIcons[task.taskType] || Pill;

  return (
    <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 mb-3 last:mb-0">
      <div className="flex items-start justify-between gap-3">
        {/* Task Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <TaskIcon className="h-3.5 w-3.5 text-primary-600" />
            </div>
            <h4 className="font-semibold text-neutral-900 text-sm">{task.title}</h4>
            <span className="text-[10px] px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded font-medium uppercase">
              {task.taskType.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs text-neutral-600 ml-9">{task.instructions}</p>

          {/* Progress Bar */}
          {totalReminders > 0 && (
            <div className="mt-3">
              <ProgressBar
                completed={completedCount}
                total={totalReminders}
                skipped={skippedCount}
                missed={missedCount}
              />
            </div>
          )}

          {/* Scheduled Times */}
          {task.customTimes && task.customTimes.length > 0 && (
            <div className="flex items-center gap-2 mt-3 ml-9">
              <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {task.customTimes.map((time, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 bg-primary-50 text-primary-700 rounded font-medium"
                  >
                    {formatTime(time)}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onEditTimes(task)}
                className="text-[10px] text-primary-600 hover:text-primary-700 font-semibold hover:underline transition-colors ml-1"
              >
                Edit times
              </button>
            </div>
          )}
        </div>

        {/* Task Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onToggleTimeline(task._id)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:bg-neutral-200 transition-colors"
            title={isExpanded ? 'Collapse timeline' : 'View timeline'}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDeactivate(task._id)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 transition-colors"
            title="Deactivate task"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expandable Timeline */}
      {isExpanded && task.reminders && task.reminders.length > 0 && (
        <div className="mt-4 pt-4 border-t border-neutral-300 ml-9">
          <CareTaskChecklist
            reminders={task.reminders}
            onMarkComplete={(reminderId) => console.log('Mark complete:', reminderId)}
            showEmpty={false}
          />
        </div>
      )}
    </div>
  );
}

/* ── EditTimeModal Component ──────────────────────────── */

function EditTimeModal({ task, onClose, onSave }) {
  const [customTimes, setCustomTimes] = useState(task?.customTimes || []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (customTimes.length === 0) {
      alert('Please select at least one time');
      return;
    }

    setSaving(true);
    try {
      await onSave(task._id, customTimes);
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to update schedule');
    } finally {
      setSaving(false);
    }
  };

  if (!task) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-[var(--shadow-lg)] max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-neutral-900">Edit Reminder Schedule</h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-neutral-600 mt-1">{task.title}</p>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-4">
          <CareReminderTimePicker
            frequency={task.frequency || 'custom'}
            customTimes={customTimes}
            onChange={setCustomTimes}
          />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-[var(--shadow-sm)] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Component — Care Reminder Manager Page
   ══════════════════════════════════════════════════════════ */

export default function CareReminderManager() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [expandedTask, setExpandedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  // Fetch patient and prescriptions data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // TODO: Replace with actual API calls
        // const patientData = await api.getPatient(patientId);
        // const prescriptionsData = await api.getPatientPrescriptionsWithTasks(patientId);

        // Mock data for now
        setPatient({
          _id: patientId,
          name: 'John Doe',
          age: 28,
          gender: 'male',
        });

        setPrescriptions([
          {
            _id: '1',
            diagnosis: 'Acute Dental Caries',
            createdAt: new Date().toISOString(),
            doctor: { name: 'Sarah Johnson', specialization: 'Dentist' },
            tasks: [
              {
                _id: 't1',
                title: 'Amoxicillin 500mg',
                instructions: 'Take 1 capsule three times daily after meals for 5 days',
                taskType: 'medication',
                frequency: 'thrice_daily',
                customTimes: ['08:00', '14:00', '20:00'],
                reminders: [
                  {
                    _id: 'r1',
                    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                    status: 'pending',
                  },
                  {
                    _id: 'r2',
                    scheduledAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                    status: 'completed',
                    response: 'Taken after breakfast',
                    respondedAt: new Date(Date.now() - 5.5 * 60 * 60 * 1000).toISOString(),
                  },
                  {
                    _id: 'r3',
                    scheduledAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                    status: 'missed',
                  },
                ],
              },
            ],
          },
        ]);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        alert('Failed to load care reminders');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [patientId]);

  const handleToggleTimeline = (taskId) => {
    setExpandedTask(expandedTask === taskId ? null : taskId);
  };

  const handleEditTimes = (task) => {
    setEditingTask(task);
  };

  const handleSaveSchedule = async (taskId, customTimes) => {
    // TODO: Implement API call
    console.log('Save schedule:', taskId, customTimes);

    // Update local state
    setPrescriptions((prev) =>
      prev.map((prescription) => ({
        ...prescription,
        tasks: prescription.tasks.map((task) =>
          task._id === taskId ? { ...task, customTimes } : task
        ),
      }))
    );
  };

  const handleDeactivateTask = async (taskId) => {
    if (!confirm('Are you sure you want to deactivate this task?')) return;

    // TODO: Implement API call
    console.log('Deactivate task:', taskId);

    // Update local state
    setPrescriptions((prev) =>
      prev.map((prescription) => ({
        ...prescription,
        tasks: prescription.tasks.filter((task) => task._id !== taskId),
      }))
    );
  };

  const handleExportReport = () => {
    // TODO: Implement export functionality
    alert('Export feature coming soon');
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-neutral-500 mt-3">Loading care reminders...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-neutral-600">Patient not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg flex items-center justify-center border border-neutral-300 hover:bg-neutral-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-neutral-700" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Care Reminders</h1>
            <p className="text-sm text-neutral-600 mt-0.5">
              <User className="h-3.5 w-3.5 inline mr-1" />
              {patient.name}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportReport}
          className="px-5 py-2.5 text-sm font-semibold border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export Report
        </button>
      </div>

      {/* Prescriptions List */}
      {prescriptions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-sm)] p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Calendar className="h-8 w-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">No active prescriptions</h3>
          <p className="text-sm text-neutral-600">
            This patient doesn't have any active prescriptions with care reminders yet.
          </p>
        </div>
      ) : (
        prescriptions.map((prescription) => {
          const completionRate = calculateCompletionRate(
            prescription.tasks.flatMap((t) => t.reminders || [])
          );

          return (
            <div
              key={prescription._id}
              className="bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-sm)] p-6"
            >
              {/* Prescription Header */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-neutral-200">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-neutral-900">
                    {prescription.diagnosis}
                  </h3>
                  <p className="text-sm text-neutral-600 mt-1">
                    {formatDate(prescription.createdAt)} • Dr. {stripDrPrefix(prescription.doctor.name)}
                    {prescription.doctor.specialization && (
                      <span className="text-neutral-400"> • {prescription.doctor.specialization}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-semibold">
                    {completionRate}% Complete
                  </span>
                </div>
              </div>

              {/* Task List */}
              {prescription.tasks.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">
                  No tasks scheduled for this prescription
                </p>
              ) : (
                prescription.tasks.map((task) => (
                  <TaskCard
                    key={task._id}
                    task={task}
                    onEditTimes={handleEditTimes}
                    onToggleTimeline={handleToggleTimeline}
                    onDeactivate={handleDeactivateTask}
                    isExpanded={expandedTask === task._id}
                  />
                ))
              )}
            </div>
          );
        })
      )}

      {/* Edit Time Modal */}
      {editingTask && (
        <EditTimeModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveSchedule}
        />
      )}
    </div>
  );
}
