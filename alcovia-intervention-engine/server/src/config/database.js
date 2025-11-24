const { Pool } = require('pg');
const { URL } = require('url');

let pool;
let cachedConfig;

function buildPoolConfig() {
    const config = {};

    if (process.env.DATABASE_URL) {
        config.connectionString = process.env.DATABASE_URL;
    } else if (process.env.DB_HOST) {
        config.host = process.env.DB_HOST;
        config.port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432;
        config.user = process.env.DB_USER;
        config.password = process.env.DB_PASSWORD;
        config.database = process.env.DB_NAME;
    } else {
        throw new Error('DATABASE_URL (or DB_* env vars) must be set to connect to Postgres.');
    }

    const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
    if (sslMode === 'require') {
        config.ssl = { rejectUnauthorized: false };
    } else if (sslMode === 'verify-full') {
        config.ssl = true;
    }

    return config;
}

function getPool(configOverride) {
    if (!pool) {
        const config = configOverride || buildPoolConfig();
        pool = new Pool(config);
        cachedConfig = config;
        pool.on('error', (err) => {
            console.error('[DB] Unexpected Postgres client error:', err);
        });
        console.log('[DB] Connected to Postgres using configured credentials.');
    }
    return pool;
}

async function runMigrations(client) {
    await client.query('BEGIN');

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS students (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                status TEXT DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_logs (
                id SERIAL PRIMARY KEY,
                student_id TEXT NOT NULL REFERENCES students (id),
                quiz_score INTEGER NOT NULL,
                focus_minutes INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS interventions (
                id SERIAL PRIMARY KEY,
                student_id TEXT NOT NULL REFERENCES students (id),
                task_description TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                assigned_at TIMESTAMP DEFAULT NOW(),
                completed_at TIMESTAMP
            )
        `);

        await client.query(
            `INSERT INTO students (id, name, email)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
            ['student_123', 'Test Student', 'student@example.com']
        );

        await client.query(
            `INSERT INTO students (id, name, email)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
            ['student-001', 'Legacy Student', 'legacy.student@example.com']
        );

        await client.query(
            `INSERT INTO students (id, name, email)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
            ['student 123', 'Requested Student', 'student.123@example.com']
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
}

function getActiveConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }

    cachedConfig = buildPoolConfig();
    return cachedConfig;
}

async function ensureDatabaseExists(baseConfig) {
    if (!baseConfig.connectionString) {
        return;
    }

    try {
        const url = new URL(baseConfig.connectionString);
        const rawPath = url.pathname.replace(/^\//, '');
        if (!rawPath) {
            return;
        }

        const databaseName = rawPath.split('?')[0];
        if (!databaseName) {
            return;
        }

        if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
            console.warn(`[DB] Skipping automatic database creation for unexpected database name "${databaseName}".`);
            return;
        }

        const adminUrl = new URL(url.toString());
        adminUrl.pathname = '/postgres';

        const adminConfig = {
            connectionString: adminUrl.toString(),
        };

        if (baseConfig.ssl) {
            adminConfig.ssl = baseConfig.ssl;
        }

        const adminPool = new Pool(adminConfig);

        try {
            const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
            if (exists.rowCount === 0) {
                await adminPool.query(`CREATE DATABASE "${databaseName}"`);
                console.log(`[DB] Created database "${databaseName}" because it was missing.`);
            }
        } finally {
            await adminPool.end();
        }
    } catch (err) {
        console.warn('[DB] Database existence check skipped:', err.message);
    }
}

async function initializeDatabase() {
    const config = getActiveConfig();
    await ensureDatabaseExists(config);

    const activePool = getPool(config);
    try {
        const client = await activePool.connect();
        try {
            await runMigrations(client);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[DB] Database initialization failed:', err);
        throw err;
    }
}

function query(text, params) {
    return getPool(getActiveConfig()).query(text, params);
}

module.exports = {
    get pool() {
        return getPool(getActiveConfig());
    },
    query,
    initializeDatabase,
};
