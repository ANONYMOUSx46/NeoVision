'use strict';

const http    = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const helmet  = require('helmet');
const cors    = require('cors');
const url     = require('url');

const config       = require('./config');
const logger       = require('./utils/logger');
const db           = require('./db/postgres');
const sessionStore = require('./services/sessionStore');
const broker       = require('./services/broker');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes   = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss:'],
    },
  },
}));

// CORS — only allow the admin dashboard origin
app.use(cors({
  origin: config.cors.allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

// Trust proxy headers (required for Railway / Vercel deployments)
app.set('trust proxy', 1);

// ─── HTTP routes ──────────────────────────────────────────────────────────────

app.use('/auth',    authRoutes);
app.use('/clients', clientRoutes);

// Health check — used by Railway and uptime monitors
app.get('/health', async (_req, res) => {
  try {
    const [dbOk, redisOk] = await Promise.all([
      db.query('SELECT 1').then(() => true).catch(() => false),
      sessionStore.ping(),
    ]);

    const status = dbOk && redisOk ? 'ok' : 'degraded';
    return res.status(dbOk && redisOk ? 200 : 503).json({
      status,
      db:    dbOk    ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      uptime: process.uptime(),
    });
  } catch {
    return res.status(503).json({ status: 'error' });
  }
});

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/ws',
  // Limit incoming message size to 16 MB (covers large screen frames)
  maxPayload: 16 * 1024 * 1024,
});

wss.on('connection', (ws, req) => broker.handleConnection(ws, req));

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start() {
  logger.info('NeoVision relay server starting…', { env: config.env });

  // Verify database connectivity before accepting traffic
  await db.testConnection();

  // Verify Redis connectivity
  const redisOk = await sessionStore.ping();
  if (!redisOk) throw new Error('Redis connection failed.');
  logger.info('Redis connected');

  server.listen(config.server.port, () => {
    logger.info(`Relay server listening`, { port: config.server.port });
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force-close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Startup failed', { error: err.message });
  process.exit(1);
});
