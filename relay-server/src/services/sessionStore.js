"use strict";

const Redis = require("ioredis");
const config = require("../config");
const logger = require("../utils/logger");

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
  tls: {},
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis error", { error: err.message }));

// ─── Key helpers ─────────────────────────────────────────────────────────────

const keys = {
  clientOnline: (deviceId) => `client:online:${deviceId}`,
  clientSocket: (deviceId) => `client:socket:${deviceId}`,
  adminSession: (sessionId) => `session:admin:${sessionId}`,
  activeSessions: "sessions:active",
};

// ─── Client presence ─────────────────────────────────────────────────────────

/**
 * Mark a client agent as online and store its socket ID.
 */
async function setClientOnline(deviceId, socketId) {
  const pipeline = redis.pipeline();
  pipeline.set(
    keys.clientOnline(deviceId),
    "1",
    "EX",
    config.redis.clientTtlSeconds,
  );
  pipeline.set(
    keys.clientSocket(deviceId),
    socketId,
    "EX",
    config.redis.clientTtlSeconds,
  );
  await pipeline.exec();
}

/**
 * Refresh the TTL on a client's presence keys (called on heartbeat).
 */
async function refreshClientHeartbeat(deviceId) {
  const pipeline = redis.pipeline();
  pipeline.expire(keys.clientOnline(deviceId), config.redis.clientTtlSeconds);
  pipeline.expire(keys.clientSocket(deviceId), config.redis.clientTtlSeconds);
  await pipeline.exec();
}

/**
 * Mark a client agent as offline (remove presence keys).
 */
async function setClientOffline(deviceId) {
  await redis.del(keys.clientOnline(deviceId), keys.clientSocket(deviceId));
}

/**
 * Look up the WebSocket socket ID for a connected client.
 * Returns null if the client is offline.
 */
async function getClientSocketId(deviceId) {
  return redis.get(keys.clientSocket(deviceId));
}

/**
 * Check whether a client is currently online.
 */
async function isClientOnline(deviceId) {
  return (await redis.exists(keys.clientOnline(deviceId))) === 1;
}

// ─── Active session tracking ─────────────────────────────────────────────────

/**
 * Register an active session between an admin and a client.
 */
async function registerSession(sessionId, adminSocketId, clientSocketId) {
  const data = JSON.stringify({
    adminSocketId,
    clientSocketId,
    startedAt: Date.now(),
  });
  await redis.set(
    keys.adminSession(sessionId),
    data,
    "EX",
    config.redis.sessionTtlSeconds,
  );
  await redis.sadd(keys.activeSessions, sessionId);
}

/**
 * Retrieve session metadata by session ID.
 */
async function getSession(sessionId) {
  const raw = await redis.get(keys.adminSession(sessionId));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Remove a session (called when admin or client disconnects).
 */
async function removeSession(sessionId) {
  await redis.del(keys.adminSession(sessionId));
  await redis.srem(keys.activeSessions, sessionId);
}

/**
 * Return the count of currently active sessions.
 */
async function activeSessionCount() {
  return redis.scard(keys.activeSessions);
}

// ─── Health check ────────────────────────────────────────────────────────────

async function ping() {
  const reply = await redis.ping();
  return reply === "PONG";
}

module.exports = {
  redis,
  setClientOnline,
  refreshClientHeartbeat,
  setClientOffline,
  getClientSocketId,
  isClientOnline,
  registerSession,
  getSession,
  removeSession,
  activeSessionCount,
  ping,
};
