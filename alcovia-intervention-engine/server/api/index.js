const http = require('http');
const { app, bootstrap } = require('../src/app');
// socket server removed for stateless deployment

let server;
let bootstrapPromise;

async function ensureServer() {
    if (!bootstrapPromise) {
        bootstrapPromise = bootstrap();
    }

    await bootstrapPromise;

    if (!server) {
        server = http.createServer(app);
    }

    return server;
}

async function handler(req, res) {
    const activeServer = await ensureServer();

    // Forward normal HTTP requests to the Express app
    await new Promise((resolve, reject) => {
        res.on('finish', resolve);
        res.on('close', resolve);
        res.on('error', reject);
        activeServer.emit('request', req, res);
    });
}

// Export in a shape compatible with Vercel
module.exports = handler;
exports.default = handler;
exports.config = {
    api: {
        bodyParser: false,
        externalResolver: true
    }
};
