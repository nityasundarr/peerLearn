import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hovered, setHovered] = useState(null);

  const validatePassword = (pw) => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
    return null;
  };

  const getStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length >= 12) score++;
    return score;
  };

  const strengthScore = getStrength(newPassword);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][strengthScore] || '';
  const strengthColor = ['', '#ef4444', '#f59e0b', '#84cc16', '#22c55e', '#16a34a'][strengthScore] || '#e5e7eb';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

    const pwError = validatePassword(newPassword);
    if (pwError) {
      setError(pwError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: newPassword });
      setSuccess(true);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((d) => d.msg ?? d).join(', ') : err.message || 'Reset failed.');
      const lower = msg.toLowerCase();
      if (lower.includes('expir') || lower.includes('invalid')) {
        setError('This reset link has expired or is invalid. Please request a new one.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid #e7e5e4',
    fontSize: '15px',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#1c1917',
  };

  const Navbar = () => (
    <nav style={{ height: '72px', background: '#1a5f4a', padding: '0 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
        <img
          src={PeerLearnLogo}
          alt="PeerLearn"
          style={{ height: '36px', objectFit: 'contain' }}
        />
      </Link>
    </nav>
  );

  // No token in URL
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '48px 40px', width: '440px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>🔗</div>
            <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Invalid Link</h2>
            <p style={{ color: '#57534e', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
              This password reset link is invalid or missing. Please request a new one from the login page.
            </p>
            <Link to="/login" style={{ display: 'block', width: '100%', padding: '14px', background: '#1a5f4a', color: '#fff', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box' }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '48px 40px', width: '440px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>🔐</div>
            <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Password Reset!</h2>
            <p style={{ color: '#57534e', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
              Your password has been updated successfully. You can now log in with your new password.
            </p>
            <Link
              to="/login"
              style={{ display: 'block', width: '100%', padding: '14px', background: '#1a5f4a', color: '#fff', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box' }}
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Navbar />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '40px', width: '440px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: '56px', height: '56px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px' }}>🔑</div>
            <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '8px' }}>Set New Password</h2>
            <p style={{ color: '#57534e', fontSize: '15px' }}>Choose a strong password for your account</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* New Password */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 chars, 1 uppercase, 1 number, 1 special"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: '48px' }}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#78716c', fontSize: '16px', padding: '0' }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>

              {/* Strength bar */}
              {newPassword.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: '4px',
                          borderRadius: '2px',
                          background: i <= strengthScore ? strengthColor : '#e5e7eb',
                          transition: 'background 0.2s',
                        }}
                      />
                    ))}
                  </div>
                  <p style={{ fontSize: '12px', color: strengthColor, fontWeight: '600' }}>{strengthLabel}</p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: confirmPassword && confirmPassword !== newPassword ? '#fca5a5' : '#e7e5e4',
                }}
                autoComplete="new-password"
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>Passwords don't match</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>
                {error}
                {(error.includes('expired') || error.includes('invalid')) && (
                  <span>
                    {' '}
                    <Link to="/login" style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none' }}>Request a new link</Link>
                  </span>
                )}
              </div>
            )}

            {/* Password requirements hint */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12px', color: '#64748b' }}>
              Requirements: 8+ characters · 1 uppercase · 1 number · 1 special character
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => !loading && setHovered('submit')}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '100%',
                padding: '14px',
                background: loading ? '#2d7a61' : (hovered === 'submit' ? '#2d7a61' : '#1a5f4a'),
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
              {loading ? 'Resetting password…' : 'Reset Password'}
            </button>
          </form>

          <p style={{ textAlign: 'center', color: '#57534e', fontSize: '14px' }}>
            <Link to="/login" onMouseEnter={() => setHovered('login')} onMouseLeave={() => setHovered(null)} style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none', opacity: hovered === 'login' ? 0.85 : 1, transition: 'all 0.15s ease' }}>
              ← Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
