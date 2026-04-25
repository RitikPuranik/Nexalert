import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import DashboardLayout from './pages/DashboardLayout';
import Dashboard from './pages/Dashboard';
import WarRoom from './pages/WarRoom';
import Incidents from './pages/Incidents';
import Staff from './pages/Staff';
import Audit from './pages/Audit';
import Health from './pages/Health';

function Spinner() {
  return (
    <div className="min-h-screen bg-[#04080f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-slate-500 text-sm">Loading…</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="warroom/:id" element={<WarRoom />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="staff" element={<Staff />} />
        <Route path="audit" element={<Audit />} />
        <Route path="health" element={<Health />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
