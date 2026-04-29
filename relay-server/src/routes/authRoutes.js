'use strict';

const express = require('express');
const router  = express.Router();

const authService  = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// ─── POST /auth/login ─────────────────────────────────────────────────────────
/**
 * Step 1 of login: email + password.
 * If TOTP is enabled on the account, returns { requiresTotp: true, tempToken }.
 * If TOTP is not yet set up, returns a full JWT immediately.
 */
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const admin = await authService.authenticateAdmin(email, password);

    if (!admin) {
      logger.warn('Failed login attempt', { email, ip: req.ip });
      // Generic message — don't reveal whether email exists
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (admin.totp_enabled) {
      // Issue a short-lived temp token so the client can submit the TOTP code
      const tempToken = authService.issueToken({ ...admin, type: 'totp-pending' });
      return res.json({ requiresTotp: true, tempToken });
    }

    const token = authService.issueToken(admin);
    logger.info('Admin logged in', { adminId: admin.id });
    return res.json({ token });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── POST /auth/totp/verify ───────────────────────────────────────────────────
/**
 * Step 2 of login (TOTP accounts only).
 * Accepts the tempToken from /login and the 6-digit TOTP code.
 * Returns a full JWT on success.
 */
router.post('/totp/verify', authLimiter, async (req, res) => {
  const { tempToken, totpCode } = req.body;

  if (!tempToken || !totpCode) {
    return res.status(400).json({ error: 'tempToken and totpCode are required.' });
  }

  try {
    const payload = authService.verifyToken(tempToken);

    if (payload.type !== 'totp-pending') {
      return res.status(403).json({ error: 'Invalid token type.' });
    }

    const valid = await authService.verifyTotp(payload.sub, totpCode);
    if (!valid) {
      logger.warn('Invalid TOTP code', { adminId: payload.sub, ip: req.ip });
      return res.status(401).json({ error: 'Invalid TOTP code.' });
    }

    // Upgrade to a full admin token
    const fullToken = authService.issueToken({ id: payload.sub, email: payload.email });
    logger.info('Admin completed TOTP login', { adminId: payload.sub });
    return res.json({ token: fullToken });
  } catch (err) {
    logger.error('TOTP verify error', { error: err.message });
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// ─── POST /auth/totp/setup ────────────────────────────────────────────────────
/**
 * Initiate TOTP setup for the logged-in admin.
 * Returns a QR code data URL to scan with an authenticator app.
 */
router.post('/totp/setup', requireAuth, async (req, res) => {
  try {
    const { secret, qrCodeDataUrl } = await authService.generateTotpSetup(req.admin.email);
    // Store the secret temporarily in the response — the client must verify
    // before it is persisted (enableTotp is called on /totp/enable)
    return res.json({ secret, qrCodeDataUrl });
  } catch (err) {
    logger.error('TOTP setup error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── POST /auth/totp/enable ───────────────────────────────────────────────────
/**
 * Finalise TOTP setup — the admin submits the secret (from /setup) and
 * a valid code to prove they scanned it correctly.
 */
router.post('/totp/enable', requireAuth, async (req, res) => {
  const { secret, totpCode } = req.body;

  if (!secret || !totpCode) {
    return res.status(400).json({ error: 'secret and totpCode are required.' });
  }

  try {
    await authService.enableTotp(req.admin.sub, secret, totpCode);
    return res.json({ message: 'Two-factor authentication enabled successfully.' });
  } catch (err) {
    logger.warn('TOTP enable failed', { error: err.message, adminId: req.admin.sub });
    return res.status(400).json({ error: err.message });
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
/**
 * Returns the currently authenticated admin's basic info.
 * Useful for the dashboard to validate a stored token on load.
 */
router.get('/me', requireAuth, (req, res) => {
  return res.json({
    id:    req.admin.sub,
    email: req.admin.email,
  });
});

module.exports = router;
