import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './pages/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Incidents from './pages/Incidents.jsx';
import WarRoom from './pages/WarRoom.jsx';
import Staff from './pages/Staff.jsx';
import Audit from './pages/Audit.jsx';
import Health from './pages/Health.jsx';
import Reports from './pages/Reports.jsx';
import Sensors from './pages/Sensors.jsx';
import MyTasks from './pages/MyTasks.jsx';

function Loader() {
  return (
    <div className="min-h-screen bg-void-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"/>
        <span className="text-slate-600 text-xs tracking-widest uppercase">Loading</span>
      </div>
    </div>
  );
}

function Guard({ children, managerOnly }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user)   return <Navigate to="/login" replace />;
  if (managerOnly && profile?.role !== 'manager') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace/> : <Login/>}/>
      <Route path="/dashboard" element={<Guard><Layout/></Guard>}>
        <Route index element={<Dashboard/>}/>
        <Route path="incidents" element={<Incidents/>}/>
        <Route path="warroom/:id" element={<WarRoom/>}/>
        <Route path="my-tasks" element={<MyTasks/>}/>
        <Route path="staff"    element={<Guard managerOnly><Staff/></Guard>}/>
        <Route path="sensors"  element={<Guard managerOnly><Sensors/></Guard>}/>
        <Route path="reports"  element={<Guard managerOnly><Reports/></Guard>}/>
        <Route path="audit"    element={<Guard managerOnly><Audit/></Guard>}/>
        <Route path="health"   element={<Guard managerOnly><Health/></Guard>}/>
      </Route>
      <Route path="*" element={<Navigate to={user?'/dashboard':'/login'} replace/>}/>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes/>
      </BrowserRouter>
    </AuthProvider>
  );
}
