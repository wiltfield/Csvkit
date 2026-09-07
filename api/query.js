const { Client } = require('pg');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { connectionString, sql } = req.body || {};

  if (!connectionString || typeof connectionString !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid connectionString.' });
  }

  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return res.status(400).json({ error: 'Missing or empty SQL query.' });
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
  } catch (err) {
    await client.end().catch(() => {});
    return res.status(502).json({ error: `Could not connect to database: ${err.message}` });
  }

  try {
    const result = await client.query(sql);
    await client.end();

    // result can be an array if multiple statements were run (pg returns array in that case)
    const rows = Array.isArray(result) ? result[result.length - 1].rows : result.rows;
    const fields = Array.isArray(result)
      ? result[result.length - 1].fields.map(f => f.name)
      : result.fields.map(f => f.name);

    return res.status(200).json({ columns: fields, rows });
  } catch (err) {
    await client.end().catch(() => {});
    return res.status(400).json({ error: `Query failed: ${err.message}` });
  }
};
