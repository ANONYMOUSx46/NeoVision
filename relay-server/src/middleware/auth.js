'use strict';

const { verifyToken } = require('../services/authService');
const logger = require('../utils/logger');

/**
 * Express middleware that validates the Bearer JWT on protected routes.
 * Attaches the decoded payload to req.admin on success.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);

    if (payload.type !== 'admin') {
      return res.status(403).json({ error: 'Token type not permitted.' });
    }

    req.admin = payload;
    next();
  } catch (err) {
    logger.warn('JWT validation failed', { error: err.message, ip: req.ip });
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAuth };
