import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useWsStore } from '../store/wsStore';

interface Client {
  id: string;
  device_id: string;
  hostname: string;
  os_version: string;
  agent_version: string;
  is_online: boolean;
  last_seen_at: string;
  registered_at: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { token, admin, logout } = useAuthStore();
  const { connect, isConnected } = useWsStore();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Connect WebSocket and load clients on mount
useEffect(() => {
  if (token && !isConnected) {
    connect(token);
  }
  loadClients();

  const interval = setInterval(loadClients, 10000);
  return () => clearInterval(interval);
}, []);

  const loadClients = async () => {
    try {
      const data = await clientsApi.getAll();
      setClients(data);
    } catch {
      setError('Failed to load clients.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleConnect = (client: Client) => {
    if (!client.is_online) return;
    navigate(`/session/${client.device_id}`);
  };

  const onlineCount  = clients.filter(c => c.is_online).length;
  const offlineCount = clients.filter(c => !c.is_online).length;

  return (
    <div style={styles.page}>

      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>NeoVision</span>
        </div>

        <nav style={styles.nav}>
          <div style={styles.navItem}>
            <span style={styles.navIcon}>⬛</span> Dashboard
          </div>
        </nav>

        <div style={styles.sidebarBottom}>
          <div style={styles.adminInfo}>
            <div style={styles.adminAvatar}>
              {admin?.email?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div style={styles.adminEmail}>{admin?.email}</div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>

        {/* Header */}
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>Client Dashboard</h1>
            <p style={styles.pageSubtitle}>Manage and connect to remote devices</p>
          </div>
          <div style={styles.wsStatus}>
            <span style={{
              ...styles.wsDot,
              background: isConnected ? '#22c55e' : '#ef4444'
            }} />
            {isConnected ? 'Relay connected' : 'Relay disconnected'}
          </div>
        </header>

        {/* Stats */}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{clients.length}</div>
            <div style={styles.statLabel}>Total Clients</div>
          </div>
          <div style={{ ...styles.statCard, borderColor: '#22c55e33' }}>
            <div style={{ ...styles.statNumber, color: '#22c55e' }}>{onlineCount}</div>
            <div style={styles.statLabel}>Online</div>
          </div>
          <div style={{ ...styles.statCard, borderColor: '#64748b33' }}>
            <div style={{ ...styles.statNumber, color: '#64748b' }}>{offlineCount}</div>
            <div style={styles.statLabel}>Offline</div>
          </div>
        </div>

        {/* Client list */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Connected Devices</h2>
            <button style={styles.refreshBtn} onClick={loadClients}>
              ↻ Refresh
            </button>
          </div>

          {loading && <p style={styles.hint}>Loading clients...</p>}
          {error  && <p style={styles.errorText}>{error}</p>}

          {!loading && clients.length === 0 && (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>🖥</p>
              <p style={styles.emptyTitle}>No clients registered yet</p>
              <p style={styles.hint}>
                Install and run the NeoVision Agent on a client machine to see it here.
              </p>
            </div>
          )}

          <div style={styles.clientGrid}>
            {clients.map(client => (
              <div key={client.id} style={styles.clientCard}>

                {/* Status indicator */}
                <div style={styles.clientHeader}>
                  <div style={styles.clientIcon}>🖥</div>
                  <span style={{
                    ...styles.statusBadge,
                    background: client.is_online ? '#14532d' : '#1c1c2e',
                    color:      client.is_online ? '#22c55e' : '#64748b',
                    border:     `1px solid ${client.is_online ? '#22c55e44' : '#33334a'}`,
                  }}>
                    {client.is_online ? '● Online' : '○ Offline'}
                  </span>
                </div>

                <h3 style={styles.clientName}>{client.hostname}</h3>
                <p style={styles.clientDetail}>{client.os_version}</p>
                <p style={styles.clientDetail}>
                  Agent v{client.agent_version ?? '—'}
                </p>
                <p style={styles.clientDetail}>
                  Last seen: {client.last_seen_at
                    ? new Date(client.last_seen_at).toLocaleString()
                    : 'Never'}
                </p>

                <button
                  style={{
                    ...styles.connectBtn,
                    opacity: client.is_online ? 1 : 0.4,
                    cursor:  client.is_online ? 'pointer' : 'not-allowed',
                  }}
                  onClick={() => handleConnect(client)}
                  disabled={!client.is_online}
                >
                  {client.is_online ? '▶ Connect' : 'Offline'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    background: '#0a0a0f',
  },
  sidebar: {
    width: '240px',
    background: '#12121f',
    borderRight: '1px solid #2d2d4e',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0',
    flexShrink: 0,
  },
  sidebarLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 24px 32px',
    borderBottom: '1px solid #2d2d4e',
    marginBottom: '24px',
  },
  logoIcon: { fontSize: '1.5rem', color: '#6c63ff' },
  logoText: { fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f0' },
  nav: { flex: 1, padding: '0 12px' },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: '#1e1e35',
    color: '#e2e8f0',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  navIcon: { fontSize: '1rem' },
  sidebarBottom: {
    padding: '24px',
    borderTop: '1px solid #2d2d4e',
  },
  adminInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  },
  adminAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: '#6c63ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  adminEmail: {
    fontSize: '0.75rem',
    color: '#64748b',
    wordBreak: 'break-all',
  },
  logoutBtn: {
    width: '100%',
    padding: '8px',
    background: 'transparent',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    color: '#64748b',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '1.6rem',
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: '4px',
  },
  pageSubtitle: {
    color: '#64748b',
    fontSize: '0.9rem',
  },
  wsStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.85rem',
    color: '#94a3b8',
    background: '#12121f',
    border: '1px solid #2d2d4e',
    borderRadius: '20px',
    padding: '6px 14px',
  },
  wsDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '32px',
  },
  statCard: {
    flex: 1,
    background: '#12121f',
    border: '1px solid #2d2d4e',
    borderRadius: '12px',
    padding: '20px 24px',
  },
  statNumber: {
    fontSize: '2rem',
    fontWeight: 700,
    color: '#6c63ff',
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#64748b',
  },
  section: {
    background: '#12121f',
    border: '1px solid #2d2d4e',
    borderRadius: '12px',
    padding: '24px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  refreshBtn: {
    background: 'transparent',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '6px 12px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  clientGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '16px',
  },
  clientCard: {
    background: '#1a1a2e',
    border: '1px solid #2d2d4e',
    borderRadius: '10px',
    padding: '20px',
  },
  clientHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  clientIcon: { fontSize: '1.5rem' },
  statusBadge: {
    fontSize: '0.75rem',
    padding: '3px 10px',
    borderRadius: '20px',
    fontWeight: 500,
  },
  clientName: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: '8px',
  },
  clientDetail: {
    fontSize: '0.8rem',
    color: '#64748b',
    marginBottom: '4px',
  },
  connectBtn: {
    width: '100%',
    marginTop: '16px',
    padding: '9px',
    background: 'linear-gradient(135deg, #6c63ff, #4f46e5)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 24px',
  },
  emptyIcon: { fontSize: '3rem', marginBottom: '12px' },
  emptyTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: '8px',
  },
  hint: { color: '#64748b', fontSize: '0.85rem' },
  errorText: { color: '#f87171', fontSize: '0.85rem' },
};