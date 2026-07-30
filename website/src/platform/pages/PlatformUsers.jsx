import { useState, useEffect } from 'react';
import { listPlatformUsers, createPlatformUser } from '../api';
import { Plus, Shield } from 'lucide-react';
import { Modal } from '../components/shared';

export default function PlatformUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const fetch = () => {
    setLoading(true);
    listPlatformUsers().then((res) => setUsers(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createPlatformUser(form);
      setShowForm(false);
      setForm({ name: '', email: '', password: '' });
      fetch();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Platform Users</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Admin
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-neutral-900/40 col-span-full text-center py-10">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-neutral-900/40 col-span-full text-center py-10">No platform users</p>
        ) : users.map((u) => (
          <div key={u._id} className="bg-white rounded-2xl border border-neutral-300/60 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="font-medium text-neutral-900">{u.name}</p>
                <p className="text-sm text-neutral-900/50">{u.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-900/40">
              <span className="capitalize">{u.role}</span>
              <span className={u.isActive ? 'text-emerald-600' : 'text-red-500'}>
                {u.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {u.lastLoginAt && (
              <p className="text-xs text-neutral-900/40 mt-1">Last login: {new Date(u.lastLoginAt).toLocaleString()}</p>
            )}
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Platform Admin">
        {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-neutral-900/60 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength="8" className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-neutral-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
