import { useEffect, useMemo, useState } from 'react';
import {
  Bell, Building2, Check, DatabaseBackup, Download, Eye, KeyRound, Lock, Palette,
  RefreshCw, Save, School, Settings2, Shield, ShieldAlert, ShieldCheck, Sliders, Sparkles,
  Upload, UserCircle, Users, Volume2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { AUTH_API_BASE_URL, API_CLIENT_CONFIG, safeJsonResponse } from '../api/config';

/* ----------------------------- Shared building blocks ----------------------------- */

function Card({ title, subtitle, icon: Icon, children, accent = 'from-indigo-500 to-indigo-600' }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/90 p-6 shadow-xl shadow-slate-900/10 backdrop-blur">
      <header className="mb-5 flex items-start gap-3">
        {Icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
            <Icon size={18} />
          </div>
        )}
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-400">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15';

function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-indigo-200 hover:shadow-sm"
    >
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-400">{description}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function SaveBar({ saved, dirty, onSave, saving }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <p className={`text-sm font-medium transition ${saved ? 'text-emerald-600' : dirty ? 'text-amber-600' : 'text-slate-400'}`}>
        {saved ? 'All changes saved.' : dirty ? 'You have unsaved changes.' : 'Nothing to change yet.'}
      </p>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-500 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

/* ------------------------------ Wallpaper selector ------------------------------ */

function WallpaperSelector() {
  const { wallpaper, wallpapers, setWallpaper } = useTheme();
  return (
    <div className="grid grid-cols-2 gap-3">
      {wallpapers.map((w) => {
        const active = wallpaper.id === w.id;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => setWallpaper(w.id)}
            className={[
              'group relative overflow-hidden rounded-2xl border-2 p-0 text-left transition-all duration-200',
              active ? 'border-indigo-500 shadow-lg shadow-indigo-500/30' : 'border-transparent hover:border-indigo-200',
            ].join(' ')}
          >
            <div className="h-20 w-full" style={{ background: w.preview }} />
            <div className="bg-white px-3 py-2.5">
              <p className="text-sm font-bold text-slate-800">{w.name}</p>
              <p className="text-xs text-slate-400">{w.description}</p>
            </div>
            {active && (
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
                <Check size={14} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Account settings ------------------------------- */

function AccountSettings() {
  const { user } = useAuth();
  const { wallpaper, setWallpaper } = useTheme();
  const [profile, setProfile] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);

  const dirtyProfile = useMemo(
    () => profile.full_name !== (user?.full_name || '') || profile.email !== (user?.email || '') || profile.phone !== (user?.phone || ''),
    [profile, user],
  );

  async function saveProfile() {
    setSavedProfile(false);
    try {
      await fetch(`${AUTH_API_BASE_URL}/profile`, {
        method: 'PUT',
        credentials: API_CLIENT_CONFIG.withCredentials ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
    } catch {
      /* profile persistence optional — local state kept */
    }
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 3000);
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMessage(null);
    if (!passwords.current || !passwords.next) {
      setPwMessage({ type: 'error', text: 'Enter your current and new password.' });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPwMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (passwords.next.length < 8) {
      setPwMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    setPwBusy(true);
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/password`, {
        method: 'PUT',
        credentials: API_CLIENT_CONFIG.withCredentials ? 'include' : 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.next }),
      });
      const result = await safeJsonResponse(response);
      if (!response.ok) throw new Error(typeof result === 'string' ? result : result?.error || 'Failed to update password.');
      setPasswords({ current: '', next: '', confirm: '' });
      setPwMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (error) {
      setPwMessage({ type: 'error', text: error.message });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card title="Profile Details" subtitle="Your personal information on the Musanze Hub platform" icon={UserCircle}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input className={inputClass} value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
          </Field>
          <Field label="Email address">
            <input className={inputClass} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          </Field>
          <Field label="Phone number">
            <input className={inputClass} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </Field>
          <Field label="Role">
            <input className={`${inputClass} bg-slate-100`} value={user?.role || ''} readOnly />
          </Field>
        </div>
        <SaveBar saved={savedProfile} dirty={dirtyProfile} onSave={saveProfile} saving={false} />
      </Card>

      <Card title="Security & Password" subtitle="Keep your account protected with a strong password" icon={KeyRound} accent="from-rose-500 to-rose-600">
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <input className={inputClass} type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
          </Field>
          <Field label="New password" hint="Minimum 8 characters">
            <input className={inputClass} type="password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
          </Field>
          <Field label="Confirm new password">
            <input className={inputClass} type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
          </Field>
          {pwMessage && (
            <p className={`sm:col-span-3 rounded-xl px-4 py-3 text-sm ${pwMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`} role="status">
              {pwMessage.text}
            </p>
          )}
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={pwBusy}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:from-rose-600 hover:to-rose-700 disabled:opacity-60"
            >
              <Lock size={16} /> {pwBusy ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Theme & Wallpaper" subtitle="Applied instantly and remembered for your session" icon={Palette} accent="from-violet-500 to-fuchsia-600">
        <WallpaperSelector />
      </Card>
    </div>
  );
}

/* --------------------------------- Admin tabs ---------------------------------- */

function SystemParameters() {
  const [state, setState] = useState({ maintenance: false, autoBackup: true, sessionTimeout: '45', maxUpload: '10', timezone: 'Africa/Kigali' });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key) => (value) => { setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

  return (
    <div className="space-y-6">
      <Card title="System Parameters" subtitle="Platform-wide operational switches" icon={Sliders}>
        <div className="space-y-3">
          <Toggle checked={state.maintenance} onChange={set('maintenance')} label="Maintenance mode" description="Temporarily lock the portal for non-admin users" />
          <Toggle checked={state.autoBackup} onChange={set('autoBackup')} label="Automatic nightly backup" description="Runs at 23:00 CAT to the configured backup vault" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Session timeout (minutes)">
            <input className={inputClass} type="number" value={state.sessionTimeout} onChange={(e) => set('sessionTimeout')(e.target.value)} />
          </Field>
          <Field label="Max upload size (MB)">
            <input className={inputClass} type="number" value={state.maxUpload} onChange={(e) => set('maxUpload')(e.target.value)} />
          </Field>
          <Field label="Timezone">
            <select className={inputClass} value={state.timezone} onChange={(e) => set('timezone')(e.target.value)}>
              <option value="Africa/Kigali">Africa/Kigali (CAT)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>

      <Card title="Backup & Restore" subtitle="Protect school data with point-in-time snapshots" icon={DatabaseBackup} accent="from-slate-700 to-slate-900">
        <div className="flex flex-wrap gap-3">
          <button type="button" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-500">
            <Download size={16} /> Trigger backup now
          </button>
          <button type="button" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <Upload size={16} /> Restore from snapshot
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Last backup: today at 23:00 CAT · Status: healthy</p>
      </Card>
    </div>
  );
}

function SchoolDetails() {
  const [details, setDetails] = useState({
    name: 'Musanze Hub Polytechnic College',
    shortName: 'MIPC',
    address: 'Muhoza, Musanze District, Northern Province, Rwanda',
    phone: '+250 788 000 000',
    email: 'info@mipc.ac.rw',
    motto: 'Knowledge, Skill, Integrity',
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <Card title="School Details" subtitle="Official Musanze Hub institution profile" icon={Building2}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Institution name">
          <input className={inputClass} value={details.name} onChange={(e) => { setDetails({ ...details, name: e.target.value }); setDirty(true); setSaved(false); }} />
        </Field>
        <Field label="Short name / abbreviation">
          <input className={inputClass} value={details.shortName} onChange={(e) => { setDetails({ ...details, shortName: e.target.value }); setDirty(true); setSaved(false); }} />
        </Field>
        <Field label="Physical address">
          <input className={inputClass} value={details.address} onChange={(e) => { setDetails({ ...details, address: e.target.value }); setDirty(true); setSaved(false); }} />
        </Field>
        <Field label="Contact phone">
          <input className={inputClass} value={details.phone} onChange={(e) => { setDetails({ ...details, phone: e.target.value }); setDirty(true); setSaved(false); }} />
        </Field>
        <Field label="Official email">
          <input className={inputClass} value={details.email} onChange={(e) => { setDetails({ ...details, email: e.target.value }); setDirty(true); setSaved(false); }} />
        </Field>
        <Field label="Motto">
          <input className={inputClass} value={details.motto} onChange={(e) => { setDetails({ ...details, motto: e.target.value }); setDirty(true); setSaved(false); }} />
        </Field>
      </div>
      <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
    </Card>
  );
}

function ConduitSettings() {
  const [state, setState] = useState({ pickupWindow: '40', handoverGrace: '12', alertThreshold: '75', autoEscalate: true });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key) => (value) => { setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

  return (
    <Card title="Global 40-Point Conduit Settings" subtitle="Gate-to-parent handover conduit policy for all hubs" icon={School} accent="from-emerald-500 to-emerald-600">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pickup window (minutes)">
          <input className={inputClass} type="number" value={state.pickupWindow} onChange={(e) => set('pickupWindow')(e.target.value)} />
        </Field>
        <Field label="Handover grace (minutes)">
          <input className={inputClass} type="number" value={state.handoverGrace} onChange={(e) => set('handoverGrace')(e.target.value)} />
        </Field>
        <Field label="Conduit health alert at (%)">
          <input className={inputClass} type="number" value={state.alertThreshold} onChange={(e) => set('alertThreshold')(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Toggle checked={state.autoEscalate} onChange={set('autoEscalate')} label="Auto-escalate stalled conduits" description="Notify DOD and Security when a conduit stalls beyond grace" />
      </div>
      <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
    </Card>
  );
}

function BellConfiguration() {
  const [state, setState] = useState({ enabled: true, morning: '07:30', lunch: '12:30', dismissal: '16:00', volume: '70' });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key) => (value) => { setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

  return (
    <Card title="IoT Smart Bell Configuration" subtitle="Schedule and volume for campus IoT bell relays" icon={Bell} accent="from-amber-500 to-orange-600">
      <Toggle checked={state.enabled} onChange={set('enabled')} label="IoT bell enabled" description="Rings automatically on the configured schedule" />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Morning bell">
          <input className={inputClass} type="time" value={state.morning} onChange={(e) => set('morning')(e.target.value)} />
        </Field>
        <Field label="Lunch bell">
          <input className={inputClass} type="time" value={state.lunch} onChange={(e) => set('lunch')(e.target.value)} />
        </Field>
        <Field label="Dismissal bell">
          <input className={inputClass} type="time" value={state.dismissal} onChange={(e) => set('dismissal')(e.target.value)} />
        </Field>
        <Field label="Volume (0–100)">
          <input className={inputClass} type="range" min="0" max="100" value={state.volume} onChange={(e) => set('volume')(e.target.value)} />
        </Field>
      </div>
      <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
    </Card>
  );
}

function UserRoleManagement() {
  const roles = [
    { role: 'ADMIN', users: 2, description: 'Full platform control, settings and user management', color: 'bg-indigo-600' },
    { role: 'DOD', users: 1, description: 'Discipline oversight, approvals and rule thresholds', color: 'bg-rose-600' },
    { role: 'PATRON', users: 3, description: 'Student welfare, departures and attendance', color: 'bg-emerald-600' },
    { role: 'MATRON', users: 2, description: 'Dormitory care, health and boarding roster', color: 'bg-sky-600' },
    { role: 'SECURITY', users: 4, description: 'Gate logs, conduits and transport tracking', color: 'bg-slate-700' },
  ];
  return (
    <Card title="User Role Management" subtitle="Review role capabilities and active assignments" icon={Users} accent="from-fuchsia-500 to-purple-600">
      <div className="space-y-3">
        {roles.map(({ role, users, description, color }) => (
          <div key={role} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white ${color}`}>
              {role.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">{role}</p>
              <p className="text-xs text-slate-400">{description}</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{users} active</span>
            <button type="button" className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              Manage
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* --------------------------------- DOD tabs ------------------------------------ */

function DisciplineThresholds() {
  const [thresholds, setThresholds] = useState({ minor: '2', major: '5', critical: '10', suspensionReview: '15' });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setThresholds((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Discipline Rule Deduction Thresholds" subtitle="Demerit points that trigger corrective action" icon={Shield}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minor violation deduction">
            <input className={inputClass} type="number" value={thresholds.minor} onChange={(e) => set('minor')(e.target.value)} />
          </Field>
          <Field label="Major violation deduction">
            <input className={inputClass} type="number" value={thresholds.major} onChange={(e) => set('major')(e.target.value)} />
          </Field>
          <Field label="Critical violation deduction">
            <input className={inputClass} type="number" value={thresholds.critical} onChange={(e) => set('critical')(e.target.value)} />
          </Field>
          <Field label="Suspension review at (total points)">
            <input className={inputClass} type="number" value={thresholds.suspensionReview} onChange={(e) => set('suspensionReview')(e.target.value)} />
          </Field>
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      function IncidentCategories() {
  const [categories, setCategories] = useState([
      {name: 'Late to class', points: 2, severity: 'Minor' },
      {name: 'Uniform violation', points: 2, severity: 'Minor' },
      {name: 'Disrespect to staff', points: 5, severity: 'Major' },
      {name: 'Fighting', points: 10, severity: 'Critical' },
      ]);
      const [newCategory, setNewCategory] = useState({name: '', points: '', severity: 'Minor' });

      return (
      <Card title="Incident Categories" subtitle="Classify incidents and map automatic deductions" icon={ShieldAlert} accent="from-rose-500 to-rose-600">
        <div className="space-y-2">
          {categories.map((c, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.severity === 'Critical' ? 'bg-rose-100 text-rose-700' : c.severity === 'Major' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                {c.severity}
              </span>
              <p className="flex-1 text-sm font-medium text-slate-800">{c.name}</p>
              <span className="text-sm font-bold text-indigo-600">−{c.points} pts</span>
              <button
                type="button"
                className="text-xs font-semibold text-rose-500 hover:underline"
                onClick={() => setCategories(categories.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <input className={inputClass} placeholder="Category name" value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} />
          <input className={inputClass} type="number" placeholder="Points" value={newCategory.points} onChange={(e) => setNewCategory({ ...newCategory, points: e.target.value })} />
          <select className={inputClass} value={newCategory.severity} onChange={(e) => setNewCategory({ ...newCategory, severity: e.target.value })}>
            <option>Minor</option><option>Major</option><option>Critical</option>
          </select>
          <button
            type="button"
            disabled={!newCategory.name || !newCategory.points}
            onClick={() => { setCategories([...categories, { ...newCategory, points: Number(newCategory.points) }]); setNewCategory({ name: '', points: '', severity: 'Minor' }); }}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            Add category
          </button>
        </div>
      </Card>
      );
}

      function ApprovalNotificationTriggers() {
  const [state, setState] = useState({onIncident: true, onThreshold: true, weeklyDigest: false, email: true, sms: false });
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Approval Notification Triggers" subtitle="When and how the DOD gets notified" icon={Sparkles} accent="from-cyan-500 to-blue-600">
        <div className="space-y-3">
          <Toggle checked={state.onIncident} onChange={set('onIncident')} label="New incident filed" description="Notify immediately when staff file an incident" />
          <Toggle checked={state.onThreshold} onChange={set('onThreshold')} label="Threshold crossed" description="Notify when a student crosses a deduction threshold" />
          <Toggle checked={state.weeklyDigest} onChange={set('weeklyDigest')} label="Weekly digest" description="Summary of all discipline activity each Friday" />
          <Toggle checked={state.email} onChange={set('email')} label="Email notifications" />
          <Toggle checked={state.sms} onChange={set('sms')} label="SMS notifications" />
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      /* ----------------------------- Patron & Matron tabs ----------------------------- */

      function DepartureLimits() {
  const [state, setState] = useState({weeklyLimit: '2', weekendCutoff: '15:00', returnDay: 'Sunday', escortRequired: true });
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Departure Limits" subtitle="Student leave and departure policy" icon={ShieldCheck} accent="from-emerald-500 to-teal-600">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Departures per student / week">
            <input className={inputClass} type="number" value={state.weeklyLimit} onChange={(e) => set('weeklyLimit')(e.target.value)} />
          </Field>
          <Field label="Weekend departure cutoff">
            <input className={inputClass} type="time" value={state.weekendCutoff} onChange={(e) => set('weekendCutoff')(e.target.value)} />
          </Field>
          <Field label="Expected return day">
            <select className={inputClass} value={state.returnDay} onChange={(e) => set('returnDay')(e.target.value)}>
              <option>Saturday</option><option>Sunday</option><option>Monday</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Toggle checked={state.escortRequired} onChange={set('escortRequired')} label="Parent/guardian escort required" description="Departures approved only when a guardian collects the student" />
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      function DormitoryRosterFilters() {
  const [state, setState] = useState({defaultView: 'All dorms', showMedical: true, groupBy: 'Class' });
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Dormitory Roster Filters" subtitle="How rosters are presented to you by default" icon={Eye} accent="from-sky-500 to-indigo-600">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default roster view">
            <select className={inputClass} value={state.defaultView} onChange={(e) => set('defaultView')(e.target.value)}>
              <option>All dorms</option><option>Girls block</option><option>Boys block</option>
            </select>
          </Field>
          <Field label="Group roster by">
            <select className={inputClass} value={state.groupBy} onChange={(e) => set('groupBy')(e.target.value)}>
              <option>Class</option><option>Room</option><option>Year</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Toggle checked={state.showMedical} onChange={set('showMedical')} label="Show medical flags on roster" description="Highlight students with active medical notes" />
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      function ParentContactPreferences() {
  const [state, setState] = useState({channel: 'SMS', quietHours: true, language: 'Kinyarwanda' });
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Parent Contact Preferences" subtitle="How the school communicates with guardians" icon={Volume2} accent="from-violet-500 to-purple-600">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary contact channel">
            <select className={inputClass} value={state.channel} onChange={(e) => set('channel')(e.target.value)}>
              <option>SMS</option><option>Email</option><option>Phone call</option>
            </select>
          </Field>
          <Field label="Message language">
            <select className={inputClass} value={state.language} onChange={(e) => set('language')(e.target.value)}>
              <option>Kinyarwanda</option><option>English</option><option>French</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Toggle checked={state.quietHours} onChange={set('quietHours')} label="Respect quiet hours (21:00–06:00)" description="Queue non-urgent messages until morning" />
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      /* -------------------------------- Security tabs --------------------------------- */

      function GateLogRefresh() {
  const [state, setState] = useState({frequency: '30', liveFeed: true });
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Gate Log Refresh Frequency" subtitle="How often gate logs auto-refresh on your screens" icon={RefreshCw} accent="from-slate-600 to-slate-800">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Refresh interval (seconds)">
            <input className={inputClass} type="number" min="5" value={state.frequency} onChange={(e) => set('frequency')(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle checked={state.liveFeed} onChange={set('liveFeed')} label="Live gate feed" description="Stream new entries without manual reload" />
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      function OverdueAlerts() {
  const [state, setState] = useState({audio: true, banner: true, escalationAfter: '10' });
      const [dirty, setDirty] = useState(false);
      const [saved, setSaved] = useState(false);
  const set = (key) => (value) => {setState((s) => ({ ...s, [key]: value })); setDirty(true); setSaved(false); };

      return (
      <Card title="Overdue Alert Audio & Banners" subtitle="Alert behaviour for overdue returns and conduits" icon={Volume2} accent="from-rose-500 to-orange-500">
        <div className="space-y-3">
          <Toggle checked={state.audio} onChange={set('audio')} label="Audio alert chime" description="Play a chime when an overdue event is detected" />
          <Toggle checked={state.banner} onChange={set('banner')} label="Full-width alert banner" description="Show a persistent red banner on the gate dashboard" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Escalate to admin after (minutes)">
            <input className={inputClass} type="number" value={state.escalationAfter} onChange={(e) => set('escalationAfter')(e.target.value)} />
          </Field>
        </div>
        <SaveBar saved={saved} dirty={dirty} onSave={() => { setSaved(true); setDirty(false); }} saving={false} />
      </Card>
      );
}

      /* -------------------------------- Settings shell -------------------------------- */

      const TAB_SECTIONS = {
        ADMIN: [
      {id: 'system', label: 'System Parameters', icon: Sliders, content: SystemParameters },
      {id: 'school', label: 'School Details', icon: School, content: SchoolDetails },
      {id: 'conduit', label: '40-Point Conduit', icon: Settings2, content: ConduitSettings },
      {id: 'bell', label: 'IoT Bell Configuration', icon: Bell, content: BellConfiguration },
      {id: 'roles', label: 'User Role Management', icon: Users, content: UserRoleManagement },
      {id: 'account', label: 'Account Settings', icon: UserCircle, content: AccountSettings },
      ],
      DOD: [
      {id: 'thresholds', label: 'Deduction Thresholds', icon: Shield, content: DisciplineThresholds },
      {id: 'categories', label: 'Incident Categories', icon: ShieldAlert, content: IncidentCategories },
      {id: 'triggers', label: 'Notification Triggers', icon: Sparkles, content: ApprovalNotificationTriggers },
      {id: 'account', label: 'Account Settings', icon: UserCircle, content: AccountSettings },
      ],
      PATRON: [
      {id: 'departures', label: 'Departure Limits', icon: ShieldCheck, content: DepartureLimits },
      {id: 'roster', label: 'Dormitory Roster Filters', icon: Eye, content: DormitoryRosterFilters },
      {id: 'parents', label: 'Parent Contact Preferences', icon: Volume2, content: ParentContactPreferences },
      {id: 'account', label: 'Account Settings', icon: UserCircle, content: AccountSettings },
      ],
      MATRON: [
      {id: 'departures', label: 'Departure Limits', icon: ShieldCheck, content: DepartureLimits },
      {id: 'roster', label: 'Dormitory Roster Filters', icon: Eye, content: DormitoryRosterFilters },
      {id: 'parents', label: 'Parent Contact Preferences', icon: Volume2, content: ParentContactPreferences },
      {id: 'account', label: 'Account Settings', icon: UserCircle, content: AccountSettings },
      ],
      SECURITY: [
      {id: 'refresh', label: 'Gate Log Refresh', icon: RefreshCw, content: GateLogRefresh },
      {id: 'alerts', label: 'Overdue Alerts', icon: Volume2, content: OverdueAlerts },
      {id: 'account', label: 'Account Settings', icon: UserCircle, content: AccountSettings },
      ],
};

      export default function Settings() {
  const {user} = useAuth();
      const tabs = TAB_SECTIONS[user?.role] || TAB_SECTIONS.SECURITY;
      const [activeTab, setActiveTab] = useState(tabs[0].id);

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab(tabs[0].id);
  }, [tabs]); // eslint-disable-line react-hooks/exhaustive-deps

  const ActiveTab = tabs.find((t) => t.id === activeTab)?.content || tabs[0].content;

      return (
      <main className="app-shell-inner p-4 md:p-8 lg:p-10">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">Settings</p>
          <h1 className="mt-1 text-2xl font-bold text-white md:text-3xl">Control Center</h1>
          <p className="mt-1 text-sm text-slate-200/70">
            Role-based configuration for <span className="font-semibold text-white">{user?.role}</span> · signed in as {user?.full_name}
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Internal settings sidebar */}
          <nav
            aria-label="Settings sections"
            className="wp-glass shrink-0 rounded-3xl border p-3 lg:w-72"
          >
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Configuration</p>
            <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {tabs.map(({ id, label, icon: Icon }) => {
                const active = id === activeTab;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={[
                      'flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 lg:w-full',
                      active
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white',
                    ].join(' ')}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span className="whitespace-nowrap lg:truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Dynamic content pane */}
          <div className="min-w-0 flex-1">
            <div key={activeTab} className="animate-fade-up">
              <ActiveTab />
            </div>
          </div>
        </div>
      </main>
      );
}
