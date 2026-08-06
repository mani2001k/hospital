import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, type Permission } from '@/lib/permissions';
import { LoadingSpinner } from '@/components/ui';

export function ProtectedRoute({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <LoadingSpinner size={32} label="Loading session…" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && profile && !hasPermission(profile.role, permission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
