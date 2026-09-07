const { Client } = require('pg');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON body.' })
    };
  }

  const { connectionString, sql } = body;

  if (!connectionString || typeof connectionString !== 'string') {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing or invalid connectionString.' })
    };
  }

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Missing or empty SQL query.' })
    };
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000
  });

  try {
    await client.connect();
  } catch (err) {
    await client.end().catch(() => {});
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Could not connect to database: ${err.message}` })
    };
  }

  try {
    await client.query('SET statement_timeout = 15000');
    const result = await client.query(sql);
    await client.end();

    // result can be an array if multiple statements were run (pg returns array in that case)
    const rows = Array.isArray(result) ? result[result.length - 1].rows : result.rows;
    const fields = Array.isArray(result)
      ? result[result.length - 1].fields.map(f => f.name)
      : result.fields.map(f => f.name);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ columns: fields, rows })
    };
  } catch (err) {
    await client.end().catch(() => {});
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Query failed: ${err.message}` })
    };
  }
};
