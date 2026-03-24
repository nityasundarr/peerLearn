import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';

const Login = () => {
  const navigate = useNavigate();
  const { signIn, resetPassword } = useAuth();
  const [hovered, setHovered] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [forgotError, setForgotError] = useState(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [resendError, setResendError] = useState(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setForgotError(null);
    setForgotSuccess(false);
    setResendError(null);
    setResendSuccess(false);
    setLoading(true);
    const { data, error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('lock')) {
        setError('locked');
      } else if (msg.includes('verif') || msg.includes('unverified')) {
        setError('unverified');
      } else if (msg.includes('domain') || msg.includes('edu.sg')) {
        setError('invalid_domain');
      } else {
        setError(err.message || 'Login failed');
      }
      return;
    }
    if (data?.user) {
      navigate('/dashboard');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(false);
    const em = email.trim();
    if (!em) {
      setForgotError('Please enter your email address first.');
      return;
    }
    const { error: err } = await resetPassword(em);
    if (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('domain') || msg.includes('edu.sg')) {
        setForgotError('invalid_domain');
      } else {
        setForgotError(err.message || 'Request failed');
      }
      return;
    }
    setForgotSuccess(true);
  };

  const handleResendVerification = async (e) => {
    e.preventDefault();
    setResendError(null);
    setResendSuccess(false);
    const em = email.trim();
    if (!em) return;
    try {
      await api.post('/auth/resend-verification', { email: em });
      setResendSuccess(true);
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = Array.isArray(d) ? d.map((e) => e.msg ?? e).join(', ') : (d ?? err.message ?? 'Request failed');
      const lower = (msg || '').toLowerCase();
      if (lower.includes('domain') || lower.includes('edu.sg')) {
        setResendError('invalid_domain');
      } else {
        setResendError(msg);
      }
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fafaf9',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Nav */}
      <nav style={{
        height: '72px',
        background: '#1a5f4a',
        padding: '0 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: '#f59e0b',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '20px',
          }}>P</div>
          <span style={{ color: '#fff', fontSize: '24px', fontWeight: '700', letterSpacing: '-0.5px' }}>PeerLearn</span>
        </Link>
        <Link to="/" onMouseEnter={() => setHovered('back')} onMouseLeave={() => setHovered(null)} style={{
          background: hovered === 'back' ? 'rgba(255,255,255,0.1)' : 'transparent',
          border: '2px solid rgba(255,255,255,0.4)',
          color: '#fff',
          padding: '10px 24px',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: '500',
          cursor: 'pointer',
          textDecoration: 'none',
          transition: 'all 0.15s ease',
        }}>Back to Home</Link>
      </nav>

      {/* Login Card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
      }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '40px',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}>
          <h2 style={{
            fontSize: '28px',
            fontWeight: '700',
            marginBottom: '8px',
            color: '#1c1917',
          }}>Welcome Back</h2>
          <p style={{
            color: '#57534e',
            marginBottom: '32px',
            fontSize: '15px',
          }}>Log in to continue learning and teaching</p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#1c1917',
              }}>Email Address</label>
              <input
                type="email"
                placeholder="you@school.edu.sg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e7e5e4',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#1c1917',
              }}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e7e5e4',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Error: locked account */}
            {error === 'locked' && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#b91c1c',
              }}>
                🔒 Account is locked. Use the Forgot password link below to reset your password and unlock your account.
              </div>
            )}

            {/* Error: unverified email */}
            {error === 'unverified' && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#92400e',
              }}>
                📧 Please verify your email first. Check your inbox or{' '}
                <a href="#" onClick={handleResendVerification} onMouseEnter={() => setHovered('resend')} onMouseLeave={() => setHovered(null)} style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none', cursor: 'pointer', opacity: hovered === 'resend' ? 0.85 : 1, transition: 'all 0.15s ease' }}>resend verification email</a>.
              </div>
            )}

            {/* Error: invalid domain */}
            {error === 'invalid_domain' && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#b91c1c',
              }}>
                Only .edu.sg email addresses are allowed.
              </div>
            )}

            {/* Error: other */}
            {error && error !== 'locked' && error !== 'unverified' && error !== 'invalid_domain' && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#b91c1c',
              }}>
                {error}
              </div>
            )}

            {/* Resend success/error */}
            {resendSuccess && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#166534',
              }}>
                Verification email sent. Check your inbox.
              </div>
            )}
            {resendError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#b91c1c',
              }}>
                {resendError === 'invalid_domain' ? 'Only .edu.sg email addresses are allowed.' : resendError}
              </div>
            )}

            {/* Account lockout info */}
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#92400e',
            }}>
              ⚠️ Account will be temporarily locked after 5 consecutive failed login attempts.
            </div>

            {/* Forgot Password Link */}
            <div style={{ textAlign: 'right', marginBottom: '24px' }}>
              <a href="#" onClick={handleForgotPassword} onMouseEnter={() => setHovered('forgot')} onMouseLeave={() => setHovered(null)} style={{
                color: '#1a5f4a',
                fontSize: '14px',
                textDecoration: 'none',
                fontWeight: '500',
                cursor: 'pointer',
                opacity: hovered === 'forgot' ? 0.85 : 1,
                transition: 'all 0.15s ease',
              }}>Forgot password?</a>
            </div>

            {/* Forgot password success/error */}
            {forgotSuccess && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#166534',
              }}>
                Password reset email sent. Check your inbox.
              </div>
            )}
            {forgotError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#b91c1c',
              }}>
                {forgotError === 'invalid_domain' ? 'Only .edu.sg email addresses are allowed.' : forgotError}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => !loading && setHovered('submit')}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '100%',
                padding: '14px',
                background: loading ? '#1a5f4a' : (hovered === 'submit' ? '#2d7a61' : '#1a5f4a'),
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading ? 'wait' : 'pointer',
                marginBottom: '20px',
                transition: 'all 0.2s ease',
              }}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          {/* Sign Up Link */}
          <p style={{
            textAlign: 'center',
            marginTop: '24px',
            color: '#57534e',
            fontSize: '15px',
          }}>
            Don&apos;t have an account?{' '}
            <Link to="/signup" onMouseEnter={() => setHovered('signup')} onMouseLeave={() => setHovered(null)} style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none', cursor: 'pointer', opacity: hovered === 'signup' ? 0.85 : 1, transition: 'all 0.15s ease' }}>Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
