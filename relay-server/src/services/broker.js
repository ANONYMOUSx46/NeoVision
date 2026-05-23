'use strict';

const { v4: uuidv4 } = require('uuid');
const db           = require('../db/postgres');
const sessionStore = require('./sessionStore');
const authService  = require('./authService');
const logger       = require('../utils/logger');

// In-memory map of WebSocket connections: socketId → ws instance
// This is process-local; for multi-process deployments use a Redis pub/sub bridge
const sockets = new Map();

// Packet type constants shared between relay, admin dashboard and client agent
const PacketType = {
  // Agent → relay
  AGENT_REGISTER:   'AGENT_REGISTER',
  AGENT_HEARTBEAT:  'AGENT_HEARTBEAT',
  AGENT_FRAME:      'AGENT_FRAME',       // compressed screen frame
  AGENT_EVENT_ACK:  'AGENT_EVENT_ACK',

  // Admin → relay
  ADMIN_AUTH:       'ADMIN_AUTH',
  ADMIN_CONNECT:    'ADMIN_CONNECT',     // request session with client
  ADMIN_DISCONNECT: 'ADMIN_DISCONNECT',
  ADMIN_INPUT:      'ADMIN_INPUT',       // mouse / keyboard event
  ADMIN_SCREENSHOT: 'ADMIN_SCREENSHOT',  // request a single frame
  ADMIN_RUN:        'ADMIN_RUN',         // execute a file / command
  ADMIN_FILE_CHUNK: 'ADMIN_FILE_CHUNK',  // file transfer chunk

  // Relay → client / admin
  SESSION_STARTED:  'SESSION_STARTED',
  SESSION_ENDED:    'SESSION_ENDED',
  ERROR:            'ERROR',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function sendError(ws, message) {
  send(ws, PacketType.ERROR, { message });
}

function generateSocketId() {
  return uuidv4();
}

// ─── Connection handler ───────────────────────────────────────────────────────

/**
 * Called by the WebSocket server for every new connection.
 * Each connection self-identifies within the first message as
 * either an admin dashboard or a client agent.
 */
async function handleConnection(ws, req) {
  const socketId = generateSocketId();
  ws.socketId    = socketId;
  ws.role        = null; // 'admin' | 'agent' — set after first auth message
  ws.sessionId   = null;
  ws.deviceId    = null;
  ws.adminId     = null;

  sockets.set(socketId, ws);
  logger.debug('WebSocket connected', { socketId, ip: req.socket.remoteAddress });

  ws.on('message', async (raw, isBinary) => {
    try {
      // Binary messages are screen frames — relay directly to peer
      if (isBinary || Buffer.isBuffer(raw)) {
        if (ws.peerSocketId) {
          const peer = sockets.get(ws.peerSocketId);
          if (peer && peer.readyState === peer.OPEN) {
            peer.send(raw, { binary: true });
          }
        }
        return;
      }
  
      const packet = JSON.parse(raw);
      await route(ws, packet);
    } catch (err) {
      logger.error('WebSocket message error', { socketId: ws.socketId, error: err.message });
      sendError(ws, 'Malformed packet.');
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', (err) => logger.error('WebSocket error', { socketId, error: err.message }));

  // Kick unauthenticated connections that don't send their first message within 10s
  ws._authTimeout = setTimeout(() => {
    if (!ws.role) {
      logger.warn('WebSocket auth timeout', { socketId });
      ws.terminate();
    }
  }, 10_000);
}

// ─── Packet router ────────────────────────────────────────────────────────────

async function route(ws, packet) {
  const { type } = packet;

  switch (type) {

    // ── Agent identifies itself ───────────────────────────────────────────────
    case PacketType.AGENT_REGISTER:
      return handleAgentRegister(ws, packet);

    // ── Agent heartbeat ───────────────────────────────────────────────────────
    case PacketType.AGENT_HEARTBEAT:
      return handleAgentHeartbeat(ws);

    // ── Admin authenticates ───────────────────────────────────────────────────
    case PacketType.ADMIN_AUTH:
      return handleAdminAuth(ws, packet);

    // ── Admin requests a session with a client ────────────────────────────────
    case PacketType.ADMIN_CONNECT:
      return handleAdminConnect(ws, packet);

    // ── Admin ends a session ──────────────────────────────────────────────────
    case PacketType.ADMIN_DISCONNECT:
      return handleAdminDisconnect(ws);

    // ── Packets that are relayed directly to the other party ──────────────────
    case PacketType.ADMIN_INPUT:
    case PacketType.ADMIN_SCREENSHOT:
    case PacketType.ADMIN_RUN:
    case PacketType.ADMIN_FILE_CHUNK:
    case PacketType.AGENT_FRAME:
    case PacketType.AGENT_EVENT_ACK:
      return handleRelay(ws, packet);

    default:
      sendError(ws, `Unknown packet type: ${type}`);
  }
}

// ─── Agent handlers ───────────────────────────────────────────────────────────

async function handleAgentRegister(ws, packet) {
  clearTimeout(ws._authTimeout);
  const { deviceId, hostname, osVersion, agentVersion } = packet;

  if (!deviceId || !hostname) {
    return sendError(ws, 'AGENT_REGISTER requires deviceId and hostname.');
  }

  try {
    // Upsert the client record
    await db.query(
      `INSERT INTO clients (device_id, hostname, os_version, agent_version, is_online, last_seen_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT (device_id) DO UPDATE
         SET hostname      = EXCLUDED.hostname,
             os_version    = EXCLUDED.os_version,
             agent_version = EXCLUDED.agent_version,
             is_online     = TRUE,
             last_seen_at  = NOW()`,
      [deviceId, hostname, osVersion || null, agentVersion || null]
    );

    await sessionStore.setClientOnline(deviceId, ws.socketId);

    ws.role     = 'agent';
    ws.deviceId = deviceId;

    logger.info('Agent registered', { deviceId, hostname });
  } catch (err) {
    logger.error('Agent register error', { error: err.message });
    sendError(ws, 'Registration failed.');
  }
}

async function handleAgentHeartbeat(ws) {
  if (ws.role !== 'agent' || !ws.deviceId) return;
  await sessionStore.refreshClientHeartbeat(ws.deviceId);
  await db.query('UPDATE clients SET last_seen_at = NOW() WHERE device_id = $1', [ws.deviceId]);
}

// ─── Admin handlers ───────────────────────────────────────────────────────────

async function handleAdminAuth(ws, packet) {
  clearTimeout(ws._authTimeout);
  const { token } = packet;

  if (!token) return sendError(ws, 'ADMIN_AUTH requires a token.');

  try {
    const payload = authService.verifyToken(token);
    if (payload.type !== 'admin') return sendError(ws, 'Invalid token type.');

    ws.role    = 'admin';
    ws.adminId = payload.sub;
    logger.info('Admin authenticated over WebSocket', { adminId: ws.adminId });
  } catch {
    sendError(ws, 'Invalid or expired token.');
    ws.terminate();
  }
}

async function handleAdminConnect(ws, packet) {
  if (ws.role !== 'admin') return sendError(ws, 'Not authenticated.');

  const { deviceId } = packet;
  if (!deviceId) return sendError(ws, 'ADMIN_CONNECT requires deviceId.');

  const clientSocketId = await sessionStore.getClientSocketId(deviceId);
  if (!clientSocketId) {
    return sendError(ws, 'Client is offline or not registered.');
  }

  const clientWs = sockets.get(clientSocketId);
  if (!clientWs || clientWs.readyState !== clientWs.OPEN) {
    await sessionStore.setClientOffline(deviceId);
    return sendError(ws, 'Client socket not available.');
  }

  // Create a DB session record and register it in Redis
  const sessionResult = await db.query(
    `INSERT INTO sessions (admin_id, client_id)
     SELECT $1, id FROM clients WHERE device_id = $2
     RETURNING id`,
    [ws.adminId, deviceId]
  );

  const sessionId = sessionResult.rows[0].id;
  await sessionStore.registerSession(sessionId, ws.socketId, clientSocketId);

  ws.sessionId       = sessionId;
  ws.peerSocketId    = clientSocketId;
  clientWs.sessionId = sessionId;
  clientWs.peerSocketId = ws.socketId;

  send(ws,       PacketType.SESSION_STARTED, { sessionId, deviceId });
  send(clientWs, PacketType.SESSION_STARTED, { sessionId });

  logger.info('Session started', { sessionId, adminId: ws.adminId, deviceId });
}

async function handleAdminDisconnect(ws) {
  await endSession(ws);
}

// ─── Relay ────────────────────────────────────────────────────────────────────

async function handleRelay(ws, packet) {
  if (!ws.peerSocketId) {
    return sendError(ws, 'No active session.');
  }

  const peer = sockets.get(ws.peerSocketId);
  if (!peer || peer.readyState !== peer.OPEN) {
    return sendError(ws, 'Peer is no longer connected.');
  }

  // Forward the raw packet to the peer unchanged
  peer.send(JSON.stringify(packet));

  // Log file transfers and shell commands to the session audit log
  if (packet.type === PacketType.ADMIN_FILE_CHUNK && packet.isLast && ws.sessionId) {
    await db.query(
      `INSERT INTO file_transfers (session_id, filename, file_size_bytes, auto_run)
       VALUES ($1, $2, $3, $4)`,
      [ws.sessionId, packet.filename, packet.totalBytes || null, packet.autoRun || false]
    );
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

async function handleDisconnect(ws) {
  sockets.delete(ws.socketId);
  logger.debug('WebSocket disconnected', { socketId: ws.socketId, role: ws.role });

  if (ws.role === 'agent' && ws.deviceId) {
    await sessionStore.setClientOffline(ws.deviceId);
    await db.query(
      'UPDATE clients SET is_online = FALSE WHERE device_id = $1',
      [ws.deviceId]
    );
  }

  if (ws.sessionId) {
    await endSession(ws);
  }
}

async function endSession(ws) {
  if (!ws.sessionId) return;

  const sessionId = ws.sessionId;
  ws.sessionId    = null;

  // Notify the peer
  if (ws.peerSocketId) {
    const peer = sockets.get(ws.peerSocketId);
    if (peer) {
      send(peer, PacketType.SESSION_ENDED, { sessionId });
      peer.sessionId    = null;
      peer.peerSocketId = null;
    }
    ws.peerSocketId = null;
  }

  // Persist session end time
  await db.query(
    'UPDATE sessions SET ended_at = NOW() WHERE id = $1',
    [sessionId]
  );
  await sessionStore.removeSession(sessionId);

  logger.info('Session ended', { sessionId });
}

module.exports = { handleConnection, PacketType };
