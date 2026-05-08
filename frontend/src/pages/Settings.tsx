import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, type CurrentUser } from '../api/auth';

function roleLabel(role: CurrentUser['role']): string {
  return role === 'head' ? 'Head' : 'Member';
}

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setError('Could not load profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeChatId');
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden">
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
          <a
            className="flex items-center gap-3 px-3 py-2 text-sm text-[#94a3b8] hover:text-[#e2e2e9] hover:bg-[#111318]/50 transition-all rounded-md cursor-pointer"
            onClick={() => navigate('/ai')}
          >
            <span className="material-symbols-outlined text-xl">smart_toy</span>
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
          <a className="flex items-center gap-3 px-3 py-2 text-sm text-[#e6c487] font-medium bg-[#111318]/50 rounded-md">
            <span
              className="material-symbols-outlined text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              settings
            </span>
            <span className="font-medium tracking-tight">Settings</span>
          </a>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant/10">
          <h2 className="text-xl font-semibold text-on-surface">Settings</h2>
          <p className="text-sm text-on-surface-variant mt-1">Manage your profile and session.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <section className="max-w-2xl bg-surface-container border border-outline-variant/20 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/10">
              <h3 className="text-sm font-semibold text-on-surface">Profile</h3>
            </div>

            {loading && (
              <div className="px-5 py-8 text-sm text-on-surface-variant">Loading profile...</div>
            )}

            {!loading && error && (
              <div className="px-5 py-8 text-sm text-error">{error}</div>
            )}

            {!loading && user && (
              <div className="p-5">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-12 w-12 rounded bg-primary-container text-on-primary-container flex items-center justify-center text-lg font-bold">
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-on-surface truncate">{user.name}</p>
                    <p className="text-sm text-on-surface-variant truncate">{user.email}</p>
                  </div>
                </div>

                <dl className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-[#1e2025] rounded-md px-4 py-3">
                    <dt className="text-[10px] uppercase tracking-wider text-outline mb-1">Role</dt>
                    <dd className="text-sm font-semibold text-on-surface">{roleLabel(user.role)}</dd>
                  </div>
                  <div className="bg-[#1e2025] rounded-md px-4 py-3">
                    <dt className="text-[10px] uppercase tracking-wider text-outline mb-1">User ID</dt>
                    <dd className="text-xs text-on-surface-variant truncate">{user.id}</dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        </div>

        <div className="p-6 border-t border-outline-variant/10">
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Logout
          </button>
        </div>
      </main>
    </div>
  );
}
