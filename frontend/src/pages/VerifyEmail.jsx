import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'expired' | 'invalid' | 'no_token'

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('no_token');
      return;
    }

    const verify = async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setStatus('success');
      } catch (err) {
        const detail = err.response?.data?.detail || '';
        const msg = (typeof detail === 'string' ? detail : JSON.stringify(detail)).toLowerCase();
        if (msg.includes('expir') || msg.includes('invalid')) {
          setStatus('expired');
        } else {
          setStatus('expired'); // treat all errors as expired/invalid
        }
      }
    };

    verify();
  }, [searchParams]);

  const containerStyle = {
    minHeight: '100vh',
    background: '#fafaf9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const cardStyle = {
    background: '#ffffff',
    borderRadius: '20px',
    padding: '48px 40px',
    width: '440px',
    maxWidth: '90vw',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    textAlign: 'center',
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

  const Wrapper = ({ children }) => (
    <div style={containerStyle}>
      <Navbar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
        <div style={cardStyle}>{children}</div>
      </div>
    </div>
  );

  if (status === 'verifying') {
    return (
      <Wrapper>
        <div style={{ width: '56px', height: '56px', border: '4px solid #e7e5e4', borderTop: '4px solid #1a5f4a', borderRadius: '50%', margin: '0 auto 28px', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1c1917', marginBottom: '10px' }}>Verifying your email…</h2>
        <p style={{ color: '#57534e', fontSize: '15px' }}>Please wait a moment.</p>
      </Wrapper>
    );
  }

  if (status === 'success') {
    return (
      <Wrapper>
        <div style={{ width: '64px', height: '64px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>✅</div>
        <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Email Verified!</h2>
        <p style={{ color: '#57534e', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
          Your account is now active. You can log in and start using PeerLearn.
        </p>
        <Link
          to="/login"
          style={{ display: 'block', width: '100%', padding: '14px', background: '#1a5f4a', color: '#fff', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box' }}
        >
          Go to Login
        </Link>
      </Wrapper>
    );
  }

  if (status === 'no_token') {
    return (
      <Wrapper>
        <div style={{ width: '64px', height: '64px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>🔗</div>
        <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Invalid Link</h2>
        <p style={{ color: '#57534e', fontSize: '15px', lineHeight: '1.6', marginBottom: '32px' }}>
          This verification link is missing a token. Please use the link sent to your email, or request a new one from the login page.
        </p>
        <Link
          to="/login"
          style={{ display: 'block', width: '100%', padding: '14px', background: '#1a5f4a', color: '#fff', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box' }}
        >
          Back to Login
        </Link>
      </Wrapper>
    );
  }

  // expired / invalid
  return (
    <Wrapper>
      <div style={{ width: '64px', height: '64px', background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '32px' }}>⏰</div>
      <h2 style={{ fontSize: '26px', fontWeight: '700', color: '#1c1917', marginBottom: '12px' }}>Link Expired</h2>
      <p style={{ color: '#57534e', fontSize: '15px', lineHeight: '1.6', marginBottom: '8px' }}>
        This verification link has expired or has already been used. Verification links are valid for 24 hours.
      </p>
      <p style={{ color: '#78716c', fontSize: '14px', marginBottom: '32px' }}>
        Head back to the login page and use the <strong>resend verification email</strong> option to get a fresh link.
      </p>
      <Link
        to="/login"
        style={{ display: 'block', width: '100%', padding: '14px', background: '#1a5f4a', color: '#fff', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box', marginBottom: '12px' }}
      >
        Back to Login
      </Link>
      <Link
        to="/signup"
        style={{ display: 'block', width: '100%', padding: '14px', background: 'transparent', color: '#1a5f4a', border: '2px solid #1a5f4a', borderRadius: '10px', fontSize: '16px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box' }}
      >
        Create a New Account
      </Link>
    </Wrapper>
  );
};

export default VerifyEmail;
