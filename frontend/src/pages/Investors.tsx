import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvestors, type Investor } from '../api/investors';

// ─── Helpers ────────────────────────────────────────────────────────────────

const PLACEHOLDER_DESCRIPTION = 'Investor relationship in progress...';
const PLACEHOLDER_OWNER = 'Assigned user';

function formatStage(stage: string): string {
  return stage
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const STAGES = ['cold', 'initial', 'qualified', 'proposal', 'diligent', 'commit', 'received'];

function getStageBadgeClass(stage: string): string {
  const s = STAGES.includes(stage) ? stage : 'cold';
  if (s === 'commit' || s === 'received') {
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20';
  }
  if (s === 'diligent' || s === 'proposal') {
    return 'bg-tertiary/20 text-tertiary border-tertiary/20';
  }
  // cold, initial, qualified → gold
  return 'bg-primary/20 text-primary border-primary/20';
}

function getPlaceholderImage(name: string): string {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return `https://placehold.co/400x200/1e2025/998f81?text=${encodeURIComponent(initials)}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Investors() {
  const navigate = useNavigate();
  const [investors,      setInvestors]      = useState<Investor[]>([]);
  const [loading,        setLoading]        = useState<boolean>(true);
  const [error,          setError]          = useState<string | null>(null);
  const [stageFilter,    setStageFilter]    = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      try {
        const data = await getInvestors();
        setInvestors(data);
      } catch {
        setError('Failed to load investors');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  const filteredInvestors = investors.filter((inv) => {
    const stageMatch =
      stageFilter === 'all' ||
      (STAGES.includes(inv.stage) ? inv.stage === stageFilter : stageFilter === 'cold');

    // assignedFilter: backend doesn't support assignment yet — always match
    const assignedMatch = assignedFilter === 'all' || true;

    return stageMatch && assignedMatch;
  });

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col h-full py-6 px-4 bg-[#1f2128] w-64 shrink-0 border-r border-outline-variant/10">
        <div className="flex items-center gap-3 mb-10 px-1">
          <div className="bg-[#c9a96e] text-white font-bold rounded-sm w-8 h-8 flex items-center justify-center text-sm shrink-0">
            GP
          </div>
          <h1 className="text-sm font-semibold text-on-surface tracking-tight leading-tight">
            Grant Pilot
          </h1>
        </div>

        <nav className="flex-1 space-y-1">
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md group"
            href="#"
          >
            <span className="material-symbols-outlined text-xl">dashboard</span>
            <span className="font-medium tracking-tight">Dashboard</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#e6c487] font-medium bg-[#111318]/50 rounded-md group"
            href="#"
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              account_balance
            </span>
            <span className="font-medium tracking-tight">Investor Profile</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md group cursor-pointer"
            onClick={() => navigate('/ai')}
          >
            <span className="material-symbols-outlined text-xl">smart_toy</span>
            <span className="font-medium tracking-tight">AI Assistant</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md group cursor-pointer"
            onClick={() => navigate('/documents')}
          >
            <span className="material-symbols-outlined text-xl">folder_shared</span>
            <span className="font-medium tracking-tight">Documents</span>
          </a>
        </nav>

        <div className="mt-auto pt-6 space-y-4">
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] transition-all rounded-md"
            href="#"
          >
            <span className="material-symbols-outlined text-xl">settings</span>
            <span className="font-medium tracking-tight">Settings</span>
          </a>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-[16px] font-semibold text-on-surface">All Investors</h2>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                {loading ? '—' : `${filteredInvestors.length} leads`} · 5 active this week
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-full max-w-[240px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-lg">
                  search
                </span>
                <input
                  className="w-full bg-[#1e2025] border-none focus:ring-1 focus:ring-primary rounded-lg pl-10 pr-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40"
                  placeholder="Search investors..."
                  type="text"
                />
              </div>
              <button
                onClick={() => navigate('/investors/new')}
                className="shrink-0 bg-[#e6c487] text-[#111318] text-[13px] font-semibold py-2 px-4 rounded-md flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add Investor
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar pb-1">
            {/* Assigned to filter */}
            <div className="relative flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2025] rounded border border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors">
              <span className="text-[11px] font-medium text-on-surface-variant">Assigned to:</span>
              <span className="text-[11px] font-semibold text-on-surface">Everyone</span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">
                keyboard_arrow_down
              </span>
              <select
                value={assignedFilter}
                onChange={(e) => setAssignedFilter(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              >
                <option value="all">Everyone</option>
              </select>
            </div>
            {/* Stage filter */}
            <div className="relative flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2025] rounded border border-outline-variant/10 cursor-pointer hover:bg-surface-container-high transition-colors">
              <span className="text-[11px] font-medium text-on-surface-variant">Stage:</span>
              <span className="text-[11px] font-semibold text-on-surface">
                {stageFilter === 'all' ? 'All Stages' : capitalise(stageFilter)}
              </span>
              <span className="material-symbols-outlined text-xs text-on-surface-variant">
                keyboard_arrow_down
              </span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              >
                <option value="all">All Stages</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{capitalise(s)}</option>
                ))}
              </select>
            </div>
            <div className="h-4 w-px bg-outline-variant/20 mx-1"></div>
            <button
              onClick={() => { setStageFilter('all'); setAssignedFilter('all'); }}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Clear Filters
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <p className="text-sm text-on-surface-variant text-center py-16">
              Loading investors…
            </p>
          )}

          {/* Empty state */}
          {!loading && filteredInvestors.length === 0 && (
            <div className="p-4 text-gray-400">
              {investors.length === 0 ? 'No investors found' : 'No investors match the current filters'}
            </div>
          )}

          {/* Investor Grid */}
          {!loading && filteredInvestors.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {filteredInvestors.map((investor) => (
                <div
                  key={investor.id}
                  className="bg-[#1e2025] rounded-lg overflow-hidden flex flex-col group hover:shadow-xl hover:shadow-black/20 transition-all duration-300 cursor-pointer"
                  onClick={() => navigate(`/investor/${investor.id}`)}
                >
                  {/* Card Image */}
                  <div className="relative h-[200px] overflow-hidden">
                    <img
                      alt={investor.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      src={getPlaceholderImage(investor.name)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111318] via-transparent to-transparent opacity-80"></div>
                    <div className="absolute bottom-3 left-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border backdrop-blur-md ${getStageBadgeClass(investor.stage)}`}
                      >
                        {formatStage(investor.stage)}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1">
                    <h3 className="text-sm font-semibold text-on-surface">{investor.name}</h3>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      {investor.organization}
                    </p>
                    <p className="text-[12px] text-on-surface-variant/70 mt-3 line-clamp-2 leading-relaxed">
                      {PLACEHOLDER_DESCRIPTION}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="px-4 py-3 flex items-center justify-between border-t border-outline-variant/10">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-tertiary"></div>
                      <span className="text-[11px] text-on-surface-variant">{PLACEHOLDER_OWNER}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </main>

      {/* ── Mobile Bottom Nav ─────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1f2128] h-16 flex items-center justify-around px-2 border-t border-outline-variant/10 z-50">
        <a className="flex flex-col items-center gap-1 text-[#94a3b8]" href="#">
          <span className="material-symbols-outlined">dashboard</span>
          <span className="text-[10px]">Dashboard</span>
        </a>
        <a className="flex flex-col items-center gap-1 text-[#e6c487]" href="#">
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            account_balance
          </span>
          <span className="text-[10px]">Investors</span>
        </a>
        <a className="flex flex-col items-center gap-1 text-[#94a3b8]" href="#">
          <span className="material-symbols-outlined">smart_toy</span>
          <span className="text-[10px]">AI Assistant</span>
        </a>
        <a className="flex flex-col items-center gap-1 text-[#94a3b8]" href="#">
          <span className="material-symbols-outlined">folder_shared</span>
          <span className="text-[10px]">Docs</span>
        </a>
      </nav>

    </div>
  );
}
