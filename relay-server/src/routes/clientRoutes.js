'use strict';

const express = require('express');
const router  = express.Router();

const db           = require('../db/postgres');
const sessionStore = require('../services/sessionStore');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// All client routes require a valid admin JWT
router.use(requireAuth);

// ─── GET /clients ─────────────────────────────────────────────────────────────
/**
 * Returns all registered client devices with their live online status.
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, device_id, hostname, os_version, agent_version,
              is_online, last_seen_at, registered_at
       FROM clients
       ORDER BY last_seen_at DESC NULLS LAST`
    );

    // Enrich with live Redis presence (more accurate than the DB flag)
    const clients = await Promise.all(
      result.rows.map(async (client) => ({
        ...client,
        is_online: await sessionStore.isClientOnline(client.device_id),
      }))
    );

    return res.json({ clients });
  } catch (err) {
    logger.error('GET /clients error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── GET /clients/:id ─────────────────────────────────────────────────────────
/**
 * Returns a single client with its last 10 session records.
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const clientResult = await db.query(
      `SELECT id, device_id, hostname, os_version, agent_version,
              is_online, last_seen_at, registered_at
       FROM clients WHERE id = $1`,
      [id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const client = clientResult.rows[0];
    client.is_online = await sessionStore.isClientOnline(client.device_id);

    const sessionsResult = await db.query(
      `SELECT id, admin_id, started_at, ended_at, duration_secs
       FROM sessions
       WHERE client_id = $1
       ORDER BY started_at DESC
       LIMIT 10`,
      [id]
    );

    return res.json({ client, sessions: sessionsResult.rows });
  } catch (err) {
    logger.error('GET /clients/:id error', { error: err.message, clientId: id });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── GET /clients/:id/sessions ────────────────────────────────────────────────
/**
 * Returns full session + file transfer history for a client (paginated).
 */
router.get('/:id/sessions', async (req, res) => {
  const { id } = req.params;
  const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
  const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT s.id, s.admin_id, s.started_at, s.ended_at, s.duration_secs,
              json_agg(ft ORDER BY ft.transferred_at) FILTER (WHERE ft.id IS NOT NULL) AS file_transfers
       FROM sessions s
       LEFT JOIN file_transfers ft ON ft.session_id = s.id
       WHERE s.client_id = $1
       GROUP BY s.id
       ORDER BY s.started_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    return res.json({ sessions: result.rows, page, limit });
  } catch (err) {
    logger.error('GET /clients/:id/sessions error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
