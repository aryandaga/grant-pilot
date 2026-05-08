import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { getDocumentBlobUrl, getDocuments, type DocumentItem } from '../api/documents';
import { getInvestorStages, type InvestorStage } from '../api/investors';
import { DEFAULT_INVESTOR_STAGES, getStageKey, sortStages } from '../lib/investorStages';

// ─── Types ───────────────────────────────────────────────────────────────────

type InvestorDetail = {
  id: string;
  name: string;
  organization: string | null;
  email: string | null;
  stage: string;
  capacity: number | null;
  ask_amount: number | null;
  interests: string[] | null;
  primary_owner: {
    id: string;
    name: string;
    email: string;
    role: 'head' | 'member';
  } | null;
};

type Note = {
  id: string;
  investor_id: string;
  content: string;
  created_by: string | null;
  created_at: string | null;
};

type Interaction = {
  id: string;
  investor_id: string;
  type: string;
  title: string;
  description: string | null;
  created_at: string | null;
};

// ─── Pipeline config ──────────────────────────────────────────────────────────

// ─── Placeholder data ─────────────────────────────────────────────────────────

const STATIC_INTERESTS = ['STEM Infrastructure', 'Quantum Computing', 'Renewable Energy', 'FinTech (SaaS)'];

const INTERACTION_TYPE_ICON: Record<string, string> = {
  call:    'phone',
  meeting: 'groups',
  email:   'mail',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function roleLabel(role: 'head' | 'member'): string {
  return role === 'head' ? 'Head' : 'Member';
}

function getFileType(name: string): { icon: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { icon: 'picture_as_pdf', color: 'text-red-400' };
  if (['mp3', 'wav', 'm4a', 'webm', 'ogg', 'mp4', 'mpeg'].includes(ext)) {
    return { icon: 'graphic_eq', color: 'text-purple-400' };
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { icon: 'table_chart', color: 'text-green-400' };
  if (['docx', 'doc'].includes(ext)) return { icon: 'description', color: 'text-blue-400' };
  return { icon: 'attach_file', color: 'text-outline' };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvestorDetail() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();

  const [investor,      setInvestor]      = useState<InvestorDetail | null>(null);
  const [notes,         setNotes]         = useState<Note[]>([]);
  const [interactions,  setInteractions]  = useState<Interaction[]>([]);
  const [documents,     setDocuments]     = useState<DocumentItem[]>([]);
  const [stages,        setStages]        = useState<InvestorStage[]>(DEFAULT_INVESTOR_STAGES);
  const [loading,       setLoading]       = useState<boolean>(true);
  const [error,         setError]         = useState<string | null>(null);

  // Note form state
  const [newNote,      setNewNote]      = useState<string>('');
  const [saving,       setSaving]       = useState<boolean>(false);
  const [showNoteForm, setShowNoteForm] = useState<boolean>(false);

  // Interaction form state
  const [showIntForm,  setShowIntForm]  = useState<boolean>(false);
  const [intType,      setIntType]      = useState<string>('call');
  const [intTitle,     setIntTitle]     = useState<string>('');
  const [intDesc,      setIntDesc]      = useState<string>('');
  const [savingInt,    setSavingInt]    = useState<boolean>(false);

  const refreshNotes = async () => {
    if (!id) return;
    const res = await apiClient.get<Note[]>(`/api/investors/${id}/notes`);
    setNotes(res.data);
  };

  const refreshInteractions = async () => {
    if (!id) return;
    const res = await apiClient.get<Interaction[]>(`/api/interactions?investor_id=${id}`);
    setInteractions(res.data);
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [investorRes, notesRes, interactionsRes, documentsRes, stageData] = await Promise.all([
          apiClient.get<InvestorDetail>(`/api/investors/${id}`),
          apiClient.get<Note[]>(`/api/investors/${id}/notes`),
          apiClient.get<Interaction[]>(`/api/interactions?investor_id=${id}`),
          getDocuments(),
          getInvestorStages(),
        ]);
        setInvestor(investorRes.data);
        setNotes(notesRes.data);
        setInteractions(interactionsRes.data);
        setDocuments(documentsRes.filter((doc) => doc.investor_id === id));
        setStages(sortStages(stageData));
      } catch {
        setError('Failed to load investor profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleAddNote = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newNote.trim() || !id) return;
    setSaving(true);
    try {
      await apiClient.post('/api/notes', { investor_id: id, content: newNote.trim() });
      setNewNote('');
      setShowNoteForm(false);
      await refreshNotes();
    } catch {
      // keep form open so user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleAddInteraction = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!intTitle.trim() || !id) return;
    setSavingInt(true);
    try {
      await apiClient.post('/api/interactions', {
        investor_id: id,
        type: intType,
        title: intTitle.trim(),
        description: intDesc.trim(),
      });
      setIntTitle('');
      setIntDesc('');
      setIntType('call');
      setShowIntForm(false);
      await refreshInteractions();
    } catch {
      // keep form open so user can retry
    } finally {
      setSavingInt(false);
    }
  };

  // ── States ────────────────────────────────────────────────────────────────

  const handleOpenDocument = async (documentId: string) => {
    try {
      const url = await getDocumentBlobUrl(documentId);
      window.open(url, '_blank');
    } catch {
      window.open(`http://localhost:8000/api/documents/${documentId}/download`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-on-surface-variant">Loading investor profile…</p>
      </div>
    );
  }

  if (error || !investor) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-500">{error ?? 'Investor not found.'}</p>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const safeStage  = getStageKey(stages, investor.stage);
  const currentIdx = Math.max(0, stages.findIndex((stage) => stage.key === safeStage));
  const interests   = investor.interests && investor.interests.length > 0
    ? investor.interests
    : STATIC_INTERESTS;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button
          className="text-[12px] text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
          onClick={() => navigate('/investors')}
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to Pipeline
        </button>
        <span className="text-[12px] text-outline opacity-40">/</span>
        <span className="text-[12px] text-on-surface-variant">Investor Pipeline</span>
        <span className="text-[12px] text-outline opacity-40">/</span>
        <span className="text-[12px] text-primary">{investor.name}</span>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div className="flex items-center gap-6 flex-1">
          <div className="w-[100px] h-[100px] rounded-[10px] bg-surface-container-highest flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/30">
            <span className="text-3xl font-bold text-on-surface-variant select-none">
              {getInitials(investor.name)}
            </span>
          </div>
          <div className="flex-1">
            <h1 className="text-[22px] font-bold text-on-surface leading-tight">{investor.name}</h1>
            <p className="text-base text-on-surface-variant font-medium">{investor.organization ?? '—'}</p>
            <div className="mt-2 pl-4 border-l-2 border-primary italic text-xs text-on-surface-variant leading-relaxed">
              "Investor relationship in active development."
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            className="px-5 py-2 bg-primary-container text-on-primary-container text-xs font-semibold rounded-sm hover:brightness-110 transition-all flex items-center gap-2"
            onClick={() => setShowIntForm((prev) => !prev)}
          >
            <span className="material-symbols-outlined text-[16px]">add_comment</span>
            Log Interaction
          </button>
          <button
            className="px-5 py-2 ghost-border text-on-surface text-xs font-semibold rounded-sm hover:bg-surface-container-high transition-all"
            onClick={() => navigate(`/investor/${id}/edit`)}
          >
            Edit Profile
          </button>
        </div>
      </div>

      {/* ── Deal Stage Pipeline ───────────────────────────────────────────────── */}
      <div className="bg-surface-container rounded-lg p-6 mb-8">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Deal Stage</h3>
          <div className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-medium">Active Lead</div>
        </div>
        <div className="grid grid-cols-10 items-start px-2">
          {stages.map((stage, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            const upcoming = idx > currentIdx;
            return (
              <div key={stage.key} className="relative flex min-w-0 flex-col items-center gap-3">
                {idx < stages.length - 1 && (
                  <div
                    className={[
                      'absolute left-1/2 top-3 h-[2px] w-full translate-x-3 transition-colors',
                      idx < currentIdx ? 'bg-primary' : 'bg-outline-variant/35',
                    ].join(' ')}
                  />
                )}
                {done && (
                  <div className="relative z-10 w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/25">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#111318]"></div>
                  </div>
                )}
                {active && (
                  <div className="relative z-10 w-7 h-7 -mt-0.5 rounded-full border-2 border-primary bg-background flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(230,196,135,0.5)]">
                    <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></div>
                  </div>
                )}
                {upcoming && (
                  <div className="relative z-10 w-6 h-6 rounded-full border border-outline-variant/45 bg-surface-container-highest flex items-center justify-center shrink-0"></div>
                )}
                <span className={[
                  'max-w-[86px] text-center text-[10px] uppercase leading-tight',
                  active           ? 'font-semibold text-primary'          : '',
                  done             ? 'font-medium text-on-surface-variant' : '',
                  !done && !active ? 'font-medium text-outline'            : '',
                ].join(' ')}>
                  {stage.short_label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2-Column Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_265px] gap-6 items-start">

        {/* Left Column */}
        <div className="flex flex-col gap-6">

          {/* Sector Interests */}
          <div className="bg-surface-container rounded-lg p-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-4 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-tertiary shrink-0"></div>
              Sector Interests
            </h4>
            <div className="flex flex-wrap gap-2">
              {interests.map((tag) => (
                <span
                  key={tag}
                  className="bg-surface-container-high px-3 py-1.5 rounded-sm text-[11px] font-medium text-on-surface hover:text-primary transition-colors cursor-default"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Interaction Timeline — REAL DATA */}
          <div className="bg-surface-container rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Interaction Timeline
              </h4>
              <button
                className="text-outline hover:text-primary transition-colors"
                onClick={() => setShowIntForm((prev) => !prev)}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {showIntForm ? 'close' : 'add'}
                </span>
              </button>
            </div>

            {/* Log Interaction Form */}
            {showIntForm && (
              <form onSubmit={handleAddInteraction} className="mb-6 flex flex-col gap-3 p-4 bg-surface-container-low rounded-lg border border-outline-variant/20">
                <h5 className="text-[10px] font-semibold uppercase tracking-widest text-outline mb-1">New Interaction</h5>

                {/* Type select */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-on-surface-variant uppercase tracking-wider">Type</label>
                  <select
                    value={intType}
                    onChange={(e) => setIntType(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-sm text-[11px] text-on-surface px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="call">Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="email">Email</option>
                  </select>
                </div>

                {/* Title input */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-on-surface-variant uppercase tracking-wider">Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Q2 follow-up call"
                    value={intTitle}
                    onChange={(e) => setIntTitle(e.target.value)}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-sm text-[11px] text-on-surface px-2 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline/50"
                  />
                </div>

                {/* Description textarea */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-on-surface-variant uppercase tracking-wider">Description</label>
                  <textarea
                    placeholder="Brief summary of what was discussed…"
                    value={intDesc}
                    onChange={(e) => setIntDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-surface-container border border-outline-variant/30 rounded-sm text-[11px] text-on-surface px-2 py-1.5 resize-none focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline/50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingInt || !intTitle.trim()}
                  className="w-full py-1.5 bg-primary-container text-on-primary-container text-[11px] font-semibold rounded-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingInt ? 'Saving…' : 'Save Interaction'}
                </button>
              </form>
            )}

            {/* Timeline list */}
            {interactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <span className="material-symbols-outlined text-[28px] text-outline opacity-40">timeline</span>
                <p className="text-[11px] text-outline">No interactions logged yet.</p>
                <button
                  className="text-[11px] text-primary hover:underline mt-1"
                  onClick={() => setShowIntForm(true)}
                >
                  Log the first interaction
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-8 relative pl-6">
                <div className="absolute left-[31px] top-2 bottom-2 w-px bg-outline-variant opacity-20"></div>
                {interactions.map((item, idx) => {
                  const iconName = INTERACTION_TYPE_ICON[item.type] ?? 'chat';
                  return (
                    <div key={item.id} className="relative flex gap-4">
                      <div className={[
                        'absolute -left-[14px] w-[14px] h-[14px] rounded-full border-4 border-surface-container z-10',
                        idx === 0 ? 'bg-primary' : 'bg-outline-variant',
                      ].join(' ')}></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[12px] text-outline">{iconName}</span>
                            <span className="text-[11px] font-semibold text-on-surface">{item.title}</span>
                          </div>
                          <span className="text-[10px] text-outline shrink-0 ml-2">{formatDate(item.created_at)}</span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-on-surface-variant mt-1">{item.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column */}
        <aside className="flex flex-col gap-6 w-full">

          {/* Internal Relations — PLACEHOLDER */}
          <div className="bg-surface-container rounded-lg p-5">
            <h4 className="text-[10px] font-semibold uppercase tracking-widest text-outline mb-4">
              Internal Relations
            </h4>
            <div className="flex flex-col gap-3">
              {investor.primary_owner ? (
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-tertiary-container text-on-tertiary-container text-[10px] font-bold flex items-center justify-center shrink-0">
                    {getInitials(investor.primary_owner.name)}
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-on-surface">{investor.primary_owner.name}</div>
                    <div className="text-[9px] text-on-surface-variant leading-none">
                      Primary Relationship Manager - {roleLabel(investor.primary_owner.role)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-outline">No assigned user.</p>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-surface-container rounded-lg p-5">
            <h4 className="text-[10px] font-semibold uppercase tracking-widest text-outline mb-4">Documents</h4>
            <div className="flex flex-col gap-2">
              {documents.length === 0 ? (
                <p className="text-[11px] text-outline text-center py-2">No linked documents.</p>
              ) : (
                documents.map((doc) => {
                  const fileType = getFileType(doc.name);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleOpenDocument(doc.id)}
                      className="flex items-center justify-between p-2 bg-surface-container-low rounded group cursor-pointer hover:bg-surface-container-high transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`material-symbols-outlined text-[18px] ${fileType.color}`}>{fileType.icon}</span>
                        <span className="text-[11px] text-on-surface-variant group-hover:text-on-surface truncate">
                          {doc.name}
                        </span>
                      </div>
                      <span className="material-symbols-outlined text-[16px] text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                        open_in_new
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Team Notes — REAL DATA */}
          <div className="bg-surface-container rounded-lg p-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-outline">Team Notes</h4>
              <button
                className="text-outline hover:text-primary transition-colors"
                onClick={() => setShowNoteForm((prev) => !prev)}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {showNoteForm ? 'close' : 'add'}
                </span>
              </button>
            </div>

            {/* Add Note Form — REAL */}
            {showNoteForm && (
              <form onSubmit={handleAddNote} className="mb-4 flex flex-col gap-2">
                <textarea
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm text-[11px] text-on-surface p-2 resize-none focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-outline/50"
                  rows={3}
                  placeholder="Add a team note…"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={saving || !newNote.trim()}
                  className="w-full py-1.5 bg-primary-container text-on-primary-container text-[11px] font-semibold rounded-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </form>
            )}

            {/* Notes list */}
            <div className="flex flex-col gap-4">
              {notes.length === 0 ? (
                <p className="text-[11px] text-outline text-center py-2">No notes yet.</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="p-3 bg-surface-container-lowest rounded-sm">
                    <div className="text-[10px] font-semibold text-on-surface mb-1">
                      {formatDate(note.created_at)}
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-snug">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Generate AI Briefing — PLACEHOLDER */}
          <button className="w-full py-3 border border-dashed border-primary/30 rounded-lg text-primary text-xs font-semibold flex items-center justify-center gap-2 hover:bg-primary/5 transition-all">
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
            Generate AI Briefing
          </button>

        </aside>
      </div>
    </div>
  );
}
