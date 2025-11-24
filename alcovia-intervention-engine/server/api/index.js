const http = require('http');
const { app, bootstrap } = require('../src/app');
const { createSocketServer } = require('../src/utils/createSocketServer');

let server;
let bootstrapPromise;

async function ensureServer() {
    if (!bootstrapPromise) {
        bootstrapPromise = bootstrap();
    }

    await bootstrapPromise;

    if (!server) {
        server = http.createServer(app);
        createSocketServer(server);
    }

    return server;
}

module.exports = async function handler(req, res) {
    const activeServer = await ensureServer();

    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        activeServer.emit('upgrade', req, req.socket, Buffer.alloc(0));
        return;
    }

    await new Promise((resolve, reject) => {
        res.on('finish', resolve);
        res.on('close', resolve);
        res.on('error', reject);
        activeServer.emit('request', req, res);
    });
};

module.exports.config = {
    api: {
        bodyParser: false,
    },
};
