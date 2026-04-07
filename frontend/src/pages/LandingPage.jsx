import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';
import api from '../services/api';
import PeerLearnLogo from '../assets/PeerLearnLogo.svg';

// ============================================================
// SECTION 1: LANDING PAGE WITH LOGIN/SIGNUP MODALS
// Updated to match SRS requirements
// ============================================================

const PREFERRED_LANGUAGE_MAP = { en: 'English', zh: 'Chinese', ms: 'Malay', ta: 'Tamil' };

const LandingPage = () => {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword } = useAuth();
  const [showModal, setShowModal] = useState(null); // 'login' | 'signup' | 'verify' | null
  const [hovered, setHovered] = useState(null);
  const [showOtherPlanningArea, setShowOtherPlanningArea] = useState(false);
  const [showOtherSchool, setShowOtherSchool] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup form state
  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPreferredLanguage, setSignupPreferredLanguage] = useState('en');
  const [signupError, setSignupError] = useState(null);
  const [signupLoading, setSignupLoading] = useState(false);

  // Verify modal: email used for resend
  const [verifyEmail, setVerifyEmail] = useState('');
  const [resendError, setResendError] = useState(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Forgot password state
  const [forgotError, setForgotError] = useState(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    const { data, error } = await signIn(loginEmail.trim(), loginPassword);
    setLoginLoading(false);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('lock')) {
        setLoginError('locked');
      } else if (msg.includes('verif') || msg.includes('unverified')) {
        setLoginError('unverified');
      } else if (msg.includes('domain') || msg.includes('edu.sg')) {
        setLoginError('invalid_domain');
      } else {
        setLoginError(msg || 'Login failed');
      }
      return;
    }
    if (data?.user) {
      setShowModal(null);
      navigate('/dashboard');
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setSignupError(null);
    setSignupLoading(true);
    const preferredLang = (signupPreferredLanguage && PREFERRED_LANGUAGE_MAP[signupPreferredLanguage]) || 'English';
    const { data, error } = await signUp(signupEmail.trim(), signupPassword, {
      full_name: signupFullName.trim(),
      preferred_language: preferredLang,
    });
    setSignupLoading(false);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('domain') || msg.includes('edu.sg')) {
        setSignupError('invalid_domain');
      } else {
        setSignupError(error.message || 'Registration failed');
      }
      return;
    }
    if (data) {
      setVerifyEmail(signupEmail.trim());
      setResendError(null);
      setResendSuccess(false);
      setShowModal('verify');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(false);
    const email = loginEmail.trim();
    if (!email) {
      setForgotError('Please enter your email address first.');
      return;
    }
    const { error } = await resetPassword(email);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('domain') || msg.includes('edu.sg')) {
        setForgotError('invalid_domain');
      } else {
        setForgotError(error.message || 'Request failed');
      }
      return;
    }
    setForgotSuccess(true);
  };

  const handleResendVerification = async (e) => {
    e.preventDefault();
    setResendError(null);
    setResendSuccess(false);
    if (!verifyEmail) return;
    try {
      await api.post('/auth/resend-verification', { email: verifyEmail });
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
      
      {/* ==========================================
          NAVIGATION BAR
          ========================================== */}
      <nav style={{
        height: '72px',
        background: '#1a5f4a',
        padding: '0 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <img
          src={PeerLearnLogo}
          alt="PeerLearn"
          style={{ height: '36px', objectFit: 'contain' }}
        />

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowModal('login')}
            onMouseEnter={() => setHovered('nav-login')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'nav-login' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: '2px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '10px 24px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >Log In</button>
          <button
            onClick={() => setShowModal('signup')}
            onMouseEnter={() => setHovered('nav-signup')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'nav-signup' ? '#fbbf24' : '#f59e0b',
              border: 'none',
              color: '#fff',
              padding: '10px 24px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >Sign Up</button>
        </div>
      </nav>

      {/* ==========================================
          HERO SECTION
          ========================================== */}
      <section style={{
        background: 'linear-gradient(135deg, #1a5f4a 0%, #0d3d2e 100%)',
        padding: '80px 48px',
        textAlign: 'center',
        color: '#fff',
      }}>
        <h1 style={{
          fontSize: '52px',
          fontWeight: '700',
          marginBottom: '20px',
          lineHeight: '1.2',
          maxWidth: '700px',
          margin: '0 auto 20px',
        }}>
          Learn from Peers.<br />Teach What You Know.
        </h1>
        
        <p style={{
          fontSize: '20px',
          opacity: 0.9,
          maxWidth: '550px',
          margin: '0 auto 40px',
          lineHeight: '1.6',
        }}>
          Connect with fellow students for peer-to-peer tutoring. 
          Get help in subjects you struggle with, and share your expertise in areas you excel.
        </p>
        
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <button onClick={() => setShowModal('signup')} onMouseEnter={() => setHovered('hero-find')} onMouseLeave={() => setHovered(null)} style={{
            background: hovered === 'hero-find' ? '#fbbf24' : '#f59e0b',
            border: 'none',
            color: '#fff',
            padding: '16px 32px',
            borderRadius: '10px',
            fontSize: '17px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}>🎓 Find a Tutor</button>
          <button onClick={() => setShowModal('signup')} onMouseEnter={() => setHovered('hero-tutor')} onMouseLeave={() => setHovered(null)} style={{
            background: hovered === 'hero-tutor' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
            border: '2px solid rgba(255,255,255,0.4)',
            color: '#fff',
            padding: '16px 32px',
            borderRadius: '10px',
            fontSize: '17px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}>💡 Start Tutoring</button>
        </div>
      </section>

      {/* ==========================================
          HOW IT WORKS SECTION
          ========================================== */}
      <section style={{
        padding: '80px 48px',
        background: '#ffffff',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontSize: '36px',
          fontWeight: '700',
          marginBottom: '60px',
          color: '#1c1917',
        }}>How It Works</h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '40px',
          maxWidth: '1000px',
          margin: '0 auto',
        }}>
          {[
            { num: 1, icon: '📝', title: 'Sign Up', desc: 'Create your free account. One profile for both learning and teaching.' },
            { num: 2, icon: '🔍', title: 'Request or Offer', desc: 'Need help? Submit a request. Want to teach? Set your availability.' },
            { num: 3, icon: '🤝', title: 'Meet & Learn', desc: 'Get matched, pick a public venue, and start your tutoring session.' },
          ].map(step => (
            <div key={step.num} style={{
              background: '#f5f5f4',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                top: '-18px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '36px',
                height: '36px',
                background: '#1a5f4a',
                borderRadius: '50%',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '16px',
              }}>{step.num}</div>
              <div style={{ fontSize: '48px', marginBottom: '16px', marginTop: '12px' }}>{step.icon}</div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#1c1917' }}>{step.title}</h3>
              <p style={{ color: '#57534e', lineHeight: '1.6', fontSize: '15px' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ==========================================
          FEATURES SECTION
          ========================================== */}
      <section style={{
        padding: '80px 48px',
        background: '#fafaf9',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontSize: '36px',
          fontWeight: '700',
          marginBottom: '60px',
          color: '#1c1917',
        }}>Why PeerLearn?</h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '24px',
          maxWidth: '900px',
          margin: '0 auto',
        }}>
          {[
            { icon: '🧠', title: 'Smart Matching', desc: 'Algorithmic matching based on subject, topic, academic level, availability, and proximity' },
            { icon: '📍', title: 'Safe Public Venues', desc: 'Meet at libraries and community centres using Singapore government data' },
            { icon: '⚖️', title: 'Fair & Balanced', desc: 'Workload balancing prevents tutor burnout and ensures fairness' },
            { icon: '🔒', title: 'Privacy First', desc: 'Location privacy preserved through planning area abstraction' },
          ].map((feature, i) => (
            <div key={i} style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
              border: '1px solid #e7e5e4',
            }}>
              <div style={{ fontSize: '32px' }}>{feature.icon}</div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1c1917' }}>{feature.title}</h3>
                <p style={{ color: '#57534e', lineHeight: '1.5', fontSize: '15px' }}>{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ==========================================
          FOOTER
          ========================================== */}
      <footer style={{
        background: '#0d3d2e',
        padding: '40px 48px',
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
      }}>
        <p style={{ marginBottom: '12px', fontSize: '15px' }}>© 2024 PeerLearn • Built for SC2006 Software Engineering</p>
        <p style={{ fontSize: '14px', opacity: 0.7 }}>Powered by data.gov.sg & OneMap API</p>
      </footer>

      {/* ==========================================
          LOGIN MODAL
          Updated: Added account lockout info (2.1.2.4)
          ========================================== */}
      {showModal === 'login' && (
        <div
          onClick={() => setShowModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '40px',
              width: '420px',
              maxWidth: '90vw',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowModal(null)}
              onMouseEnter={() => setHovered('login-close')}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: hovered === 'login-close' ? '#e7e5e4' : '#f5f5f4',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.15s ease',
              }}
            >✕</button>

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

            <form onSubmit={handleLoginSubmit}>
              {/* Email/Username Field */}
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
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
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

              {/* Password Field */}
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
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
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
              {loginError === 'locked' && (
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
              {loginError === 'unverified' && (
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
                  <a href="#" onClick={(e) => { e.preventDefault(); setShowModal('verify'); setVerifyEmail(loginEmail); setResendError(null); setResendSuccess(false); }} onMouseEnter={() => setHovered('login-resend')} onMouseLeave={() => setHovered(null)} style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none', cursor: 'pointer', opacity: hovered === 'login-resend' ? 0.85 : 1, transition: 'all 0.15s ease' }}>resend verification email</a>.
                </div>
              )}

              {/* Error: invalid domain */}
              {loginError === 'invalid_domain' && (
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
              {loginError && loginError !== 'locked' && loginError !== 'unverified' && loginError !== 'invalid_domain' && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: '#b91c1c',
                }}>
                  {loginError}
                </div>
              )}

              {/* Account Lockout Info (SRS 2.1.2.4) */}
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
                <a href="#" onClick={handleForgotPassword} onMouseEnter={() => setHovered('login-forgot')} onMouseLeave={() => setHovered(null)} style={{
                  color: '#1a5f4a',
                  fontSize: '14px',
                  textDecoration: 'none',
                  fontWeight: '500',
                  cursor: 'pointer',
                  opacity: hovered === 'login-forgot' ? 0.85 : 1,
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
                disabled={loginLoading}
                onMouseEnter={() => !loginLoading && setHovered('login-submit')}
                onMouseLeave={() => setHovered(null)}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loginLoading ? '#1a5f4a' : (hovered === 'login-submit' ? '#2d7a61' : '#1a5f4a'),
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: loginLoading ? 'wait' : 'pointer',
                  marginBottom: '20px',
                  transition: 'all 0.2s ease',
                }}
              >
                {loginLoading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            {/* Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '20px',
            }}>
              <div style={{ flex: 1, height: '1px', background: '#e7e5e4' }}></div>
              <span style={{ color: '#a8a29e', fontSize: '14px' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#e7e5e4' }}></div>
            </div>

            {/* Google Login Button
            <button style={{
              width: '100%',
              padding: '14px',
              background: '#ffffff',
              color: '#1c1917',
              border: '1px solid #e7e5e4',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}>
              <span style={{ fontSize: '18px' }}>🔵</span>
              Continue with Google
            </button> */}

            {/* Sign Up Link */}
            <p style={{
              textAlign: 'center',
              marginTop: '24px',
              color: '#57534e',
              fontSize: '15px',
            }}>
              Don't have an account?{' '}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); setShowModal('signup'); }}
                onMouseEnter={() => setHovered('login-signup-link')}
                onMouseLeave={() => setHovered(null)}
                style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none', cursor: 'pointer', opacity: hovered === 'login-signup-link' ? 0.85 : 1, transition: 'all 0.15s ease' }}
              >Sign up free</a>
            </p>
          </div>
        </div>
      )}

      {/* ==========================================
          SIGNUP MODAL
          Updated per SRS 2.1.1:
          - Added language preference (2.1.1.3)
          - School from predefined list with "Other" (2.1.1.4)
          - Planning area with "Other" option (2.1.1.4)
          - Updated password requirements (2.1.1.5)
          - Email verification note (2.1.1.6)
          ========================================== */}
      {showModal === 'signup' && (
        <div
          onClick={() => setShowModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '40px',
              width: '520px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowModal(null)}
              onMouseEnter={() => setHovered('signup-close')}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: hovered === 'signup-close' ? '#e7e5e4' : '#f5f5f4',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.15s ease',
              }}
            >✕</button>

            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              marginBottom: '8px',
              color: '#1c1917',
            }}>Create Account</h2>
            <p style={{
              color: '#57534e',
              marginBottom: '32px',
              fontSize: '15px',
            }}>Join the peer learning community</p>

            <form onSubmit={handleSignupSubmit}>
              {/* Full Name Field (SRS 2.1.1.2) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: '#1c1917',
                }}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={signupFullName}
                  onChange={(e) => setSignupFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #e7e5e4',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>
                  1-100 characters
                </p>
              </div>

              {/* Email Field (SRS 2.1.1.3) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: '#1c1917',
                }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="email"
                  placeholder="you@school.edu.sg"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #e7e5e4',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#a8a29e', marginTop: '4px' }}>
                  📧 A verification link will be sent to activate your account
                </p>
              </div>

              {/* Signup error: invalid domain */}
              {signupError === 'invalid_domain' && (
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

              {/* Signup error: other */}
              {signupError && signupError !== 'invalid_domain' && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: '#b91c1c',
                }}>
                  {signupError}
                </div>
              )}

              {/* Password Field (SRS 2.1.1.5) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: '#1c1917',
                }}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="password"
                  placeholder="Min 8 characters"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #e7e5e4',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
              {/* Password Requirements (SRS 2.1.1.5.1-4) */}
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#57534e' }}>
                <p style={{ marginBottom: '4px', fontWeight: '500' }}>Password must contain:</p>
                <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
                  <li>At least 8 characters</li>
                  <li>At least 1 uppercase letter</li>
                  <li>At least 1 lowercase letter</li>
                  <li>At least 1 number or symbol</li>
                </ul>
              </div>
            </div>

            {/* Preferred Language (SRS 2.1.1.3) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#1c1917',
              }}>Preferred Language <span style={{ color: '#ef4444' }}>*</span></label>
              <select
                value={signupPreferredLanguage}
                onChange={(e) => setSignupPreferredLanguage(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e7e5e4',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select language</option>
                <option value="en">English</option>
                <option value="zh">Chinese (中文)</option>
                <option value="ms">Malay (Bahasa Melayu)</option>
                <option value="ta">Tamil (தமிழ்)</option>
              </select>
            </div>

            {/* Planning Area Dropdown with "Other" (SRS 2.1.1.4)
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#1c1917',
              }}>
                Planning Area <span style={{ color: '#ef4444' }}>*</span>
                <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(for venue matching)</span>
              </label>
              <select 
                onChange={(e) => setShowOtherPlanningArea(e.target.value === 'other')}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e7e5e4',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}>
                <option value="">Select your area</option>
                <option>Ang Mo Kio</option>
                <option>Bedok</option>
                <option>Bishan</option>
                <option>Bukit Batok</option>
                <option>Bukit Merah</option>
                <option>Bukit Panjang</option>
                <option>Bukit Timah</option>
                <option>Clementi</option>
                <option>Geylang</option>
                <option>Hougang</option>
                <option>Jurong East</option>
                <option>Jurong West</option>
                <option>Kallang</option>
                <option>Marine Parade</option>
                <option>Pasir Ris</option>
                <option>Punggol</option>
                <option>Queenstown</option>
                <option>Sembawang</option>
                <option>Sengkang</option>
                <option>Serangoon</option>
                <option>Tampines</option>
                <option>Toa Payoh</option>
                <option>Woodlands</option>
                <option>Yishun</option>
                <option value="other">Other (specify below)</option>
              </select>
              {/* Other Planning Area Text Field */}
              {/* {showOtherPlanningArea && (
                <input
                  type="text"
                  placeholder="Enter your planning area (1-100 characters)"
                  maxLength={100}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #e7e5e4',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                    marginTop: '10px',
                  }}
                />
              )}
            </div> */}

            {/* School/Institution Dropdown with "Other" (SRS 2.1.1.4)
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#1c1917',
              }}>
                School / Institution
                <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(optional)</span>
              </label>
              <select 
                onChange={(e) => setShowOtherSchool(e.target.value === 'other')}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e7e5e4',
                  fontSize: '15px',
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}>
                <option value="">Select your school</option>
                <optgroup label="Universities">
                  <option>National University of Singapore (NUS)</option>
                  <option>Nanyang Technological University (NTU)</option>
                  <option>Singapore Management University (SMU)</option>
                  <option>Singapore University of Technology and Design (SUTD)</option>
                  <option>Singapore Institute of Technology (SIT)</option>
                  <option>Singapore University of Social Sciences (SUSS)</option>
                </optgroup>
                <optgroup label="Polytechnics">
                  <option>Singapore Polytechnic</option>
                  <option>Ngee Ann Polytechnic</option>
                  <option>Temasek Polytechnic</option>
                  <option>Nanyang Polytechnic</option>
                  <option>Republic Polytechnic</option>
                </optgroup>
                <optgroup label="ITE">
                  <option>ITE College Central</option>
                  <option>ITE College East</option>
                  <option>ITE College West</option>
                </optgroup>
                <optgroup label="Junior Colleges">
                  <option>Hwa Chong Institution</option>
                  <option>Raffles Institution</option>
                  <option>Victoria Junior College</option>
                  <option>Anglo-Chinese Junior College</option>
                  <option>Temasek Junior College</option>
                </optgroup>
                <option value="other">Other (specify below)</option>
              </select>
              {/* Other School Text Field */}
              {/* {showOtherSchool && (
                <input
                  type="text"
                  placeholder="Enter your school (1-100 characters)"
                  maxLength={100}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #e7e5e4',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                    marginTop: '10px',
                  }}
                />
              )}
            </div> */}

            {/* Accessibility Needs (Optional)
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '12px',
                color: '#1c1917',
              }}>
                Accessibility Needs
                <span style={{ fontWeight: '400', color: '#a8a29e', marginLeft: '8px' }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  'Wheelchair accessible venues',
                  'Ground floor / lift access required',
                  'Hearing assistance needed',
                  'Visual assistance needed'
                ].map((option, i) => (
                  <label key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                  }}>
                    <input type="checkbox" style={{
                      width: '20px',
                      height: '20px',
                      accentColor: '#1a5f4a',
                      cursor: 'pointer',
                    }} />
                    <span style={{ fontSize: '14px', color: '#57534e' }}>{option}</span>
                  </label>
                ))}
              </div>
            </div> */}

            {/* Terms & Conditions Checkbox */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              marginBottom: '24px',
              cursor: 'pointer',
            }}>
              <input type="checkbox" style={{
                width: '20px',
                height: '20px',
                marginTop: '2px',
                accentColor: '#1a5f4a',
                cursor: 'pointer',
              }} />
              <span style={{ fontSize: '14px', color: '#57534e', lineHeight: '1.5' }}>
                I agree to the{' '}
                <a href="#" style={{ color: '#1a5f4a', textDecoration: 'none', fontWeight: '500' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="#" style={{ color: '#1a5f4a', textDecoration: 'none', fontWeight: '500' }}>Privacy Policy</a>
                {' '}(PDPA compliant)
              </span>
            </label>

            {/* Create Account Button */}
            <button
              type="submit"
              disabled={signupLoading}
              onMouseEnter={() => !signupLoading && setHovered('signup-submit')}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '100%',
                padding: '14px',
                background: signupLoading ? '#1a5f4a' : (hovered === 'signup-submit' ? '#2d7a61' : '#1a5f4a'),
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: signupLoading ? 'wait' : 'pointer',
                marginBottom: '20px',
                transition: 'all 0.2s ease',
              }}
            >
              {signupLoading ? 'Creating account...' : 'Create Account'}
            </button>
            </form>

            {/* Divider */}
            {/* Login Link */}
            <p style={{
              textAlign: 'center',
              marginTop: '24px',
              color: '#57534e',
              fontSize: '15px',
            }}>
              Already have an account?{' '}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); setShowModal('login'); }}
                style={{ color: '#1a5f4a', fontWeight: '600', textDecoration: 'none' }}
              >Log in</a>
            </p>
          </div>
        </div>
      )}

      {/* ==========================================
          EMAIL VERIFICATION MODAL (SRS 2.1.1.6)
          Shown after signup, before account activation
          ========================================== */}
      {showModal === 'verify' && (
        <div
          onClick={() => setShowModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '48px',
              width: '450px',
              maxWidth: '90vw',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
          >
            {/* Email Icon */}
            <div style={{
              width: '80px',
              height: '80px',
              background: '#f0fdf4',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '36px',
            }}>📧</div>

            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#1c1917',
            }}>Verify Your Email</h2>
            
            <p style={{
              color: '#57534e',
              marginBottom: '24px',
              fontSize: '15px',
              lineHeight: '1.6',
            }}>
              We've sent a verification link to<br />
              <strong style={{ color: '#1c1917' }}>{verifyEmail || 'your email'}</strong>
            </p>

            <div style={{
              background: '#f5f5f4',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}>
              <p style={{ fontSize: '14px', color: '#57534e', marginBottom: '12px' }}>
                Please check your inbox and click the verification link to activate your account.
              </p>
              <p style={{ fontSize: '13px', color: '#a8a29e' }}>
                Didn't receive the email? Check your spam folder or{' '}
                <a href="#" onClick={handleResendVerification} onMouseEnter={() => setHovered('verify-resend')} onMouseLeave={() => setHovered(null)} style={{ color: '#1a5f4a', textDecoration: 'none', fontWeight: '500', cursor: 'pointer', opacity: hovered === 'verify-resend' ? 0.85 : 1, transition: 'all 0.15s ease' }}>
                  resend verification email
                </a>
              </p>
              {resendSuccess && (
                <p style={{ fontSize: '14px', color: '#166534', marginTop: '12px' }}>
                  ✓ Verification email sent.
                </p>
              )}
              {resendError && (
                <p style={{ fontSize: '14px', color: '#b91c1c', marginTop: '12px' }}>
                  {resendError === 'invalid_domain' ? 'Only .edu.sg email addresses are allowed.' : resendError}
                </p>
              )}
            </div>

            <button
              onClick={() => setShowModal('login')}
              onMouseEnter={() => setHovered('verify-back')}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '100%',
                padding: '14px',
                background: hovered === 'verify-back' ? '#2d7a61' : '#1a5f4a',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}>Back to Login</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
