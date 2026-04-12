import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      localStorage.setItem('token', data.access_token);
      navigate('/investors');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-on-background selection:bg-primary selection:text-on-primary">
      <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-lg shadow-2xl p-8 md:p-12 p-6 md:p-8">

        {/* Logo + Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded bg-primary-container mb-4 border border-white/20 shadow-inner">
            <span className="text-on-primary-container font-black text-2xl tracking-tighter">GP</span>
          </div>
          <h1 className="text-4xl font-bold text-on-surface tracking-tight mb-2">Grant Pilot</h1>
        </div>

        {/* Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>

          {/* Email */}
          <div className="space-y-2">
            <label
              className="block text-xs font-bold uppercase tracking-widest text-outline"
              htmlFor="email"
            >
              Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">
                mail
              </span>
              <input
                className="w-full bg-surface-container-highest border-none rounded focus:ring-1 focus:ring-primary text-on-surface py-3 pl-10 pr-4 placeholder:text-outline/50"
                id="email"
                name="email"
                placeholder="admin@grantpilot.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label
                className="block text-xs font-bold uppercase tracking-widest text-outline"
                htmlFor="password"
              >
                Password
              </label>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg">
                lock
              </span>
              <input
                className="w-full bg-surface-container-highest border-none rounded focus:ring-1 focus:ring-primary text-on-surface py-3 pl-10 pr-4 placeholder:text-outline/50"
                id="password"
                name="password"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Forgot password */}
          <div className="flex justify-end">
            <a className="text-xs text-primary hover:underline font-medium" href="#">
              Forgot password?
            </a>
          </div>

          {/* Error message */}
          {error && (
            <div className="text-error text-sm text-center bg-error-container/20 rounded py-2 px-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            className="w-full bg-primary-container hover:bg-primary text-on-primary-container font-bold py-4 rounded transition-all duration-200 active:scale-[0.98] shadow-lg shadow-primary/10 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </button>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/30 pt-8 mt-8">
          <p className="text-xs text-outline font-medium">© 2024 Grant Pilot CRM</p>
          <div className="flex gap-4">
            <span className="material-symbols-outlined text-outline text-lg cursor-pointer hover:text-primary">
              help
            </span>
            <span className="material-symbols-outlined text-outline text-lg cursor-pointer hover:text-primary">
              language
            </span>
          </div>
        </div>

      </div>
    </main>
  );
}
