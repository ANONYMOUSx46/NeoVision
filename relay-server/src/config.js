'use strict';

require('dotenv').config();

/**
 * Central configuration — all env vars are validated here at startup.
 * If a required variable is missing the process exits immediately with
 * a clear message rather than failing silently later.
 */

function required(key) {
  const value = process.env[key];
  if (!value || value.startsWith('REPLACE_WITH')) {
    console.error(`[config] Missing required environment variable: ${key}`);
    process.exit(1);
  }
  return value;
}

function optional(key, defaultValue) {
  return process.env[key] || defaultValue;
}

const config = {
  env: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  server: {
    port: parseInt(optional('PORT', '3000'), 10),
  },

  security: {
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
    wsTokenSecret: required('WS_TOKEN_SECRET'),
    bcryptRounds: 12,
  },

  db: {
    connectionString: required('DATABASE_URL'),
    poolMax: 10,
    poolIdleTimeoutMs: 30000,
    connectionTimeoutMs: 5000,
  },

  redis: {
    url: required('REDIS_URL'),
    sessionTtlSeconds: 60 * 60 * 8, // 8 hours
    clientTtlSeconds: 60 * 5,        // 5 min heartbeat window
  },

  cors: {
    allowedOrigin: optional('ALLOWED_ORIGIN', 'http://localhost:5173'),
  },

  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    max: parseInt(optional('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  },
};

module.exports = config;
