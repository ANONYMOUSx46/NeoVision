require('dotenv').config();
const auth = require('./src/services/authService');

auth.authenticateAdmin('dwliamdw@gmail.com', 'JUSTkeepSWIMMING97')
  .then(result => {
    console.log('Login result:', result);
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });