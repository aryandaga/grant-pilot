import { useState, useEffect, useRef, useCallback, useMemo, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvestors, type Investor } from '../api/investors';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  searchDocuments,
  getDocumentBlobUrl,
  type DocumentItem,
  type DocumentSearchResult,
} from '../api/documents';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function getFileType(name: string): { label: string; icon: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')
    return { label: 'PDF', icon: 'picture_as_pdf', color: 'text-red-400' };
  if (['xlsx', 'xls', 'csv'].includes(ext))
    return { label: 'Spreadsheet', icon: 'table_chart', color: 'text-green-400' };
  if (['docx', 'doc'].includes(ext))
    return { label: 'Document', icon: 'description', color: 'text-blue-400' };
  if (['pptx', 'ppt'].includes(ext))
    return { label: 'Presentation', icon: 'show_chart', color: 'text-primary' };
  return { label: 'File', icon: 'attach_file', color: 'text-outline' };
}

type DateRange = 'all' | '7d' | '30d' | 'year';

const TYPE_OPTIONS = ['PDF', 'Spreadsheet', 'Document', 'Presentation', 'File'] as const;

const DATE_LABELS: Record<DateRange, string> = {
  all:  'All time',
  '7d': 'Last 7 days',
  '30d':'Last 30 days',
  year: 'This year',
};

function passesDateFilter(dateStr: string, range: DateRange): boolean {
  if (range === 'all') return true;
  const date = new Date(dateStr);
  const now  = new Date();
  if (range === '7d')  return date >= new Date(now.getTime() - 7  * 86_400_000);
  if (range === '30d') return date >= new Date(now.getTime() - 30 * 86_400_000);
  if (range === 'year') return date.getFullYear() === now.getFullYear();
  return true;
}

