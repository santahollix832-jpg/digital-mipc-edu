import { useCallback, useEffect, useState } from 'react';
import { ListPlus, Plus, RefreshCw, Save, Scale, Settings, X } from 'lucide-react';
import { apiFetch } from '../../api/config';
import { cardClasses, inputClasses, labelClasses } from './shared';

const FALLBACK_CATEGORIES = ['Academic Misconduct', 'Behavioral Issue', 'Dress Code', 'Attendance', 'Property Damage', 'Bullying / Harassment', 'Other'];

function RulesSettings({ toast, canManage = true }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch('/api/discipline/settings');
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || `Failed to load (${response.status}).`);
      setSettings(payload.data);
    } catch (err) {
      console.error('Failed to load discipline settings:', err);
      setLoadError(err.message || 'Unable to load discipline rules & settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (settings.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast?.('That category already exists.', 'error');
      return;
    }
    update('categories', [...settings.categories, name]);
    setNewCategory('');
  }

  function removeCategory(name) {
    update('categories', settings.categories.filter((c) => c !== name));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch('/api/discipline/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merit_positive_points: Number(settings.merit_positive_points),
          demerit_default_points: Number(settings.demerit_default_points),
          suspension_threshold: Number(settings.suspension_threshold),
          counseling_threshold: Number(settings.counseling_threshold),
          auto_suspension_enabled: Boolean(settings.auto_suspension_enabled),
          auto_parent_notification: Boolean(settings.auto_parent_notification),
          categories: settings.categories,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.message || 'Failed to save rules.');
      setSettings(payload.data);
      toast?.('Discipline rules saved successfully.');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className={cardClasses}><p className="text-sm text-slate-500">Loading discipline rules…</p></section>;
  }
  if (loadError || !settings) {
    return (
      <section className={cardClasses}>
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError || 'Settings unavailable.'}</p>
        <button type="button" onClick={loadSettings} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <RefreshCw size={15} /> Retry
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <section className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <Scale size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Points &amp; Penalty Thresholds</h2>
            <p className="text-sm text-slate-500">Configure scoring defaults and automatic escalation triggers.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClasses}>Default Merit Points</label>
            <input type="number" min="1" max="100" className={inputClasses} value={settings.merit_positive_points} onChange={(e) => update('merit_positive_points', e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <label className={labelClasses}>Default Demerit Points</label>
            <input type="number" min="1" max="100" className={inputClasses} value={settings.demerit_default_points} onChange={(e) => update('demerit_default_points', e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <label className={labelClasses}>Suspension Threshold (cumulative demerits)</label>
            <input type="number" min="1" className={inputClasses} value={settings.suspension_threshold} onChange={(e) => update('suspension_threshold', e.target.value)} disabled={!canManage} />
          </div>
          <div>
            <label className={labelClasses}>Counseling Threshold (cumulative demerits)</label>
            <input type="number" min="1" className={inputClasses} value={settings.counseling_threshold} onChange={(e) => update('counseling_threshold', e.target.value)} disabled={!canManage} />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {[
            { key: 'auto_suspension_enabled', label: 'Automatic suspension trigger', description: 'Suspend automatically when a student crosses the suspension threshold.' },
            { key: 'auto_parent_notification', label: 'Automatic guardian notification', description: 'Notify parents/guardians whenever a demerit or suspension is recorded.' },
          ].map(({ key, label, description }) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-indigo-600"
                checked={Boolean(settings[key])}
                onChange={(e) => update(key, e.target.checked)}
                disabled={!canManage}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className={cardClasses}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <ListPlus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Incident Category Definitions</h2>
            <p className="text-sm text-slate-500">Categories available when staff report discipline incidents.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(settings.categories.length ? settings.categories : FALLBACK_CATEGORIES).map((category) => (
            <span key={category} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800">
              {category}
              {canManage && (
                <button type="button" aria-label={`Remove ${category}`} onClick={() => removeCategory(category)} className="text-indigo-400 transition hover:text-rose-600">
                  <X size={14} />
                </button>
              )}
            </span>
          ))}
        </div>

        {canManage && (
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              className={inputClasses}
              placeholder="Add a new category, e.g., Substance Abuse…"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
            />
            <button type="button" onClick={addCategory} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700">
              <Plus size={16} /> Add
            </button>
          </div>
        )}
      </section>

      {canManage && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? 'Saving…' : 'Save Rules & Settings'}
          </button>
        </div>
      )}
    </form>
  );
}

export default RulesSettings;
