'use strict';

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { authenticator } = require('otplib');
const qrcode  = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db/postgres');
const config  = require('../config');
const logger  = require('../utils/logger');

// ─── Password ─────────────────────────────────────────────────────────────────

/**
 * Hash a plaintext password with bcrypt.
 */
async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, config.security.bcryptRounds);
}

/**
 * Verify a plaintext password against a stored hash.
 */
async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

/**
 * Issue a signed JWT for an admin.
 *
 * @param {object} admin - Admin row from the database
 * @returns {string} Signed JWT
 */
function issueToken(admin) {
  return jwt.sign(
    {
      sub:   admin.id,
      email: admin.email,
      type:  'admin',
    },
    config.security.jwtSecret,
    { expiresIn: config.security.jwtExpiresIn }
  );
}

/**
 * Verify a JWT and return its payload.
 * Throws if the token is invalid or expired.
 */
function verifyToken(token) {
  return jwt.verify(token, config.security.jwtSecret);
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

/**
 * Create the first admin account (used during initial setup only).
 * Returns the new admin row without the password hash.
 */
async function createAdmin(email, plainPassword) {
  const existing = await db.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new Error('An admin with that email already exists.');
  }

  const passwordHash = await hashPassword(plainPassword);
  const result = await db.query(
    `INSERT INTO admins (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, totp_enabled, created_at`,
    [email, passwordHash]
  );

  logger.info('Admin account created', { email });
  return result.rows[0];
}

/**
 * Authenticate an admin by email + password.
 * Returns the admin row on success, null on failure.
 */
async function authenticateAdmin(email, plainPassword) {
  const result = await db.query(
    'SELECT id, email, password_hash, totp_enabled, totp_secret FROM admins WHERE email = $1',
    [email]
  );

  const admin = result.rows[0];
  if (!admin) return null;

  const valid = await verifyPassword(plainPassword, admin.password_hash);
  if (!valid) return null;

  // Update last login timestamp
  await db.query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);

  return admin;
}

// ─── TOTP (2FA) ───────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret and a QR code data URL for the admin to scan.
 * Does NOT save the secret — call enableTotp() after the admin verifies.
 */
async function generateTotpSetup(adminEmail) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(adminEmail, 'NeoVision', secret);
  const qrCodeDataUrl = await qrcode.toDataURL(otpauth);

  return { secret, qrCodeDataUrl };
}

/**
 * Verify a TOTP token and, if valid, enable 2FA on the account.
 */
async function enableTotp(adminId, secret, token) {
  const valid = authenticator.verify({ token, secret });
  if (!valid) throw new Error('Invalid TOTP token.');

  await db.query(
    'UPDATE admins SET totp_secret = $1, totp_enabled = TRUE WHERE id = $2',
    [secret, adminId]
  );

  logger.info('TOTP enabled for admin', { adminId });
}

/**
 * Verify a TOTP token for an admin that already has 2FA enabled.
 */
async function verifyTotp(adminId, token) {
  const result = await db.query(
    'SELECT totp_secret FROM admins WHERE id = $1 AND totp_enabled = TRUE',
    [adminId]
  );

  const admin = result.rows[0];
  if (!admin) throw new Error('TOTP not configured for this admin.');

  return authenticator.verify({ token, secret: admin.totp_secret });
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  verifyToken,
  createAdmin,
  authenticateAdmin,
  generateTotpSetup,
  enableTotp,
  verifyTotp,
};
