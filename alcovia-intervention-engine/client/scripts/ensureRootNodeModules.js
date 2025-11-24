const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const target = path.join(projectRoot, 'node_modules');

try {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
        console.log(`[build] Created missing directory: ${target}`);
    }
} catch (err) {
    console.warn(`[build] Failed to ensure ${target}: ${err.message}`);
}
