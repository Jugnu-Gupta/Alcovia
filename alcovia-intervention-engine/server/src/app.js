require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
const studentRoutes = require('./routes/studentRoutes');

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['*'];

if (allowedOrigins.includes('*')) {
    app.use(cors());
} else {
    app.use(cors({ origin: allowedOrigins, credentials: true }));
}
app.use(express.json());
app.use('/api', studentRoutes);

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong!' });
});

async function bootstrap() {
    await initializeDatabase();
}

module.exports = {
    app,
    bootstrap
};
