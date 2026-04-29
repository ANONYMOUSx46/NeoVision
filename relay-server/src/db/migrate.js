"use strict";

/**
 * Migration runner — reads all SQL files from migrations/ in order
 * and executes them against the configured database.
 *
 * Usage: node src/db/migrate.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("../config");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function run() {
  const pool = new Pool({
    connectionString: config.db.connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[migrate] Running ${file}…`);
      await pool.query(sql);
      console.log(`[migrate] ✓ ${file}`);
    }

    console.log("[migrate] All migrations complete.");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[migrate] Failed:", err.message);
  process.exit(1);
});
