const http = require('http');
const { app, bootstrap } = require('./app');
const { createSocketServer } = require('./utils/createSocketServer');

const PORT = process.env.PORT || 5000;

async function startServer() {
    await bootstrap();

    const server = http.createServer(app);
    createSocketServer(server);

    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    return server;
}

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

module.exports = {
    startServer
};
