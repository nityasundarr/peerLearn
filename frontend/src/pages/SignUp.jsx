import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const LANGUAGES = ['English', 'Chinese', 'Malay', 'Tamil'];

const SignUp = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [language, setLanguage] = useState('English');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const validateClientSide = () => {
    if (!fullName.trim()) return 'Please enter your full name.';
    if (!email.trim()) return 'Please enter your email address.';
    if (!email.trim().toLowerCase().endsWith('.edu.sg')) {
      return 'Only .edu.sg email addresses are allowed.';
    }
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const clientError = validateClientSide();
    if (clientError) {
      setError(clientError);
      return;
    }

    setLoading(true);
    const { error: err } = await signUp(email.trim(), password, {
      full_name: fullName.trim(),
      preferred_language: language,
    });
    setLoading(false);

    if (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('edu.sg') || msg.includes('domain')) {
        setError('Only .edu.sg email addresses are allowed.');
      } else if (msg.includes('already') || msg.includes('exist')) {
        setError('An account with this email already exists. Try logging in.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
      return;
    }

    setSuccess(true);
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

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <nav style={{ height: '72px', background: '#1a5f4a', padding: '0 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <img
              src={PeerLearnLogo}
              alt="PeerLearn"
              style={{ height: '36px', objectFit: 'contain' }}
            />
          </Link>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
          <div style={{ background: '#ffffff', borderRadius: '20px', padding: '48px 40px', width: '440px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>✉️</div>
            <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Check Your Email</h2>
            <p style={{ color: '#57534e', fontSize: '15px', lineHeight: '1.6', marginBottom: '28px' }}>
              We sent a verification link to <strong>{email}</strong>. Click the link to activate your account before logging in.
            </p>
            <p style={{ color: '#78716c', fontSize: '13px', marginBottom: '28px' }}>
              Didn't receive it? Check your spam folder or go back to the login page to request another one.
            </p>
            <Link to="/login" style={{ display: 'block', width: '100%', padding: '14px', background: '#1a5f4a', color: '#fff', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box', transition: 'background 0.2s' }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Nav */}
      <nav style={{ height: '72px', background: '#1a5f4a', padding: '0 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <img
            src={PeerLearnLogo}
            alt="PeerLearn"
            style={{ height: '36px', objectFit: 'contain' }}
          />
        </Link>
        <Link to="/" onMouseEnter={() => setHovered('back')} onMouseLeave={() => setHovered(null)} style={{ background: hovered === 'back' ? 'rgba(255,255,255,0.1)' : 'transparent', border: '2px solid rgba(255,255,255,0.4)', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: 'pointer', textDecoration: 'none', transition: 'all 0.15s ease' }}>
          Back to Home
        </Link>
      </nav>

      {/* Sign Up Card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '40px', width: '460px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: '#1c1917' }}>Create Account</h2>
          <p style={{ color: '#57534e', marginBottom: '32px', fontSize: '15px' }}>Join PeerLearn with your school email address</p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Full Name */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                placeholder="As shown on your student ID"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
                autoComplete="name"
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>School Email Address</label>
              <input
                type="email"
                placeholder="you@school.edu.sg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                autoComplete="email"
              />
              <p style={{ fontSize: '12px', color: '#78716c', marginTop: '6px' }}>Must end with .edu.sg</p>
            </div>

            {/* Preferred Language */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Preferred Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            {/* Password */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 chars, 1 uppercase, 1 number, 1 special"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: '48px' }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#78716c', fontSize: '16px', padding: '0' }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '14px', color: '#b91c1c' }}>
                {error}
              </div>
            )}

            {/* Password hint */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12px', color: '#64748b' }}>
              Password requirements: 8+ characters · 1 uppercase · 1 number · 1 special character
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => !loading && setHovered('submit')}
              onMouseLeave={() => setHovered(null)}
              style={{ width: '100%', padding: '14px', background: loading ? '#2d7a61' : (hovered === 'submit' ? '#2d7a61' : '#1a5f4a'), color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '600', cursor: loading ? 'wait' : 'pointer', marginBottom: '20px', transition: 'all 0.2s ease' }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          {/* Login link */}
          <p style={{ textAlign: 'center', color: '#57534e', fontSize: '15px' }}>
            Already have an account?{' '}
            <Link to="/login" onMouseEnter={() => setHovered('login')} onMouseLeave={() => setHovered(null)} style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none', opacity: hovered === 'login' ? 0.85 : 1, transition: 'all 0.15s ease' }}>
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
