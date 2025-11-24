require('dotenv').config();
const { initializeDatabase } = require('../src/config/database');

initializeDatabase()
    .then(() => {
        console.log('Database initialized successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });
