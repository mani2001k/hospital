import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ size = 24, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
      <Loader2 className="animate-spin" size={size} />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-600">/</span>}
              <span className={i === breadcrumbs.length - 1 ? 'text-slate-300' : ''}>{bc.label}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 py-16 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <div>
        <p className="font-medium text-slate-300">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'critical';
}) {
  const styles: Record<string, string> = {
    neutral: 'bg-slate-700/50 text-slate-300 ring-slate-600/40',
    success: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
    danger: 'bg-rose-500/10 text-rose-400 ring-rose-500/30',
    critical: 'bg-rose-500/20 text-rose-300 ring-rose-500/40',
    info: 'bg-sky-500/10 text-sky-400 ring-sky-500/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onClick,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-50';
  const variants: Record<string, string> = {
    primary: 'bg-sky-600 text-white hover:bg-sky-500 active:bg-sky-700',
    secondary: 'bg-slate-700/60 text-slate-200 hover:bg-slate-700 ring-1 ring-inset ring-slate-600/50',
    ghost: 'text-slate-300 hover:bg-slate-700/40 hover:text-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Loader2 className="animate-spin" size={14} />}
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function StatusDot({ status }: { status: 'normal' | 'warning' | 'critical' | 'pending' | 'approved' | 'rejected' | 'completed' }) {
  const colors: Record<string, string> = {
    normal: 'bg-emerald-400',
    warning: 'bg-amber-400',
    critical: 'bg-rose-400',
    pending: 'bg-sky-400',
    approved: 'bg-emerald-400',
    rejected: 'bg-rose-400',
    completed: 'bg-slate-400',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? 'bg-slate-400'}`} />;
}
