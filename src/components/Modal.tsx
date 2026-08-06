import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 my-8 w-full ${sizeClass} rounded-xl border border-slate-700 bg-slate-900 shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-500 transition-colors hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-700/50 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function FormField({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-rose-400">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30';

export const selectClass = inputClass;

export const errorInputClass =
  'w-full rounded-lg border border-rose-500/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500/30';
