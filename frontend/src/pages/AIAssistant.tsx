import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendMessage } from '../api/chat';
import {
  getChats, getChat, createChat, sendChatMessage,
  type ChatSummary,
} from '../api/chats';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chatTitle(chat: ChatSummary): string {
  return chat.title ?? 'New chat';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const navigate = useNavigate();

  const [chats,        setChats]        = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef  = useRef<HTMLTextAreaElement | null>(null);

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
    getChat(activeChatId)
      .then((res) => setMessages(res.data.messages))
      .catch((err) => console.error('Failed to load messages:', err));
  }, [activeChatId]);

  // ── Focus textarea on chat switch ─────────────────────────────────────────

  useEffect(() => {
    if (activeChatId) textareaRef.current?.focus();
  }, [activeChatId]);

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
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (loading || !input.trim() || !activeChatId) return;

    const userInput = input.trim();
    const chatId    = activeChatId;

    // Clear input immediately
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Lock before any async work to prevent double-send
    setLoading(true);

    // Optimistic: show user message + "Thinking…" placeholder immediately
    setMessages((prev) => [
      ...prev,
      { role: 'user'      as const, content: userInput },
      { role: 'assistant' as const, content: '…',       id: '__thinking__' },
    ]);

    // Store AI sources so we can attach them after the backend sync
    let aiSources: string[] = [];

    try {
      // 1. Persist user message
      await sendChatMessage(chatId, { role: 'user', content: userInput });

      // 2. Call AI
      const aiRes = await sendMessage({ query: userInput, document_ids: [] });
      aiSources = aiRes.sources ?? [];

      // 3. Persist assistant message
      await sendChatMessage(chatId, { role: 'assistant', content: aiRes.answer });

      // 4. Sync messages from backend (source of truth), then attach sources
      const chatRes = await getChat(chatId);
      const synced  = chatRes.data.messages as Message[];

      // Reattach sources to the last assistant message (not stored in DB)
      if (aiSources.length > 0 && synced.length > 0) {
        const last = synced[synced.length - 1];
        if (last.role === 'assistant') last.sources = aiSources;
      }

      setMessages(synced);

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
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] transition-all rounded-md"
            href="#"
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
                  className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.id === '__thinking__'
                      ? 'bg-surface-container text-on-surface-variant italic'
                      : msg.role === 'user'
                        ? 'bg-primary/20 text-on-surface'
                        : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {msg.id === '__thinking__' ? 'Thinking…' : msg.content}
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
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                disabled={loading}
                placeholder="Ask about your documents… (Enter to send)"
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
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="shrink-0 bg-primary text-[#111318] px-4 py-2.5 rounded-lg text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Chat History Panel ────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-[#1f2128] border-l border-outline-variant/10 overflow-hidden">

          {/* New Chat button */}
          <div className="px-3 py-3 border-b border-outline-variant/10 shrink-0">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary/10 text-primary text-[12px] font-semibold hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Chat
            </button>
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto py-1 no-scrollbar">
            {chats.map((chat) => {
              const active = chat.id === activeChatId;
              return (
                <button
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    active
                      ? 'bg-[#111318]/60 text-on-surface'
                      : 'text-on-surface-variant hover:bg-[#111318]/40 hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] shrink-0 opacity-50">
                      chat_bubble
                    </span>
                    <span className="text-[12px] leading-snug truncate">
                      {chatTitle(chat)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

        </aside>

      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1f2128] h-16 flex items-center justify-around px-2 border-t border-outline-variant/10 z-50">
        <a className="flex flex-col items-center gap-1 text-[#94a3b8]" href="#">
          <span className="material-symbols-outlined">dashboard</span>
          <span className="text-[10px]">Dashboard</span>
        </a>
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
