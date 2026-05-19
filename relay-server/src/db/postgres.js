"use strict";

const { Pool } = require("pg");
const config = require("../config");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.poolIdleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  logger.error("PostgreSQL pool error", { error: err.message });
});

/**
 * Execute a parameterised query.
 *
 * @param {string} text - SQL with $1, $2 … placeholders
 * @param {Array}  params
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug("SQL query executed", { duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error("SQL query failed", { error: err.message, query: text });
    throw err;
  }
}

/**
 * Acquire a client for multi-statement transactions.
 * Always call client.release() in a finally block.
 */
async function getClient() {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);

  // Wrap release to log if the client is held too long (connection leak guard)
  const timeout = setTimeout(() => {
    logger.warn("PostgreSQL client held for >10s — possible connection leak");
  }, 10_000);

  client.release = () => {
    clearTimeout(timeout);
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
}

/**
 * Test the connection on startup.
 */
async function testConnection() {
  const result = await query("SELECT NOW() AS now");
  logger.info("PostgreSQL connected", { serverTime: result.rows[0].now });
}

module.exports = { query, getClient, testConnection };
