import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './services/AuthContext';

// Pages - your existing files
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TuteeRequest from './pages/TuteeRequest';
import OfferToTutor from './pages/OfferToTutor';
import ProfileSettings from './pages/ProfileSettings';
import SessionMessaging from './pages/SessionMessaging';
import FeedbackForm from './pages/FeedbackForm';
import Complaints from './pages/Complaints';
import PenaltyAppeal from './pages/PenaltyAppeal';
import SessionDetail from './pages/SessionDetail';
import SessionCoordination from './pages/SessionCoordination';
import AdminOverview from './pages/Admin/Overview';
import DemandAnalytics from './pages/Admin/DemandAnalytics';
import SupplyAnalytics from './pages/Admin/SupplyAnalytics';
import GapAnalysis from './pages/Admin/GapAnalysis';

// Pages - new auth pages
import SignUp from './pages/SignUp';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';

import './App.css';

// Wrapper: redirects to /login if not authenticated
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Wrapper: redirects to /dashboard if already logged in
// (so logged-in users don't see landing/login pages)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes - redirect to dashboard if already logged in */}
      <Route
        path="/"
        element={
          <PublicRoute>
            <LandingPage />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <SignUp />
          </PublicRoute>
        }
      />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected routes - require login */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/request-help"
        element={
          <ProtectedRoute>
            <TuteeRequest />
          </ProtectedRoute>
        }
      />
      <Route
        path="/offer-tutor"
        element={
          <ProtectedRoute>
            <OfferToTutor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfileSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/session/:sessionId/chat"
        element={
          <ProtectedRoute>
            <SessionMessaging />
          </ProtectedRoute>
        }
      />
      <Route
        path="/feedback/:sessionId"
        element={
          <ProtectedRoute>
            <FeedbackForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/complaints"
        element={
          <ProtectedRoute>
            <Complaints />
          </ProtectedRoute>
        }
      />
      <Route
        path="/appeal/:recordId"
        element={
          <ProtectedRoute>
            <PenaltyAppeal />
          </ProtectedRoute>
        }
      />
      <Route
        path="/session/:sessionId/coordinate"
        element={
          <ProtectedRoute>
            <SessionCoordination />
          </ProtectedRoute>
        }
      />
      <Route
        path="/session/:sessionId"
        element={
          <ProtectedRoute>
            <SessionDetail />
          </ProtectedRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin/overview"
        element={
          <ProtectedRoute>
            <AdminOverview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/demand"
        element={
          <ProtectedRoute>
            <DemandAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/supply"
        element={
          <ProtectedRoute>
            <SupplyAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/gaps"
        element={
          <ProtectedRoute>
            <GapAnalysis />
          </ProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />

      {/* Catch-all: redirect unknown routes to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
