import { type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${variant === 'danger' ? 'bg-rose-500/15 text-rose-400' : 'bg-sky-500/15 text-sky-400'}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <div className="mt-1.5 text-sm text-slate-400">{message}</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant} size="sm" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
