const socketIo = require('socket.io');
const { registerSocket } = require('../utils/socket');

function getAllowedOrigins() {
    const origins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
        : [];

    return origins.length > 0 ? origins : ['*'];
}

function createSocketServer(server) {
    const allowedOrigins = getAllowedOrigins();

    const io = socketIo(server, {
        cors: {
            origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
            methods: ['GET', 'POST']
        }
    });

    registerSocket(io);

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('join_student', (studentId) => {
            socket.join(`student_${studentId}`);
            console.log(`Student ${studentId} joined their room`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
}

module.exports = {
    createSocketServer,
};