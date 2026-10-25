import { Component, StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Spinner } from './components/ui';
import './index.css';

const Landing = lazy(() => import('./landing/Landing'));
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.default })));
const Setup = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Setup })));
const ChangePassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ChangePassword })));
const AppShell = lazy(() => import('./components/AppShell'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Employees = lazy(() => import('./pages/app/Employees'));
const EmployeeDetail = lazy(() => import('./pages/app/EmployeeDetail'));
const Attendance = lazy(() => import('./pages/app/Attendance'));
const Leave = lazy(() => import('./pages/app/Leave'));
const Payroll = lazy(() => import('./pages/app/Payroll'));
const Analytics = lazy(() => import('./pages/app/Analytics'));
const Assistant = lazy(() => import('./pages/app/Assistant'));
const Announcements = lazy(() => import('./pages/app/Announcements'));
const Audit = lazy(() => import('./pages/app/Audit'));
const Settings = lazy(() => import('./pages/app/Settings'));
const Users = lazy(() => import('./pages/app/Users'));
const Profile = lazy(() => import('./pages/app/Profile'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 },
  },
});

function PageSpinner({ label = 'Loading' }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950">
      <div className="flex flex-col items-center gap-3 text-text-faint">
        <Spinner size={22} />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em]">{label}</p>
      </div>
    </div>
  );
}

/** Catches render errors so a single broken screen never blanks the whole app. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-faint">Something broke</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-text">This screen could not render</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-text-muted">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-11 rounded-xl bg-[#5B3EE8] px-4 text-sm font-medium text-white"
            >
              Reload the app
            </button>
            <a href="/app" className="grid h-11 place-items-center rounded-xl border border-white/15 px-4 text-sm text-text">
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

function RequireAuth({ children }) {
  const { user, loading, setup } = useAuth();
  const location = useLocation();
  if (loading) return <PageSpinner label="Checking your session" />;
  if (setup?.needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <Navigate to="/app" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading, setup } = useAuth();
  if (loading) return <PageSpinner label="Loading" />;
  if (setup?.needsSetup) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />

                <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route index element={<Dashboard />} />
                  <Route path="employees" element={<RequireRole roles={['admin', 'hr']}><Employees /></RequireRole>} />
                  <Route path="employees/:id" element={<RequireRole roles={['admin', 'hr']}><EmployeeDetail /></RequireRole>} />
                  <Route path="attendance" element={<Attendance />} />
                  <Route path="leave" element={<Leave />} />
                  <Route path="payroll" element={<Payroll />} />
                  <Route path="analytics" element={<RequireRole roles={['admin', 'hr']}><Analytics /></RequireRole>} />
                  <Route path="assistant" element={<Assistant />} />
                  <Route path="announcements" element={<Announcements />} />
                  <Route path="audit" element={<RequireRole roles={['admin']}><Audit /></RequireRole>} />
                  <Route path="settings" element={<RequireRole roles={['admin']}><Settings /></RequireRole>} />
                  <Route path="users" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
                  <Route path="profile" element={<Profile />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
