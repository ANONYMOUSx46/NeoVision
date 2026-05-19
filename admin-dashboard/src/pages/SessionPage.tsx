import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWsStore } from '../store/wsStore';
import { clientsApi } from '../api/client';

interface ClientInfo {
  id: string;
  device_id: string;
  hostname: string;
  os_version: string;
  is_online: boolean;
}

export default function SessionPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sendPacket, setOnFrame, isInSession } = useWsStore();

  const [client, setClient] = useState<ClientInfo | null>(null);
  const [status, setStatus] = useState('Waiting for relay...');
  const [isConnecting, setIsConnecting] = useState(true);
  const [cmdInput, setCmdInput] = useState('');
  const [cmdOutput, setCmdOutput] = useState<string[]>([]);
  const [fileAutoRun, setFileAutoRun] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Load client info
  useEffect(() => {
    if (!deviceId) return;
    clientsApi.getAll().then((clients: ClientInfo[]) => {
      const found = clients.find((c: ClientInfo) => c.device_id === deviceId);
      if (found) setClient(found);
    });
  }, [deviceId]);

  // Watch for session becoming active
  useEffect(() => {
    if (isInSession) {
      setIsConnecting(false);
      setStatus('Connected');
    }
  }, [isInSession]);

  // Poll until WebSocket is ready then send ADMIN_CONNECT
  useEffect(() => {
    if (!deviceId) return;

    setIsConnecting(true);
    setStatus('Waiting for relay...');

    let attempts = 0;
    const maxAttempts = 20;

    const tryConnect = () => {
      const store = useWsStore.getState();
      const ws = store.ws;

      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('Sending ADMIN_CONNECT');
        setStatus('Requesting session...');
        store.sendPacket({ type: 'ADMIN_CONNECT', deviceId });
      } else {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryConnect, 500);
        } else {
          setStatus('Could not connect. Please go back and try again.');
          setIsConnecting(false);
        }
      }
    };

    setTimeout(tryConnect, 500);
  }, [deviceId]);

  // Handle incoming screen frames
  useEffect(() => {
    setOnFrame((data: ArrayBuffer) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const blob = new Blob([data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };

      img.src = url;
    });

    return () => setOnFrame(null);
  }, []);

  // ── Input forwarding ──────────────────────────────────────────────────────

  const getRelativePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getRelativePos(e);
    sendPacket({ type: 'ADMIN_INPUT', inputType: 'mousemove', ...pos });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const button = ['left', 'middle', 'right'][e.button] ?? 'left';
    sendPacket({ type: 'ADMIN_INPUT', inputType: 'mousedown', button });
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const button = ['left', 'middle', 'right'][e.button] ?? 'left';
    sendPacket({ type: 'ADMIN_INPUT', inputType: 'mouseup', button });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    sendPacket({ type: 'ADMIN_INPUT', inputType: 'wheel', delta: e.deltaY > 0 ? -1 : 1 });
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sendPacket({ type: 'ADMIN_INPUT', inputType: 'keydown', keyCode: e.keyCode });
  }, []);

  const onKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sendPacket({ type: 'ADMIN_INPUT', inputType: 'keyup', keyCode: e.keyCode });
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const takeScreenshot = () => {
    sendPacket({ type: 'ADMIN_SCREENSHOT' });
    setStatus('Screenshot requested...');
    setTimeout(() => setStatus('Connected'), 2000);
  };

  const saveScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `neovision-screenshot-${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  const sendCommand = () => {
    if (!cmdInput.trim()) return;
    sendPacket({ type: 'ADMIN_RUN', command: cmdInput.trim() });
    setCmdOutput(prev => [...prev, `> ${cmdInput.trim()}`]);
    setCmdInput('');
  };

  const sendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTransferring(true);
    setStatus('Transferring file...');

    const CHUNK_SIZE = 64 * 1024;
    const transferId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const slice = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      sendPacket({
        type:       'ADMIN_FILE_CHUNK',
        transferId,
        filename:   file.name,
        chunkIndex: i,
        isLast:     i === totalChunks - 1,
        autoRun:    fileAutoRun,
        totalBytes: file.size,
        data:       base64,
      });

      await new Promise(r => setTimeout(r, 20));
    }

    setTransferring(false);
    setStatus('File sent!');
    setTimeout(() => setStatus('Connected'), 3000);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const endSession = () => {
    sendPacket({ type: 'ADMIN_DISCONNECT' });
    navigate('/dashboard');
  };

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <div style={styles.topLeft}>
          <button style={styles.backBtn} onClick={endSession}>← Back</button>
          <div style={styles.clientInfo}>
            <span style={styles.clientName}>
              {client?.hostname ?? deviceId}
            </span>
            <span style={{
              ...styles.statusBadge,
              background: isInSession ? '#14532d' : '#1c1c2e',
              color:      isInSession ? '#22c55e' : '#f59e0b',
            }}>
              {isConnecting ? '⏳ ' + status : isInSession ? '● ' + status : '○ ' + status}
            </span>
          </div>
        </div>

        <div style={styles.topActions}>
          <button style={styles.actionBtn} onClick={takeScreenshot}>
            📷 Screenshot
          </button>
          <button style={styles.actionBtn} onClick={saveScreenshot}>
            💾 Save
          </button>
          <button style={{ ...styles.actionBtn, ...styles.endBtn }} onClick={endSession}>
            ✕ End Session
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <div style={styles.screenArea}>
          {isConnecting && (
            <div style={styles.overlay}>
              <div style={styles.overlaySpinner}>⏳</div>
              <div style={styles.overlayText}>{status}</div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            style={styles.canvas}
            tabIndex={0}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onContextMenu={onContextMenu}
          />

          {!isConnecting && !isInSession && (
            <div style={styles.overlay}>
              <div style={styles.overlayText}>Session ended</div>
              <button style={styles.actionBtn} onClick={endSession}>
                Return to Dashboard
              </button>
            </div>
          )}
        </div>

        <aside style={styles.sidePanel}>
          <div style={styles.panelSection}>
            <h3 style={styles.panelTitle}>Device Info</h3>
            <p style={styles.panelDetail}>
              <span style={styles.detailLabel}>Host</span>
              <span>{client?.hostname ?? '—'}</span>
            </p>
            <p style={styles.panelDetail}>
              <span style={styles.detailLabel}>OS</span>
              <span style={styles.detailValue}>{client?.os_version ?? '—'}</span>
            </p>
            <p style={styles.panelDetail}>
              <span style={styles.detailLabel}>Status</span>
              <span style={{ color: isInSession ? '#22c55e' : '#f59e0b' }}>
                {isInSession ? 'In Session' : status}
              </span>
            </p>
          </div>

          <div style={styles.panelSection}>
            <h3 style={styles.panelTitle}>File Transfer</h3>
            <label style={styles.checkRow}>
              <input
                type="checkbox"
                checked={fileAutoRun}
                onChange={e => setFileAutoRun(e.target.checked)}
              />
              <span style={styles.checkLabel}>Auto-run after transfer</span>
            </label>
            <button
              style={{
                ...styles.uploadBtn,
                opacity: transferring ? 0.5 : 1,
                cursor:  transferring ? 'not-allowed' : 'pointer',
              }}
              onClick={() => fileInputRef.current?.click()}
              disabled={transferring}
            >
              {transferring ? '⏳ Transferring...' : '📁 Send File'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={sendFile}
            />
          </div>

          <div style={styles.panelSection}>
            <h3 style={styles.panelTitle}>Run Command</h3>
            <div style={styles.cmdRow}>
              <input
                style={styles.cmdInput}
                value={cmdInput}
                onChange={e => setCmdInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCommand()}
                placeholder="e.g. notepad.exe"
              />
              <button style={styles.cmdBtn} onClick={sendCommand}>▶</button>
            </div>
            <div style={styles.cmdOutput}>
              {cmdOutput.length === 0
                ? <span style={styles.cmdPlaceholder}>No commands sent yet</span>
                : cmdOutput.map((line, i) => (
                    <div key={i} style={styles.cmdLine}>{line}</div>
                  ))
              }
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0a0a0f',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: '#12121f',
    borderBottom: '1px solid #2d2d4e',
    flexShrink: 0,
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '6px 12px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  clientInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  clientName: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  statusBadge: {
    fontSize: '0.75rem',
    padding: '3px 10px',
    borderRadius: '20px',
    fontWeight: 500,
  },
  topActions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    background: '#1e1e35',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    color: '#e2e8f0',
    padding: '7px 14px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  endBtn: {
    background: '#1f0a0a',
    borderColor: '#7f1d1d',
    color: '#f87171',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  screenArea: {
    flex: 1,
    position: 'relative',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  canvas: {
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
    cursor: 'crosshair',
    outline: 'none',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
    gap: '16px',
    zIndex: 10,
  },
  overlaySpinner: {
    fontSize: '2rem',
  },
  overlayText: {
    color: '#94a3b8',
    fontSize: '1rem',
  },
  sidePanel: {
    width: '280px',
    background: '#12121f',
    borderLeft: '1px solid #2d2d4e',
    overflowY: 'auto',
    flexShrink: 0,
  },
  panelSection: {
    padding: '20px',
    borderBottom: '1px solid #2d2d4e',
  },
  panelTitle: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#6c63ff',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '12px',
  },
  panelDetail: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.82rem',
    color: '#e2e8f0',
    marginBottom: '6px',
  },
  detailLabel: {
    color: '#64748b',
  },
  detailValue: {
    color: '#e2e8f0',
    fontSize: '0.75rem',
    textAlign: 'right',
    maxWidth: '160px',
    wordBreak: 'break-all',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    cursor: 'pointer',
  },
  checkLabel: {
    fontSize: '0.82rem',
    color: '#94a3b8',
  },
  uploadBtn: {
    width: '100%',
    padding: '9px',
    background: '#1e1e35',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  cmdRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px',
  },
  cmdInput: {
    flex: 1,
    background: '#1e1e35',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    padding: '7px 10px',
    color: '#e2e8f0',
    fontSize: '0.82rem',
    outline: 'none',
  },
  cmdBtn: {
    background: '#6c63ff',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    padding: '7px 12px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  cmdOutput: {
    background: '#0a0a0f',
    border: '1px solid #2d2d4e',
    borderRadius: '6px',
    padding: '10px',
    minHeight: '80px',
    maxHeight: '160px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '0.78rem',
  },
  cmdLine: {
    color: '#22c55e',
    marginBottom: '4px',
  },
  cmdPlaceholder: {
    color: '#334155',
    fontSize: '0.78rem',
  },
};