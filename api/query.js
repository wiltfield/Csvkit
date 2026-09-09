const { Client } = require('pg');
const mysql = require('mysql2/promise');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const MYSQL_DIALECTS = new Set(['mysql', 'mariadb']);

function connectError(err) {
  const e = new Error(`Could not connect to database: ${err.message}`);
  e.status = 502;
  return e;
}

function queryError(err) {
  const e = new Error(`Query failed: ${err.message}`);
  e.status = 400;
  return e;
}

async function handlePgQuery(connectionString, sql) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await client.connect();
  } catch (err) {
    await client.end().catch(() => {});
    throw connectError(err);
  }

  try {
    let detectedDialect = 'postgresql';
    try {
      const v = await client.query('SELECT version()');
      if (/cockroachdb/i.test(v.rows[0]?.version || '')) detectedDialect = 'cockroachdb';
    } catch (err) {
      // detection is best-effort, never block the actual query on it
    }

    await client.query('SET statement_timeout = 15000');
    const result = await client.query(sql);

    // result can be an array if multiple statements were run (pg returns array in that case)
    const rows = Array.isArray(result) ? result[result.length - 1].rows : result.rows;
    const fields = Array.isArray(result)
      ? result[result.length - 1].fields.map((f) => f.name)
      : result.fields.map((f) => f.name);

    return { rows, fields, detectedDialect };
  } catch (err) {
    throw queryError(err);
  } finally {
    await client.end().catch(() => {});
  }
}

async function handleMysqlQuery(connectionString, sql) {
  let conn;
  try {
    conn = await mysql.createConnection({ uri: connectionString, connectTimeout: 8000 });
  } catch (err) {
    throw connectError(err);
  }

  try {
    let detectedDialect = 'mysql';
    try {
      const [vRows] = await conn.query('SELECT VERSION() AS v');
      if (/mariadb/i.test(vRows[0]?.v || '')) detectedDialect = 'mariadb';
    } catch (err) {
      // detection is best-effort
    }

    try {
      if (detectedDialect === 'mysql') {
        await conn.query('SET SESSION MAX_EXECUTION_TIME=15000');
      } else {
        await conn.query('SET SESSION max_statement_time=15');
      }
    } catch (err) {
      // not all hosts allow session-level timeout settings, ignore if unsupported
    }

    const [rows, fields] = await conn.query(sql);
    const rowsArr = Array.isArray(rows) ? rows : [];
    const fieldNames = fields
      ? fields.map((f) => f.name)
      : rowsArr[0]
        ? Object.keys(rowsArr[0])
        : [];

    return { rows: rowsArr, fields: fieldNames, detectedDialect };
  } catch (err) {
    throw queryError(err);
  } finally {
    await conn.end().catch(() => {});
  }
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
  }
  body = body || {};

  const { connectionString, sql, dialect } = body;

  if (!connectionString || typeof connectionString !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid connectionString.' });
  }

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return res.status(400).json({ error: 'Missing or empty SQL query.' });
  }

  const useMysql = MYSQL_DIALECTS.has(dialect);

  try {
    const result = useMysql
      ? await handleMysqlQuery(connectionString, sql)
      : await handlePgQuery(connectionString, sql);

    return res.status(200).json({
      columns: result.fields,
      rows: result.rows,
      detectedDialect: result.detectedDialect,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
};
