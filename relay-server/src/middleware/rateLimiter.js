'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * General API rate limiter — applied to all routes.
 */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Strict limiter for auth endpoints to slow down brute-force attempts.
 * 10 attempts per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
});

module.exports = { apiLimiter, authLimiter };
