import { create } from 'zustand';

interface WsState {
  ws: WebSocket | null;
  sessionId: string | null;
  isConnected: boolean;
  isInSession: boolean;
  onFrame: ((data: ArrayBuffer) => void) | null;
  connect: (token: string) => void;
  disconnect: () => void;
  sendPacket: (packet: object) => void;
  setOnFrame: (fn: ((data: ArrayBuffer) => void) | null) => void;
}

const RELAY_WS = 'wss://neovision-relay.onrender.com/ws';

export const useWsStore = create<WsState>((set, get) => ({
  ws:          null,
  sessionId:   null,
  isConnected: false,
  isInSession: false,
  onFrame:     null,

  connect: (token: string) => {
    const existing = get().ws;
    if (existing && existing.readyState === WebSocket.OPEN) {
      console.log('WebSocket already open');
      return;
    }
    if (existing) {
      existing.close();
    }

    console.log('Connecting to relay...');
    const ws = new WebSocket(RELAY_WS);
    ws.binaryType = 'arraybuffer';

    set({ ws });

    ws.onopen = () => {
      console.log('WebSocket open — authenticating...');
      ws.send(JSON.stringify({ type: 'ADMIN_AUTH', token }));
      set({ isConnected: true });
    };

    ws.onclose = () => {
      console.log('WebSocket closed — will reconnect');
      set({ isConnected: false, isInSession: false, sessionId: null, ws: null });

      setTimeout(() => {
        const storedToken = localStorage.getItem('neovision_token');
        if (storedToken) {
          console.log('Reconnecting...');
          get().connect(storedToken);
        }
      }, 3000);
    };

    ws.onerror = (e) => {
      console.error('WebSocket error', e);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        get().onFrame?.(event.data);
        return;
      }

      try {
        const packet = JSON.parse(event.data);

        if (packet.type === 'AGENT_FRAME') {
          return; // Binary follows as next message
        }

        if (packet.type === 'SESSION_STARTED') {
          console.log('Session started:', packet.sessionId);
          set({ sessionId: packet.sessionId, isInSession: true });
        }

        if (packet.type === 'SESSION_ENDED') {
          console.log('Session ended');
          set({ sessionId: null, isInSession: false });
        }

        if (packet.type === 'ERROR') {
          console.error('Relay error:', packet.message);
        }
      } catch {
        // ignore
      }
    };
  },

  disconnect: () => {
    get().ws?.close();
    set({ ws: null, isConnected: false, isInSession: false, sessionId: null });
  },

  sendPacket: (packet: object) => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    } else {
      console.warn('WebSocket not open');
    }
  },

  setOnFrame: (fn) => set({ onFrame: fn }),
}));