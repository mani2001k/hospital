import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AppLayout from '@/components/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import QueuesPage from '@/pages/QueuesPage';
import ForecastPage from '@/pages/ForecastPage';
import TasksPage from '@/pages/TasksPage';
import PredictionsPage from '@/pages/PredictionsPage';
import AnomaliesPage from '@/pages/AnomaliesPage';
import PreventivePage from '@/pages/PreventivePage';
import ReportsPage from '@/pages/ReportsPage';
import NotificationsPage from '@/pages/NotificationsPage';
import UsersPage from '@/pages/UsersPage';
import AuditSettingsPage from '@/pages/AuditSettingsPage';
import PatientsPage from '@/pages/PatientsPage';
import StaffPage from '@/pages/StaffPage';
import WardsPage from '@/pages/WardsPage';
import { Toaster } from 'react-hot-toast';

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-sky-500" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/queues" element={<QueuesPage />} />
                <Route path="/forecasts" element={<ForecastPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/predictions" element={<PredictionsPage />} />
                <Route path="/anomalies" element={<AnomaliesPage />} />
                <Route path="/preventive" element={<PreventivePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/patients" element={<PatientsPage />} />
                <Route path="/staff" element={<StaffPage />} />
                <Route path="/wards" element={<WardsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/audit" element={<AuditSettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              fontSize: '13px',
              borderRadius: '8px',
            },
            success: { iconTheme: { primary: '#0ea5e9', secondary: '#fff' } },
            error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
