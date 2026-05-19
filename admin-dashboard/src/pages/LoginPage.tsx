import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

 const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const data = await authApi.login(email, password);

    if (data.requiresTotp) {
      setTempToken(data.tempToken);
      setRequiresTotp(true);
    } else {
      login(data.token, { id: '', email });
      navigate('/dashboard', { replace: true });
    }
  } catch (err: any) {
    setError(err.response?.data?.error || 'Login failed.');
  } finally {
    setLoading(false);
  }
};

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.verifyTotp(tempToken, totpCode);
      const me = await authApi.me();
      login(data.token, me);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>NeoVision</span>
        </div>
        <p style={styles.subtitle}>Remote Support Console</p>

        {!requiresTotp ? (
          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTotp} style={styles.form}>
            <p style={styles.totpHint}>
              Enter the 6-digit code from your authenticator app.
            </p>

            <div style={styles.field}>
              <label style={styles.label}>Authentication Code</label>
              <input
                style={{ ...styles.input, textAlign: 'center', letterSpacing: '0.5em', fontSize: '1.4rem' }}
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button style={styles.button} type="submit" disabled={loading || totpCode.length !== 6}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)',
  },
  card: {
    background: '#12121f',
    border: '1px solid #2d2d4e',
    borderRadius: '16px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  logoIcon: {
    fontSize: '2rem',
    color: '#6c63ff',
  },
  logoText: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '0.9rem',
    marginBottom: '36px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    fontWeight: 500,
  },
  input: {
    background: '#1e1e35',
    border: '1px solid #2d2d4e',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  button: {
    background: 'linear-gradient(135deg, #6c63ff, #4f46e5)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '13px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'opacity 0.2s',
  },
  error: {
    color: '#f87171',
    fontSize: '0.85rem',
    background: '#1f0a0a',
    border: '1px solid #7f1d1d',
    borderRadius: '6px',
    padding: '10px 12px',
  },
  totpHint: {
    color: '#94a3b8',
    fontSize: '0.9rem',
    textAlign: 'center',
  },
};