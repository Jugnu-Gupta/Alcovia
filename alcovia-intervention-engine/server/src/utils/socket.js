let ioInstance = null;

function registerSocket(io) {
    ioInstance = io;
}

function getSocket() {
    if (!ioInstance) {
        throw new Error('Socket.io instance has not been initialized');
    }
    return ioInstance;
}

module.exports = {
    registerSocket,
    getSocket
};
