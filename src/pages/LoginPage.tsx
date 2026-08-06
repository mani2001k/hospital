import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Eye, EyeOff, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  const validate = () => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) {
      setError(signInError === 'Invalid login credentials' ? 'Invalid email or password' : signInError);
      return;
    }
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-12 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.08),transparent_50%)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 ring-1 ring-sky-500/30">
            <Activity className="text-sky-400" size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Predictive Operations</p>
            <p className="text-xs text-slate-400">Command Center</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight text-slate-100">
            Anticipate disruption before service levels decline.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            AI-powered demand forecasting, anomaly detection, and risk scoring for your hospital
            network — with human approval for every material action.
          </p>
          <div className="mt-8 flex items-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-sky-400" />
              <span>Role-based access</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-sky-400" />
              <span>Real-time queues</span>
            </div>
          </div>
        </div>
        <p className="relative text-xs text-slate-600">
          © {new Date().getFullYear()} Hospital Network. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 ring-1 ring-sky-500/30">
              <Activity className="text-sky-400" size={22} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Predictive Operations</p>
              <p className="text-xs text-slate-400">Command Center</p>
            </div>
          </div>

          {!showForgot ? (
            <>
              <h2 className="text-xl font-semibold text-slate-100">Sign in to your account</h2>
              <p className="mt-1 text-sm text-slate-400">Enter your credentials to access the command center.</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@hospital.io"
                      autoComplete="email"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/30"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">
                    <AlertCircle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
                <p className="mb-2 text-xs font-medium text-slate-400">Demo accounts (password: HospCmd2026!)</p>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>admin@hospital.io — Operations Admin</p>
                  <p>manager@hospital.io — Manager</p>
                  <p>analyst@hospital.io — Analyst</p>
                  <p>staff@hospital.io — Field Staff</p>
                </div>
              </div>
            </>
          ) : (
            <ForgotPassword onBack={() => setShowForgot(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <>
      <h2 className="text-xl font-semibold text-slate-100">Reset your password</h2>
      <p className="mt-1 text-sm text-slate-400">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      {sent ? (
        <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          If an account exists for {email}, a reset link has been sent.
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email) setSent(true);
          }}
          className="mt-6 space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hospital.io"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
            />
          </div>
          <Button type="submit" className="w-full" size="lg">Send reset link</Button>
        </form>
      )}
      <button onClick={onBack} className="mt-4 text-xs text-sky-400 hover:text-sky-300">
        Back to sign in
      </button>
    </>
  );
}
