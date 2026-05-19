require('dotenv').config();
const db = require('./src/db/postgres');

db.query('SELECT id, email, created_at FROM admins')
  .then(r => {
    console.log('Admins:', r.rows);
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });