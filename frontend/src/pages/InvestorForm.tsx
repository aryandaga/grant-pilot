import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createInvestor,
  getInvestorStages,
  updateInvestor,
  type AssignedUser,
  type InvestorDetail,
  type InvestorPayload,
  type InvestorStage,
} from '../api/investors';
import { getUsers } from '../api/users';
import { DEFAULT_INVESTOR_STAGES, getStageKey, sortStages } from '../lib/investorStages';

// ─── Pipeline stages (source of truth) ───────────────────────────────────────

// ─── Props ────────────────────────────────────────────────────────────────────

type Props =
  | { mode: 'create'; investor?: undefined }
  | { mode: 'edit';   investor: InvestorDetail };

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvestorForm({ mode, investor }: Props) {
  const navigate = useNavigate();

  // Initialise fields
  const [name,         setName]         = useState(investor?.name         ?? '');
  const [stage,        setStage]        = useState(investor?.stage ?? 'cold');
  const [organization, setOrganization] = useState(investor?.organization  ?? '');
  const [email,        setEmail]        = useState(investor?.email         ?? '');
  const [capacity,     setCapacity]     = useState(investor?.capacity      != null ? String(investor.capacity)   : '');
  const [askAmount,    setAskAmount]    = useState(investor?.ask_amount    != null ? String(investor.ask_amount) : '');
  const [primaryOwnerId, setPrimaryOwnerId] = useState(investor?.primary_owner_id ?? '');
  const [interests,    setInterests]    = useState(
    investor?.interests && investor.interests.length > 0
      ? investor.interests.join(', ')
      : ''
  );

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [users, setUsers] = useState<AssignedUser[]>([]);
  const [stages, setStages] = useState<InvestorStage[]>(DEFAULT_INVESTOR_STAGES);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [data, stageData] = await Promise.all([getUsers(), getInvestorStages()]);
        const sortedStages = sortStages(stageData);
        setUsers(data);
        setStages(sortedStages);
        setStage((current) => getStageKey(sortedStages, current));
        if (!primaryOwnerId && data.length > 0) {
          setPrimaryOwnerId(data[0].id);
        }
      } catch {
        setError('Failed to load assignable users.');
      } finally {
        setUsersLoading(false);
      }
    })();
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!primaryOwnerId) { setError('Assigned user is required.'); return; }

    setSaving(true);
    setError(null);

    const payload: InvestorPayload = {
      name:         name.trim(),
      stage,
      primary_owner_id: primaryOwnerId,
      organization: organization.trim() || undefined,
      email:        email.trim()        || undefined,
      capacity:     capacity    !== '' ? Number(capacity)   : undefined,
      ask_amount:   askAmount   !== '' ? Number(askAmount)  : undefined,
      interests:    interests.trim()
        ? interests.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    };

    try {
      if (mode === 'create') {
        const created = await createInvestor(payload);
        navigate(`/investor/${created.id}`);
      } else {
        await updateInvestor(investor.id, payload);
        navigate(`/investor/${investor.id}`);
      }
    } catch {
      setError('Failed to save investor. Please try again.');
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputClass =
    'h-10 bg-surface-container border border-outline-variant/30 rounded-md text-on-surface px-3 ' +
    'focus:ring-1 focus:ring-primary focus:outline-none w-full text-sm placeholder:text-outline/50';

  const labelClass = 'text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-1 block';

  return (
    <div className="p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          className="text-[12px] text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
          onClick={() => navigate(mode === 'edit' ? `/investor/${investor!.id}` : '/investors')}
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          {mode === 'edit' ? 'Back to Profile' : 'Back to Pipeline'}
        </button>
      </div>

      <h1 className="text-[20px] font-bold text-on-surface mb-2">
        {mode === 'create' ? 'Add Investor' : 'Edit Investor'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-8">
        {mode === 'create'
          ? 'Create a new investor record in your pipeline.'
          : 'Update the details for this investor.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Basic Information ─────────────────────────────────────────── */}
        <section className="bg-surface-container rounded-lg p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-outline">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Name */}
            <div>
              <label className={labelClass}>
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Sequoia Capital"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Stage */}
            <div>
              <label className={labelClass}>Pipeline Stage</label>
              <select
                className={inputClass}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Organization & Contact ────────────────────────────────────── */}
        <section className="bg-surface-container rounded-lg p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-outline">
            Internal Assignment
          </h2>

          <div>
            <label className={labelClass}>
              Assigned User <span className="text-red-400">*</span>
            </label>
            <select
              className={inputClass}
              value={primaryOwnerId}
              onChange={(e) => setPrimaryOwnerId(e.target.value)}
              required
              disabled={usersLoading}
            >
              <option value="">{usersLoading ? 'Loading users...' : 'Select a user'}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} - {user.role === 'head' ? 'Head' : 'Member'}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="bg-surface-container rounded-lg p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-outline">
            Organization &amp; Contact
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Organization */}
            <div>
              <label className={labelClass}>Organization</label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Sequoia Capital Partners"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                placeholder="e.g. partner@fund.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Financials ───────────────────────────────────────────────── */}
        <section className="bg-surface-container rounded-lg p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-outline">
            Financials
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Capacity */}
            <div>
              <label className={labelClass}>Investment Capacity ($)</label>
              <input
                type="number"
                min="0"
                step="any"
                className={inputClass}
                placeholder="e.g. 5000000"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>

            {/* Ask Amount */}
            <div>
              <label className={labelClass}>Ask Amount ($)</label>
              <input
                type="number"
                min="0"
                step="any"
                className={inputClass}
                placeholder="e.g. 500000"
                value={askAmount}
                onChange={(e) => setAskAmount(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* ── Interests ────────────────────────────────────────────────── */}
        <section className="bg-surface-container rounded-lg p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-outline">
            Interests
          </h2>

          <div>
            <label className={labelClass}>
              Sector Interests{' '}
              <span className="normal-case font-normal text-outline">(comma-separated)</span>
            </label>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. FinTech, Renewable Energy, AI"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
            />
          </div>
        </section>

        {/* ── Error & Actions ───────────────────────────────────────────── */}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(mode === 'edit' ? `/investor/${investor!.id}` : '/investors')}
            className="px-5 py-2 ghost-border text-on-surface text-xs font-semibold rounded-sm hover:bg-surface-container-high transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-primary text-[#111318] text-xs font-semibold rounded-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? (mode === 'create' ? 'Creating…' : 'Saving…')
              : (mode === 'create' ? 'Create Investor' : 'Save Changes')}
          </button>
        </div>

      </form>
    </div>
  );
}
