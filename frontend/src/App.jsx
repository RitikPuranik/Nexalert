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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-page"><div className="loading-spinner" /><span>Loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

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