function scoreBar(score: number): string {
  if (score >= 0.85) return 'bg-emerald-500';
  if (score >= 0.65) return 'bg-primary';
  return 'bg-outline-variant';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Documents() {
  const navigate = useNavigate();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [documents,  setDocuments]  = useState<DocumentItem[]>([]);
  const [investors,  setInvestors]  = useState<Investor[]>([]);
  const [loading,    setLoading]    = useState<boolean>(true);
  const [error,      setError]      = useState<string | null>(null);

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchQuery,   setSearchQuery]   = useState<string>('');
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[] | null>(null);
  const [searching,     setSearching]     = useState<boolean>(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Upload state ─────────────────────────────────────────────────────────────
  const [showUploadPanel,   setShowUploadPanel]   = useState<boolean>(false);
  const [uploadFile,        setUploadFile]        = useState<File | null>(null);
  const [uploadInvestorId,  setUploadInvestorId]  = useState<string>('');
  const [uploading,         setUploading]         = useState<boolean>(false);
  const [uploadError,       setUploadError]       = useState<string | null>(null);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [filterInvestor, setFilterInvestor] = useState<string>('');
  const [filterType,     setFilterType]     = useState<string>('');
  const [filterDate,     setFilterDate]     = useState<DateRange>('all');

  // ── Delete state ─────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived: filtered document list ──────────────────────────────────────────
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (filterInvestor && doc.investor_name !== filterInvestor) return false;
      if (filterType && getFileType(doc.name).label !== filterType) return false;
      if (!passesDateFilter(doc.created_at, filterDate)) return false;
      return true;
    });
  }, [documents, filterInvestor, filterType, filterDate]);

  const filtersActive = filterInvestor !== '' || filterType !== '' || filterDate !== 'all';

  const clearFilters = () => {
    setFilterInvestor('');
    setFilterType('');
    setFilterDate('all');
  };

  // ── Fetch on mount ───────────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    try {
      const data = await getDocuments();
      setDocuments(data);
    } catch {
      setError('Failed to load documents.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [docs, invs] = await Promise.all([getDocuments(), getInvestors()]);
        setDocuments(docs);
        setInvestors(invs);
      } catch {
        setError('Failed to load data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Debounced search ─────────────────────────────────────────────────────────
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchDocuments(value.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  // ── Upload handlers ──────────────────────────────────────────────────────────
  const handleFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setUploadFile(file);
    setUploadError(null);
    setShowUploadPanel(true);
    // reset input so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadDocument(uploadFile, uploadInvestorId || undefined);
      setShowUploadPanel(false);
      setUploadFile(null);
      setUploadInvestorId('');
      await fetchDocuments();
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setShowUploadPanel(false);
    setUploadFile(null);
    setUploadInvestorId('');
    setUploadError(null);
  };

  // ── Delete handler ───────────────────────────────────────────────────────────
  const handleDelete = async (doc: DocumentItem) => {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      await fetchDocuments();
    } catch {
      // silent — document list will still reflect actual state on next fetch
    } finally {
      setDeletingId(null);
    }
  };

  // ── View handler ─────────────────────────────────────────────────────────────
  const handleView = async (id: string) => {
    try {
      const url = await getDocumentBlobUrl(id);
      window.open(url, '_blank');
    } catch {
      // fallback: try direct URL (will fail auth in browser but is the intent)
      window.open(`http://localhost:8000/api/documents/${id}/download`, '_blank');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
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
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md"
            href="#"
          >
            <span className="material-symbols-outlined text-xl">dashboard</span>
            <span className="font-medium tracking-tight">Dashboard</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md cursor-pointer"
            onClick={() => navigate('/investors')}
          >
            <span className="material-symbols-outlined text-xl">account_balance</span>
            <span className="font-medium tracking-tight">Investor Profile</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md cursor-pointer"
            onClick={() => navigate('/ai')}
          >
            <span className="material-symbols-outlined text-xl">smart_toy</span>
            <span className="font-medium tracking-tight">AI Assistant</span>
          </a>
          {/* Active item */}
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#e6c487] font-medium bg-[#111318]/50 rounded-md"
            href="#"
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              folder_shared
            </span>
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

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileSelected}
          />

          {/* ── Top toolbar — single row ────────────────────────────────── */}
          <div className="flex items-center gap-3 w-full overflow-x-auto no-scrollbar mb-6">

            {/* Search — expands */}
            <div className="relative flex-1 min-w-[180px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[18px]">
                {searching ? 'hourglass_empty' : 'search'}
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by content (AI-powered)…"
                className="w-full h-10 bg-[#1e2025] border-none focus:ring-1 focus:ring-primary rounded-lg pl-10 pr-8 text-sm text-on-surface placeholder:text-on-surface-variant/40"
              />
              {searchQuery && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>

            {/* Investor filter */}
            <div className="relative h-10 flex items-center gap-1.5 pl-3 pr-8 bg-[#1e2025] rounded-lg border border-outline-variant/10 hover:bg-surface-container-high transition-colors shrink-0">
              <span className="text-[11px] font-medium text-on-surface-variant whitespace-nowrap">Investor:</span>
              <select
                value={filterInvestor}
                onChange={(e) => setFilterInvestor(e.target.value)}
                className="appearance-none bg-transparent text-[11px] font-semibold text-on-surface focus:outline-none cursor-pointer [&>option]:bg-[#1e2025] [&>option]:text-[#e2e2e9]"
              >
                <option value="">All</option>
                {investors.map((inv) => (
                  <option key={inv.id} value={inv.name}>{inv.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined text-xs text-on-surface-variant pointer-events-none absolute right-2">
                keyboard_arrow_down
              </span>
            </div>

            {/* Type filter */}
            <div className="relative h-10 flex items-center gap-1.5 pl-3 pr-8 bg-[#1e2025] rounded-lg border border-outline-variant/10 hover:bg-surface-container-high transition-colors shrink-0">
              <span className="text-[11px] font-medium text-on-surface-variant">Type:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="appearance-none bg-transparent text-[11px] font-semibold text-on-surface focus:outline-none cursor-pointer [&>option]:bg-[#1e2025] [&>option]:text-[#e2e2e9]"
              >
                <option value="">All</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span className="material-symbols-outlined text-xs text-on-surface-variant pointer-events-none absolute right-2">
                keyboard_arrow_down
              </span>
            </div>

            {/* Date filter */}
            <div className="relative h-10 flex items-center gap-1.5 pl-3 pr-8 bg-[#1e2025] rounded-lg border border-outline-variant/10 hover:bg-surface-container-high transition-colors shrink-0">
              <span className="text-[11px] font-medium text-on-surface-variant">Date:</span>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value as DateRange)}
                className="appearance-none bg-transparent text-[11px] font-semibold text-on-surface focus:outline-none cursor-pointer [&>option]:bg-[#1e2025] [&>option]:text-[#e2e2e9]"
              >
                {(Object.entries(DATE_LABELS) as [DateRange, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <span className="material-symbols-outlined text-xs text-on-surface-variant pointer-events-none absolute right-2">
                keyboard_arrow_down
              </span>
            </div>

            {/* Clear filters — only when active */}
            {filtersActive && (
              <>
                <div className="h-5 w-px bg-outline-variant/20 shrink-0" />
                <button
                  onClick={clearFilters}
                  className="h-10 px-3 rounded-lg text-[11px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0 whitespace-nowrap"
                >
                  Clear
                </button>
              </>
            )}

            {/* Upload — pinned right */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-10 flex items-center gap-2 px-5 bg-primary-container text-on-primary-container text-sm font-bold rounded-lg hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shrink-0"
            >
              <span className="material-symbols-outlined text-lg">upload</span>
              Upload
            </button>
          </div>

          {/* ── Upload panel ─────────────────────────────────────────────── */}
          {showUploadPanel && uploadFile && (
            <div className="bg-surface-container border border-primary/20 rounded-lg p-5 mb-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-400 text-xl">picture_as_pdf</span>
                  {uploadFile.name}
                </h3>
                <button onClick={handleCancelUpload} className="text-outline hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {/* Investor select */}
                <div className="flex-1">
                  <label className="text-[10px] text-on-surface-variant uppercase tracking-wider block mb-1">
                    Link to Investor (optional)
                  </label>
                  <select
                    value={uploadInvestorId}
                    onChange={(e) => setUploadInvestorId(e.target.value)}
                    className="w-full bg-[#1e2025] border border-outline-variant/30 rounded text-sm text-on-surface px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="">— No investor —</option>
                    {investors.map((inv) => (
                      <option key={inv.id} value={inv.id}>{inv.name}</option>
                    ))}
                  </select>
                </div>

                {/* Confirm upload */}
                <div className="flex items-end">
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="px-6 py-2 bg-primary-container text-on-primary-container text-sm font-semibold rounded hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {uploading
                      ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span>Uploading…</>
                      : <><span className="material-symbols-outlined text-base">cloud_upload</span>Confirm Upload</>
                    }
                  </button>
                </div>
              </div>

              {uploadError && (
                <p className="text-[11px] text-red-400">{uploadError}</p>
              )}
            </div>
          )}

          {/* ── Error state ──────────────────────────────────────────────── */}
          {error && (
            <div className="mb-6 px-4 py-3 bg-red-900/10 border border-red-900/20 rounded text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── Search results ───────────────────────────────────────────── */}
          {searchQuery && searchResults !== null && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="material-symbols-outlined text-primary text-base"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  auto_awesome
                </span>
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  AI Search Results
                </h2>
                <span className="text-[10px] text-outline ml-1">
                  {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''} for "{searchQuery}"
                </span>
              </div>

              {searchResults.length === 0 ? (
                <div className="bg-surface-container rounded-lg px-6 py-8 text-center">
                  <span className="material-symbols-outlined text-[32px] text-outline opacity-40 block mb-2">
                    search_off
                  </span>
                  <p className="text-sm text-outline">No matching content found.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {searchResults.map((result, idx) => (
                    <div
                      key={`${result.document_id}-${idx}`}
                      className="bg-surface-container rounded-lg p-4 border border-white/5 hover:border-primary/20 transition-all cursor-pointer"
                      onClick={() => handleView(result.document_id)}
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-red-400 text-base shrink-0">picture_as_pdf</span>
                          <span className="text-sm font-semibold text-on-surface truncate">
                            {result.document_name}
                          </span>
                        </div>
                        {/* Relevance score */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-16 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${scoreBar(result.score)}`}
                              style={{ width: `${Math.round(result.score * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-outline w-8 text-right">
                            {Math.round(result.score * 100)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] text-on-surface-variant leading-relaxed line-clamp-3">
                        {result.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── All Documents table ──────────────────────────────────────── */}
          <div className="bg-surface-container rounded-xl overflow-hidden border border-white/5 shadow-2xl">

            {/* Table header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-surface-container-high/50">
              <div>
                <h2 className="text-[16px] font-semibold text-on-surface">All Documents</h2>
                <p className="text-[12px] text-on-surface-variant mt-0.5">
                  {loading ? '—' : filtersActive
                    ? `${filteredDocuments.length} of ${documents.length} file${documents.length !== 1 ? 's' : ''}`
                    : `${documents.length} file${documents.length !== 1 ? 's' : ''}`
                  }
                </p>
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <p className="text-sm text-on-surface-variant text-center py-16">
                Loading documents…
              </p>
            )}

            {/* Empty — no documents at all */}
            {!loading && documents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <span className="material-symbols-outlined text-[40px] text-outline opacity-30">folder_open</span>
                <p className="text-sm text-outline">No documents uploaded yet.</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[12px] text-primary hover:underline mt-1"
                >
                  Upload your first document
                </button>
              </div>
            )}

            {/* Empty — filters produced no matches */}
            {!loading && documents.length > 0 && filteredDocuments.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <span className="material-symbols-outlined text-[36px] text-outline opacity-30">filter_list_off</span>
                <p className="text-sm text-outline">No documents match the selected filters.</p>
                <button
                  onClick={clearFilters}
                  className="text-[12px] text-primary hover:underline mt-1"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Table */}
            {!loading && filteredDocuments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-high/30">
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline">Name</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline">Type</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline">Linked Investor</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline">Chunks</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline">Date</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline">Access</th>
                      <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-outline"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredDocuments.map((doc) => {
                      const ft = getFileType(doc.name);
                      const isDeleting = deletingId === doc.id;
                      return (
                        <tr
                          key={doc.id}
                          className="h-[52px] hover:bg-white/5 odd:bg-white/[0.02] transition-colors group hover:shadow-[inset_2px_0_0_0_#c9a96e]"
                        >
                          {/* Name */}
                          <td className="px-6 py-0">
                            <button
                              onClick={() => handleView(doc.id)}
                              className="flex items-center gap-3 text-left hover:text-primary transition-colors"
                            >
                              <span className={`material-symbols-outlined text-xl shrink-0 ${ft.color}`}
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                {ft.icon}
                              </span>
                              <span className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors truncate max-w-[200px]">
                                {doc.name}
                              </span>
                            </button>
                          </td>

                          {/* Type */}
                          <td className="px-6 py-0">
                            <span className="px-2 py-1 bg-surface-variant rounded text-[11px] text-on-surface-variant">
                              {ft.label}
                            </span>
                          </td>

                          {/* Linked investor */}
                          <td className="px-6 py-0">
                            {doc.investor_name ? (
                              <span className="px-2 py-1 bg-surface-variant rounded text-[11px] text-on-surface-variant truncate block max-w-[130px]">
                                {doc.investor_name}
                              </span>
                            ) : (
                              <span className="text-[11px] text-outline">—</span>
                            )}
                          </td>

                          {/* Chunks */}
                          <td className="px-6 py-0">
                            <span className="text-[11px] text-outline">{doc.chunk_count}</span>
                          </td>

                          {/* Date */}
                          <td className="px-6 py-0 text-sm text-outline whitespace-nowrap">
                            {formatDate(doc.created_at)}
                          </td>

                          {/* Access placeholder */}
                          <td className="px-6 py-0">
                            <span className="flex items-center gap-1.5 text-[11px] text-green-400 bg-green-900/10 px-2 py-1 rounded border border-green-900/20 w-fit">
                              <span className="w-1 h-1 rounded-full bg-green-400"></span>
                              Team
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-0">
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleView(doc.id)}
                                title="Open PDF"
                                className="p-1.5 text-outline hover:text-primary transition-colors rounded hover:bg-white/5"
                              >
                                <span className="material-symbols-outlined text-base">open_in_new</span>
                              </button>
                              <button
                                onClick={() => handleDelete(doc)}
                                disabled={isDeleting}
                                title="Delete document"
                                className="p-1.5 text-outline hover:text-red-400 transition-colors rounded hover:bg-red-900/10 disabled:opacity-40"
                              >
                                <span className="material-symbols-outlined text-base">
                                  {isDeleting ? 'hourglass_empty' : 'delete'}
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1f2128] h-16 flex items-center justify-around px-2 border-t border-outline-variant/10 z-50">
        <a className="flex flex-col items-center gap-1 text-[#94a3b8]" href="#">
          <span className="material-symbols-outlined">dashboard</span>
          <span className="text-[10px]">Dashboard</span>
        </a>
        <a
          className="flex flex-col items-center gap-1 text-[#94a3b8]"
          onClick={() => navigate('/investors')}
        >
          <span className="material-symbols-outlined">account_balance</span>
          <span className="text-[10px]">Investors</span>
        </a>
        <a className="flex flex-col items-center gap-1 text-[#94a3b8]" href="#">
          <span className="material-symbols-outlined">smart_toy</span>
          <span className="text-[10px]">AI</span>
        </a>
        <a className="flex flex-col items-center gap-1 text-[#e6c487]">
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            folder_shared
          </span>
          <span className="text-[10px]">Docs</span>
        </a>
      </nav>

    </div>
  );
}
