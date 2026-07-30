/**
 * EmergencyIndicator - Shared component for displaying active emergency sessions
 * Used across Doctor, Receptionist, and Admin/Owner dashboards
 *
 * Features:
 * - Live count badge with pulse animation
 * - Priority-based color coding
 * - Socket-based real-time updates
 * - Click-through navigation
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Siren, Clock, User, Video, MessageSquare, ChevronRight } from 'lucide-react';
import { listEmergencySessions } from '../api';
import { emergencyBus } from '../../lib/socket';

const PRIORITY_STYLES = {
  critical: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300', dot: 'bg-rose-500' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', dot: 'bg-orange-500' },
  medium:   { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500' },
  low:      { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', dot: 'bg-blue-500' },
};

function formatRelativeTime(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function EmergencyIndicator({
  variant = 'badge', // 'badge' | 'card' | 'list'
  role = 'admin', // 'doctor' | 'receptionist' | 'admin'
  limit = 5,
  onSessionClick,
  className = '',
}) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial emergency sessions
  useEffect(() => {
    async function fetchEmergencies() {
      try {
        const res = await listEmergencySessions({ status: 'requested', limit });
        const data = res?.data || res;
        const list = data?.sessions || data?.items || data?.data || [];
        const items = Array.isArray(list) ? list : [];

        setSessions(items);
        setCount(data?.total || items.length);
      } catch (err) {
        console.warn('[EmergencyIndicator] Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEmergencies();
  }, [limit]);

  // Socket listeners for real-time updates
  useEffect(() => {
    const off = emergencyBus.on((event, payload) => {
      if (event === 'emergency:new') {
        const session = payload?.session || payload;
        setSessions((prev) => [session, ...prev].slice(0, limit));
        setCount((prev) => prev + 1);
      } else if (['emergency:accepted', 'emergency:cancelled', 'emergency:ended'].includes(event)) {
        const sessionId = payload?.sessionId;
        setSessions((prev) => prev.filter((s) => String(s._id || s.id) !== String(sessionId)));
        setCount((prev) => Math.max(0, prev - 1));
      }
    });
    return off;
  }, [limit]);

  const handleClick = (session) => {
    if (onSessionClick) {
      onSessionClick(session);
    } else {
      // Default navigation based on role
      if (role === 'doctor') navigate(`/clinic/doctor/emergency`);
      else if (role === 'receptionist') navigate(`/clinic/queue`);
      else navigate(`/clinic/telemedicine`);
    }
  };

  // Badge variant - compact count indicator
  if (variant === 'badge') {
    if (count === 0) return null;

    return (
      <button
        onClick={() => handleClick(sessions[0])}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-full transition-all ${
          count > 0 ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-300 animate-pulse hover:bg-rose-200' : 'bg-neutral-100 text-neutral-400'
        } ${className}`}
      >
        <Siren className="w-3.5 h-3.5" />
        {count} Emergency{count !== 1 ? 's' : ''}
      </button>
    );
  }

  // Card variant - stat card with live indicator
  if (variant === 'card') {
    return (
      <div
        className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
          count > 0 ? 'border-rose-200 ring-2 ring-rose-100' : 'border-neutral-300/60'
        } ${className}`}
      >
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              count > 0 ? 'bg-rose-100 animate-pulse' : 'bg-rose-50'
            }`}>
              <Siren className={`w-6 h-6 ${count > 0 ? 'text-rose-600' : 'text-rose-400'}`} />
            </div>
            {count > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-neutral-900">{loading ? '—' : count}</p>
            <p className="text-xs font-medium text-neutral-500 mt-1">Active Emergencies</p>
          </div>
          {count > 0 && (
            <button
              onClick={() => handleClick(sessions[0])}
              className="mt-4 w-full py-2 text-xs font-semibold text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 transition flex items-center justify-center gap-1"
            >
              View Queue <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // List variant - detailed emergency queue
  if (variant === 'list') {
    return (
      <div className={`bg-white rounded-2xl border border-neutral-300/60 shadow-sm ${className}`}>
        <div className="px-5 py-4 border-b border-neutral-200/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <Siren className="w-4 h-4 text-rose-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Emergency Queue</h3>
              <p className="text-xs text-neutral-500">
                {loading ? 'Loading...' : count === 0 ? 'No active emergencies' : `${count} active session${count !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          {count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="divide-y divide-neutral-200/60 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-5 h-5 border-2 border-neutral-300 border-t-rose-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-neutral-500">Loading emergencies...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <Siren className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-500">No active emergencies</p>
              <p className="text-xs text-neutral-400 mt-1">Emergency requests will appear here</p>
            </div>
          ) : (
            sessions.map((session) => {
              const priority = session.priority || 'medium';
              const priorityStyle = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;

              return (
                <button
                  key={session._id || session.id}
                  onClick={() => handleClick(session)}
                  className="w-full px-5 py-4 hover:bg-neutral-50 transition-colors text-left"
                >
                  <div className="flex items-start gap-3">
                    {/* Priority indicator */}
                    <div className={`w-10 h-10 rounded-lg ${priorityStyle.bg} border ${priorityStyle.border} flex items-center justify-center shrink-0`}>
                      {session.type === 'video' ? (
                        <Video className={`w-4 h-4 ${priorityStyle.text}`} />
                      ) : (
                        <MessageSquare className={`w-4 h-4 ${priorityStyle.text}`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            {session.patientName || session.patient?.name || 'Patient'}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                            {session.reason || session.symptoms?.join(', ') || 'Emergency consultation'}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${priorityStyle.bg} ${priorityStyle.text} ring-1 ${priorityStyle.border} shrink-0`}>
                          <span className={`w-1 h-1 rounded-full ${priorityStyle.dot}`} />
                          {priority}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(session.createdAt)}
                        </span>
                        {session.pain && (
                          <span>Pain: {session.pain}/10</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {count > limit && (
          <div className="px-5 py-3 border-t border-neutral-200/60 bg-neutral-50/50">
            <button
              onClick={() => {
                if (role === 'doctor') navigate('/clinic/doctor/emergency');
                else if (role === 'receptionist') navigate('/clinic/queue');
                else navigate('/clinic/telemedicine');
              }}
              className="w-full py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 transition flex items-center justify-center gap-1"
            >
              View all {count} emergencies <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
