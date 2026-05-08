import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { transcribeSpeech } from '../api/audio';
import { streamMessage } from '../api/chat';
import {
  getChats, getChat, createChat, sendChatMessage, uploadChatDocument, deleteChat,
  type ChatDocumentAttachment,
  type ChatSummary,
} from '../api/chats';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
};

type AIMode = 'general' | 'proposal' | 'research' | 'infer';
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'webm', 'ogg', 'mp4', 'mpeg'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chatTitle(chat: ChatSummary): string {
  return chat.title ?? 'New chat';
}

function isAudioFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext);
}

function attachmentIcon(name: string): { icon: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.includes(ext)) return { icon: 'graphic_eq', color: 'text-purple-400' };
  return { icon: 'picture_as_pdf', color: 'text-red-400' };
}

function parseSlashMode(value: string): { mode: AIMode; query: string; display: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^\/(research|infer|proposal)(\s+|$)/i);
  if (!match) return { mode: 'general', query: trimmed, display: trimmed };

  const mode = match[1].toLowerCase() as AIMode;
  const query = trimmed.slice(match[0].length).trim();
  return {
    mode,
    query,
    display: query ? `/${mode} ${query}` : `/${mode}`,
  };
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="max-w-none text-sm leading-7 text-on-surface">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-3 text-[15px] font-semibold">{children}</h3>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-black/25 px-1 py-0.5 text-[12px] text-primary-fixed">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const navigate = useNavigate();

  const [chats,        setChats]        = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [attachedDocs, setAttachedDocs] = useState<ChatDocumentAttachment[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef  = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  // ── On mount: load chats, restore last active chat if possible ───────────

  useEffect(() => {
    (async () => {
      try {
        const res  = await getChats();
        const list: ChatSummary[] = res.data;

        if (list.length > 0) {
          setChats(list);
          const savedId = localStorage.getItem('activeChatId');
          const exists  = savedId && list.some((c) => c.id === savedId);
          setActiveChatId(exists ? savedId : list[0].id);
        } else {
          const created = await createChat();
          setChats([created.data]);
          setActiveChatId(created.data.id);
        }
      } catch (err) {
        console.error('Failed to load chats:', err);
      }
    })();
  }, []);

  // ── Persist active chat id across reloads ─────────────────────────────────

  useEffect(() => {
    if (activeChatId) localStorage.setItem('activeChatId', activeChatId);
  }, [activeChatId]);

  // ── Load messages when active chat changes ────────────────────────────────

  useEffect(() => {
    if (!activeChatId) return;
    setAttachedDocs([]);
    setUploadError(null);
    setVoiceError(null);
    getChat(activeChatId)
      .then((res) => {
        setMessages(res.data.messages);
        setAttachedDocs(res.data.documents ?? []);
      })
      .catch((err) => console.error('Failed to load messages:', err));
  }, [activeChatId]);

  // ── Focus textarea on chat switch ─────────────────────────────────────────

  useEffect(() => {
    if (activeChatId) textareaRef.current?.focus();
  }, [activeChatId]);

  useEffect(() => {
    return () => stopVoiceTracks();
  }, []);

  // ── Smart auto-scroll ─────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── New chat ──────────────────────────────────────────────────────────────

  const handleNewChat = async () => {
    if (messages.length === 0) return; // don't create if current chat is empty
    try {
      const res = await createChat();
      setChats((prev) => [res.data, ...prev]);
      setActiveChatId(res.data.id);
      setMessages([]);
      setInput('');
      setAttachedDocs([]);
      setUploadError(null);
      setVoiceError(null);
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (deletingChatId || loading) return;
    setDeletingChatId(chatId);
    try {
      await deleteChat(chatId);
      const remaining = chats.filter((chat) => chat.id !== chatId);

      if (remaining.length > 0) {
        setChats(remaining);
        if (activeChatId === chatId) {
          setActiveChatId(remaining[0].id);
        }
      } else {
        const created = await createChat();
        setChats([created.data]);
        setActiveChatId(created.data.id);
        setMessages([]);
        setAttachedDocs([]);
        setUploadError(null);
        setVoiceError(null);
        localStorage.setItem('activeChatId', created.data.id);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    } finally {
      setDeletingChatId(null);
    }
  };

  const handleAttachDocument = async (file: File) => {
    if (!activeChatId || uploadingDoc) return;
    if (file.type !== 'application/pdf' && !isAudioFile(file)) {
      setUploadError('Only PDF files and audio recordings are supported.');
      return;
    }

    setUploadingDoc(true);
    setUploadError(null);
    try {
      const res = await uploadChatDocument(activeChatId, file);
      setAttachedDocs((prev) => [res.data, ...prev]);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(detail ?? 'Could not attach document.');
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      textareaRef.current?.focus();
    }
  };

  const stopVoiceTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (recordingVoice || transcribingVoice) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone recording is not supported in this browser.');
      return;
    }

    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(voiceChunksRef.current, { type: mimeType });
        stopVoiceTracks();
        setRecordingVoice(false);

        if (blob.size === 0) {
          setVoiceError('No voice audio was recorded.');
          return;
        }

        setTranscribingVoice(true);
        try {
          const file = new File([blob], 'voice-message.webm', { type: mimeType });
          const result = await transcribeSpeech(file);
          setInput((prev) => {
            const prefix = prev.trim() ? `${prev.trim()} ` : '';
            return `${prefix}${result.transcript}`.trim();
          });
          requestAnimationFrame(() => textareaRef.current?.focus());
        } catch (err: unknown) {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setVoiceError(detail ?? 'Could not transcribe voice input.');
        } finally {
          setTranscribingVoice(false);
        }
      };

      recorder.start();
      setRecordingVoice(true);
    } catch {
      stopVoiceTracks();
      setRecordingVoice(false);
      setVoiceError('Microphone permission was blocked or unavailable.');
    }
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleVoiceButton = () => {
    if (recordingVoice) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (loading || transcribingVoice || !input.trim() || !activeChatId) return;

    const parsed = parseSlashMode(input);
    if (!parsed.query) return;

    const userInput = parsed.query;
    const displayInput = parsed.display;
    const chatId    = activeChatId;

    // Clear input immediately
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Lock before any async work to prevent double-send
    setLoading(true);

    // Optimistic: show user message + "Thinking…" placeholder immediately
    setMessages((prev) => [
      ...prev,
      { role: 'user'      as const, content: displayInput },
      { role: 'assistant' as const, content: '…',       id: '__thinking__' },
    ]);

    let aiSources: string[] = [];
    let streamedAnswer = '';

    try {
      // 1. Persist user message
      await sendChatMessage(chatId, { role: 'user', content: displayInput });

      // 2. Stream AI answer into the placeholder bubble
      await streamMessage(
        {
          query: userInput,
          document_ids: attachedDocs.map((doc) => doc.id),
          mode: parsed.mode,
          chat_id: chatId,
        },
        {
          onSources: (sources) => {
            aiSources = sources;
          },
          onDelta: (text) => {
            streamedAnswer += text;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === '__thinking__'
                  ? { ...msg, content: streamedAnswer }
                  : msg
              )
            );
          },
        },
      );

      // 3. Persist assistant message
      await sendChatMessage(chatId, { role: 'assistant', content: streamedAnswer });

      // 4. Sync messages from backend (source of truth), then attach sources
      const chatRes = await getChat(chatId);
      const synced  = chatRes.data.messages as Message[];

      // Reattach sources to the last assistant message (not stored in DB)
      if (aiSources.length > 0 && synced.length > 0) {
        const last = synced[synced.length - 1];
        if (last.role === 'assistant') last.sources = aiSources;
      }

      setMessages(synced);
      setAttachedDocs(chatRes.data.documents ?? []);

      // 5. Refresh chat list so backend-set title is reflected in sidebar
      const chatsRes = await getChats();
      setChats(chatsRes.data);

    } catch (err: unknown) {
      const detail   = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const errorMsg = detail ?? (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

      // Replace the "Thinking…" placeholder with the real error
      setMessages((prev) =>
        prev.filter((m) => m.id !== '__thinking__').concat({ role: 'assistant' as const, content: errorMsg })
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md cursor-pointer"
            onClick={() => navigate('/investors')}
          >
            <span className="material-symbols-outlined text-xl">account_balance</span>
            <span className="font-medium tracking-tight">Investor Profile</span>
          </a>
          {/* Active */}
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#e6c487] font-medium bg-[#111318]/50 rounded-md"
            href="#"
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              smart_toy
            </span>
            <span className="font-medium tracking-tight">AI Assistant</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md cursor-pointer"
            onClick={() => navigate('/documents')}
          >
            <span className="material-symbols-outlined text-xl">folder_shared</span>
            <span className="font-medium tracking-tight">Documents</span>
          </a>
        </nav>

        <div className="mt-auto pt-6 space-y-4">
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] transition-all rounded-md cursor-pointer"
            onClick={() => navigate('/settings')}
          >
            <span className="material-symbols-outlined text-xl">settings</span>
            <span className="font-medium tracking-tight">Settings</span>
          </a>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 overflow-hidden">

        {/* ── Active Chat ───────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 bg-background">

          {/* Header */}
          <div className="px-5 py-3.5 border-b border-outline-variant/10 shrink-0">
            <h2 className="text-[15px] font-semibold text-on-surface">AI Assistant</h2>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Ask questions about your investor documents
            </p>
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-3 no-scrollbar"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center select-none">
                <span
                  className="material-symbols-outlined text-[36px] text-outline opacity-20"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  smart_toy
                </span>
                <p className="text-base text-on-surface-variant">
                  Ask anything about your documents.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={msg.id ?? i}
                className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.id === '__thinking__'
                      ? 'bg-surface-container text-on-surface-variant'
                      : msg.role === 'user'
                        ? 'bg-primary/20 text-on-surface whitespace-pre-wrap'
                        : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {msg.role === 'assistant'
                    ? msg.content
                      ? <AssistantMarkdown content={msg.content} />
                      : <span className="italic text-on-surface-variant">Thinking...</span>
                    : msg.content
                  }
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {msg.sources.map((src) => (
                      <span
                        key={src}
                        className="text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20"
                      >
                        {src}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* "Thinking…" is rendered as a regular message with id="__thinking__" */}
          </div>

          {/* Input bar */}
          <div className="p-3 border-t border-outline-variant/10 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf,audio/*,.mp3,.wav,.m4a,.webm,.ogg,.mp4"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAttachDocument(file);
              }}
            />
            {(attachedDocs.length > 0 || uploadError || voiceError) && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {attachedDocs.map((doc) => (
                  <span
                    key={doc.id}
                    title={doc.name}
                    className="inline-flex max-w-[220px] items-center gap-1 rounded border border-outline-variant/20 bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${attachmentIcon(doc.name).color}`}>
                      {attachmentIcon(doc.name).icon}
                    </span>
                    <span className="truncate">{doc.name}</span>
                  </span>
                ))}
                {uploadError && <span className="text-[11px] text-error">{uploadError}</span>}
                {voiceError && <span className="text-[11px] text-error">{voiceError}</span>}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || uploadingDoc || !activeChatId}
                title="Attach file"
                className="shrink-0 h-[42px] w-[42px] inline-flex items-center justify-center bg-[#1e2025] border border-outline-variant/20 rounded-lg text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-outlined text-[21px] ${uploadingDoc ? 'animate-spin' : ''}`}>
                  {uploadingDoc ? 'progress_activity' : 'attach_file'}
                </span>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                disabled={loading || uploadingDoc || transcribingVoice}
                placeholder="Ask anything, or use /research, /infer, /proposal..."
                className="flex-1 resize-none overflow-hidden bg-[#1e2025] border border-outline-variant/20 rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50 leading-relaxed"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                onInput={(e) => {
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                }}
              />
              <button
                type="button"
                onClick={handleVoiceButton}
                disabled={loading || uploadingDoc || transcribingVoice || !activeChatId}
                title={recordingVoice ? 'Stop recording' : 'Speech to text'}
                className={`shrink-0 h-[42px] w-[42px] inline-flex items-center justify-center border rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  recordingVoice
                    ? 'bg-red-500/15 border-red-400/50 text-red-300'
                    : 'bg-[#1e2025] border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/50'
                }`}
              >
                <span className={`material-symbols-outlined text-[21px] ${transcribingVoice ? 'animate-spin' : ''}`}>
                  {transcribingVoice ? 'progress_activity' : recordingVoice ? 'stop_circle' : 'mic'}
                </span>
              </button>
              <button
                onClick={handleSend}
                disabled={loading || uploadingDoc || transcribingVoice || !input.trim()}
                className="shrink-0 bg-primary text-[#111318] px-4 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Chat History Panel ────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-[#1f2128] border-l border-outline-variant/10 overflow-hidden">

          {/* Chat documents */}
          <div className="px-3 py-3 border-b border-outline-variant/10 shrink-0">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Documents
              </h3>
              <span className="text-[10px] text-outline">{attachedDocs.length}</span>
            </div>
            {attachedDocs.length === 0 ? (
              <div className="rounded-md border border-outline-variant/10 bg-[#111318]/40 px-3 py-3 text-[11px] leading-relaxed text-outline">
                No documents attached to this chat.
              </div>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 no-scrollbar">
                {attachedDocs.map((doc) => {
                  const icon = attachmentIcon(doc.name);
                  return (
                  <div
                    key={doc.id}
                    title={doc.name}
                    className="rounded-md border border-outline-variant/10 bg-[#111318]/40 px-2.5 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`material-symbols-outlined mt-0.5 text-[15px] ${icon.color} shrink-0`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {icon.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-on-surface">
                          {doc.name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-outline">
                          {doc.chunk_count} chunk{doc.chunk_count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto py-1 no-scrollbar">
            {chats.map((chat) => {
              const active = chat.id === activeChatId;
              const isDeleting = deletingChatId === chat.id;
              return (
                <div
                  key={chat.id}
                  className={`group flex items-center gap-1 px-2 py-1.5 transition-colors ${
                    active
                      ? 'bg-[#111318]/60 text-on-surface'
                      : 'text-on-surface-variant hover:bg-[#111318]/40 hover:text-on-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveChatId(chat.id)}
                    className="min-w-0 flex-1 text-left"
                    disabled={isDeleting}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] shrink-0 opacity-50">
                        chat_bubble
                      </span>
                      <span className="block truncate text-[12px] leading-snug">
                        {chatTitle(chat)}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChat(chat.id)}
                    disabled={isDeleting || loading}
                    title="Delete chat"
                    className="shrink-0 rounded p-1 text-outline opacity-0 transition-all hover:bg-red-900/20 hover:text-red-400 disabled:opacity-40 group-hover:opacity-100"
                  >
                    <span className="material-symbols-outlined text-[14px] shrink-0 opacity-50">
                      {isDeleting ? 'hourglass_empty' : 'delete'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* New Chat button */}
          <div className="px-3 py-3 border-t border-outline-variant/10 shrink-0">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary/10 text-primary text-[12px] font-semibold hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Chat
            </button>
          </div>

        </aside>

      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1f2128] h-16 flex items-center justify-around px-2 border-t border-outline-variant/10 z-50">
        <a
          className="flex flex-col items-center gap-1 text-[#94a3b8] cursor-pointer"
          onClick={() => navigate('/investors')}
        >
          <span className="material-symbols-outlined">account_balance</span>
          <span className="text-[10px]">Investors</span>
        </a>
        <a className="flex flex-col items-center gap-1 text-[#e6c487]" href="#">
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            smart_toy
          </span>
          <span className="text-[10px]">AI</span>
        </a>
        <a
          className="flex flex-col items-center gap-1 text-[#94a3b8] cursor-pointer"
          onClick={() => navigate('/documents')}
        >
          <span className="material-symbols-outlined">folder_shared</span>
          <span className="text-[10px]">Docs</span>
        </a>
      </nav>

    </div>
  );
}
