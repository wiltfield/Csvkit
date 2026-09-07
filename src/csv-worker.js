// Runs CSV parsing/processing off the main thread so large files don't
// freeze the UI, and the terminal message stays true to what's happening.

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

function filterBody(body, filterCol, pattern) {
  if (filterCol == null || !pattern) return body;
  const needle = pattern.toLowerCase();
  return body.filter((r) => (r[filterCol] ?? '').toLowerCase().includes(needle));
}

function sortBody(body, sortCol, sortDir) {
  if (sortCol == null) return body;
  return [...body].sort((a, b) => {
    const av = a[sortCol] ?? '';
    const bv = b[sortCol] ?? '';
    const an = parseFloat(av);
    const bn = parseFloat(bv);
    let cmp;
    if (!isNaN(an) && !isNaN(bn) && av.trim() !== '' && bv.trim() !== '') cmp = an - bn;
    else cmp = av.localeCompare(bv);
    return sortDir === 'desc' ? -cmp : cmp;
  });
}

// csvcut: keep only the given column indices, in the order given (matches
// real csvkit's csvcut, which both selects and reorders columns).
// changed = the kept/ordered indices differ from the original 0..n-1 order.
function cutColumns(rows, indices) {
  const header = rows[0] || [];
  const original = header.map((_, i) => i);
  const changed =
    indices.length !== original.length ||
    indices.some((idx, i) => idx !== original[i]);
  return { rows: rows.map((r) => indices.map((i) => r[i] ?? '')), changed };
}

// csvgrep: filter rows to those where a column matches a pattern (matches
// real csvkit's csvgrep, no column selection).
// changed = the filtered row count differs from the original row count.
function grepRows(rows, colIndex, pattern) {
  const [header, ...body] = rows;
  const filtered = filterBody(body, colIndex, pattern);
  const changed = filtered.length !== body.length;
  return { rows: [header, ...filtered], changed };
}

// changed = the new row order differs from the original row order.
function sortRows(rows, colIndex, dir) {
  const [header, ...body] = rows;
  const sorted = sortBody(body, colIndex, dir);
  const changed = sorted.some((r, i) => r !== body[i]);
  return { rows: [header, ...sorted], changed };
}

// csvstat: summary stats per column. Output is its own table (Column,
// Type, Unique, Nulls, Min, Max, Mean), not a subset/reorder of the input,
// so there's no natural "changed" flag here, the page compares successive
// stats results itself to catch a no-op re-run.
function statColumns(rows) {
  const [header, ...body] = rows;
  if (!header || !header.length) return { rows: [] };

  const outHeader = ['Column', 'Type', 'Unique', 'Nulls', 'Min', 'Max', 'Mean'];
  const outBody = header.map((name, idx) => {
    const values = body.map((r) => r[idx] ?? '');
    const nonEmpty = values.filter((v) => v.trim() !== '');
    const nums = nonEmpty.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
    const isNumeric = nonEmpty.length > 0 && nums.length === nonEmpty.length;
    const unique = new Set(values).size;
    const nulls = values.length - nonEmpty.length;

    let min = '';
    let max = '';
    let mean = '';
    if (isNumeric) {
      min = String(Math.min(...nums));
      max = String(Math.max(...nums));
      mean = (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
    } else if (nonEmpty.length) {
      const sorted = [...nonEmpty].sort();
      min = sorted[0];
      max = sorted[sorted.length - 1];
    }

    return [name, isNumeric ? 'Number' : 'Text', String(unique), String(nulls), min, max, mean];
  });

  return { rows: [outHeader, ...outBody] };
}

// csvjoin: inner join on a chosen column from each side (matches real
// csvkit's default inner join). Right join column is dropped from the
// output since it's redundant with the left one.
function joinRows(leftRows, rightRows, leftCol, rightCol) {
  const [lHeader, ...lBody] = leftRows;
  const [rHeader, ...rBody] = rightRows;

  const rIndex = new Map();
  rBody.forEach((r) => {
    const key = r[rightCol] ?? '';
    if (!rIndex.has(key)) rIndex.set(key, []);
    rIndex.get(key).push(r);
  });

  const outHeader = [...lHeader, ...rHeader.filter((_, i) => i !== rightCol)];
  const outBody = [];
  lBody.forEach((lr) => {
    const key = lr[leftCol] ?? '';
    const matches = rIndex.get(key) || [];
    matches.forEach((rr) => {
      outBody.push([...lr, ...rr.filter((_, i) => i !== rightCol)]);
    });
  });

  return { rows: [outHeader, ...outBody] };
}

// csvstack: concatenate rows from 2+ files that all share the same header
// (matches real csvkit's csvstack). Files with a different column set are
// rejected rather than silently padded/dropped.
function stackRows(filesRows) {
  const headerKey = (rows) => JSON.stringify(rows[0] || []);
  const firstKey = headerKey(filesRows[0]);
  const mismatch = filesRows.some((rows) => headerKey(rows) !== firstKey);
  if (mismatch) {
    return { error: 'Columns don\u2019t match across the files you added.' };
  }
  const header = filesRows[0][0] || [];
  const body = [];
  filesRows.forEach((rows) => body.push(...rows.slice(1)));
  return { rows: [header, ...body] };
}

// csvclean: fix common formatting errors (matches real csvkit's csvclean
// intent, scoped to what's realistic client-side): trims stray whitespace
// in cells, drops fully blank rows, and pads/truncates ragged rows so
// every row matches the header's column count.
// changed = any of those fixes actually applied to at least one row.
function cleanRows(rows) {
  const header = rows[0] || [];
  const targetLen = header.length;
  let trimmedCount = 0;
  let raggedCount = 0;
  let blankCount = 0;
  const outBody = [];

  for (let i = 1; i < rows.length; i++) {
    let r = rows[i];
    const trimmed = r.map((c) => (typeof c === 'string' ? c.trim() : c));
    if (trimmed.some((c, idx) => c !== r[idx])) trimmedCount++;
    r = trimmed;

    if (r.every((c) => c === '')) { blankCount++; continue; }

    if (r.length !== targetLen) {
      raggedCount++;
      r = r.length < targetLen
        ? [...r, ...Array(targetLen - r.length).fill('')]
        : r.slice(0, targetLen);
    }
    outBody.push(r);
  }

  const changed = trimmedCount > 0 || raggedCount > 0 || blankCount > 0;
  return { rows: [header, ...outBody], changed, stats: { trimmedCount, raggedCount, blankCount } };
}

// csvjson: convert parsed rows into a JSON array of objects, keyed by the
// header row. Output isn't a rows table so there's no "changed" flag here,
// same as csvstat, the page compares successive JSON strings itself.
function toJSON(rows) {
  const [header, ...body] = rows;
  if (!header || !header.length) return { json: '[]' };
  const objs = body.map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
  return { json: JSON.stringify(objs, null, 2) };
}

// csvsql: infer a SQL column type per column, then generate a CREATE
// TABLE + INSERT INTO statement block (matches real csvkit's csvsql
// --insert generation, minus actually running it against a database,
// which needs a backend). Type inference order: INTEGER (all values are
// whole numbers) -> REAL (all values are numeric) -> BOOLEAN (all values
// are true/false, case-insensitive) -> TEXT (fallback). Empty cells never
// disqualify a column from a numeric/boolean type, they become NULL.
//
// Inference produces logical types (INTEGER/REAL/BOOLEAN/TEXT); each
// dialect below maps those to its own concrete SQL type name, identifier
// quoting style, and boolean literal, since these vary a lot across
// engines (e.g. SQLite/MySQL have no native boolean, MSSQL uses brackets
// for identifiers, Oracle prefers NUMBER over INT/FLOAT).
const DIALECTS = {
  postgresql: {
    label: 'PostgreSQL',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'INTEGER', REAL: 'REAL', BOOLEAN: 'BOOLEAN', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? 'TRUE' : 'FALSE'),
  },
  mysql: {
    label: 'MySQL',
    quote: (name) => '`' + String(name ?? '').replace(/`/g, '``') + '`',
    types: { INTEGER: 'INT', REAL: 'DOUBLE', BOOLEAN: 'TINYINT(1)', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? '1' : '0'),
  },
  mariadb: {
    label: 'MariaDB',
    quote: (name) => '`' + String(name ?? '').replace(/`/g, '``') + '`',
    types: { INTEGER: 'INT', REAL: 'DOUBLE', BOOLEAN: 'TINYINT(1)', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? '1' : '0'),
  },
  sqlite: {
    label: 'SQLite',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    // SQLite has no native boolean type, it's stored as INTEGER 0/1.
    types: { INTEGER: 'INTEGER', REAL: 'REAL', BOOLEAN: 'INTEGER', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? '1' : '0'),
  },
  mssql: {
    label: 'SQL Server',
    quote: (name) => '[' + String(name ?? '').replace(/]/g, ']]') + ']',
    types: { INTEGER: 'INT', REAL: 'FLOAT', BOOLEAN: 'BIT', TEXT: 'NVARCHAR(MAX)' },
    boolLiteral: (v) => (v ? '1' : '0'),
  },
  oracle: {
    label: 'Oracle',
    quote: (name) => '"' + String(name ?? '').toUpperCase().replace(/"/g, '""') + '"',
    types: { INTEGER: 'NUMBER(19)', REAL: 'FLOAT', BOOLEAN: 'NUMBER(1)', TEXT: 'VARCHAR2(4000)' },
    boolLiteral: (v) => (v ? '1' : '0'),
  },

  // ---- Remaining real csvkit --dialect options ----
  firebird: {
    label: 'Firebird',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    // Firebird 3+ has a native BOOLEAN; text uses BLOB SUB_TYPE TEXT since
    // VARCHAR has a hard length cap.
    types: { INTEGER: 'INTEGER', REAL: 'DOUBLE PRECISION', BOOLEAN: 'BOOLEAN', TEXT: 'BLOB SUB_TYPE TEXT' },
    boolLiteral: (v) => (v ? 'TRUE' : 'FALSE'),
  },
  sybase: {
    label: 'Sybase (SAP ASE)',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    // No native boolean, BIT (0/1) is the conventional stand-in.
    types: { INTEGER: 'INT', REAL: 'FLOAT', BOOLEAN: 'BIT', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? '1' : '0'),
  },
  crate: {
    label: 'CrateDB',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'INTEGER', REAL: 'DOUBLE', BOOLEAN: 'BOOLEAN', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? 'true' : 'false'),
  },
  access: {
    label: 'Microsoft Access',
    quote: (name) => '[' + String(name ?? '').replace(/]/g, ']]') + ']',
    // Access/Jet SQL: LONG for integers, YESNO for boolean, MEMO for long
    // text (its plain TEXT type caps at 255 chars).
    types: { INTEGER: 'LONG', REAL: 'DOUBLE', BOOLEAN: 'YESNO', TEXT: 'MEMO' },
    boolLiteral: (v) => (v ? 'True' : 'False'),
  },
  informix: {
    label: 'Informix',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'INTEGER', REAL: 'FLOAT', BOOLEAN: 'BOOLEAN', TEXT: 'TEXT' },
    // Informix's BOOLEAN literals are the single characters 't'/'f'.
    boolLiteral: (v) => (v ? "'t'" : "'f'"),
  },
  maxdb: {
    label: 'SAP MaxDB',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'INTEGER', REAL: 'FLOAT', BOOLEAN: 'BOOLEAN', TEXT: 'LONG ASCII' },
    boolLiteral: (v) => (v ? 'TRUE' : 'FALSE'),
  },

  // ---- csvkit+ extras: not in real csvkit's --dialect list ----
  cockroachdb: {
    label: 'CockroachDB',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'INT8', REAL: 'FLOAT8', BOOLEAN: 'BOOL', TEXT: 'STRING' },
    boolLiteral: (v) => (v ? 'true' : 'false'),
  },
  snowflake: {
    label: 'Snowflake',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'NUMBER', REAL: 'FLOAT', BOOLEAN: 'BOOLEAN', TEXT: 'TEXT' },
    boolLiteral: (v) => (v ? 'TRUE' : 'FALSE'),
  },
  bigquery: {
    label: 'Google BigQuery',
    quote: (name) => '`' + String(name ?? '').replace(/`/g, '') + '`',
    types: { INTEGER: 'INT64', REAL: 'FLOAT64', BOOLEAN: 'BOOL', TEXT: 'STRING' },
    boolLiteral: (v) => (v ? 'TRUE' : 'FALSE'),
  },
  redshift: {
    label: 'Amazon Redshift',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    // Redshift has no unlimited-length text type, VARCHAR(65535) is its
    // practical max.
    types: { INTEGER: 'INTEGER', REAL: 'DOUBLE PRECISION', BOOLEAN: 'BOOLEAN', TEXT: 'VARCHAR(65535)' },
    boolLiteral: (v) => (v ? 'TRUE' : 'FALSE'),
  },
  duckdb: {
    label: 'DuckDB',
    quote: (name) => '"' + String(name ?? '').replace(/"/g, '""') + '"',
    types: { INTEGER: 'INTEGER', REAL: 'DOUBLE', BOOLEAN: 'BOOLEAN', TEXT: 'VARCHAR' },
    boolLiteral: (v) => (v ? 'true' : 'false'),
  },
  clickhouse: {
    label: 'ClickHouse',
    quote: (name) => '`' + String(name ?? '').replace(/`/g, '``') + '`',
    types: { INTEGER: 'Int64', REAL: 'Float64', BOOLEAN: 'Bool', TEXT: 'String' },
    boolLiteral: (v) => (v ? 'true' : 'false'),
    // ClickHouse requires an ENGINE clause; Memory keeps this runnable
    // without needing an ORDER BY key like MergeTree would.
    tableSuffix: ' ENGINE = Memory',
  },
};

function sqlLiteral(value, logicalType, dialect) {
  if (value === '' || value === null || value === undefined) return 'NULL';
  if (logicalType === 'INTEGER' || logicalType === 'REAL') return String(value);
  if (logicalType === 'BOOLEAN') return dialect.boolLiteral(String(value).toLowerCase() === 'true');
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function inferColumnTypes(header, body) {
  return header.map((_, idx) => {
    const values = body.map((r) => (r[idx] ?? '').trim()).filter((v) => v !== '');
    if (!values.length) return 'TEXT';

    const allInt = values.every((v) => /^-?\d+$/.test(v));
    if (allInt) return 'INTEGER';

    const allReal = values.every((v) => !isNaN(parseFloat(v)) && isFinite(v));
    if (allReal) return 'REAL';

    const allBool = values.every((v) => /^(true|false)$/i.test(v));
    if (allBool) return 'BOOLEAN';

    return 'TEXT';
  });
}

function generateSQL(rows, tableName, dialectKey) {
  const [header, ...body] = rows;
  if (!header || !header.length) return { sql: '', types: [] };

  const dialect = DIALECTS[dialectKey] || DIALECTS.postgresql;
  const logicalTypes = inferColumnTypes(header, body);
  const sqlTypes = logicalTypes.map((t) => dialect.types[t]);
  const table = dialect.quote(tableName || 'data');

  const columnDefs = header.map((name, i) => `    ${dialect.quote(name)} ${sqlTypes[i]}`).join(',\n');
  const suffix = dialect.tableSuffix || '';
  const createStmt = `CREATE TABLE ${table} (\n${columnDefs}\n)${suffix};`;

  const insertStmts = body.map((r) => {
    const values = header.map((_, i) => sqlLiteral(r[i], logicalTypes[i], dialect)).join(', ');
    return `INSERT INTO ${table} (${header.map(dialect.quote).join(', ')}) VALUES (${values});`;
  });

  const sql = [createStmt, '', ...insertStmts].join('\n');
  return { sql, types: logicalTypes };
}

self.onmessage = (e) => {
  const { op, text, rows, indices, colIndex, pattern, dir, slot, tableName, dialect } = e.data;
  try {
    if (op === 'look') {
      self.postMessage({ ok: true, rows: parseCSV(text), slot });
    } else if (op === 'parse') {
      self.postMessage({ ok: true, rows: parseCSV(text), slot });
    } else if (op === 'cut') {
      const { rows: outRows, changed } = cutColumns(rows, indices);
      self.postMessage({ ok: true, rows: outRows, changed });
    } else if (op === 'grep') {
      const { rows: outRows, changed } = grepRows(rows, colIndex, pattern);
      self.postMessage({ ok: true, rows: outRows, changed });
    } else if (op === 'sort') {
      const { rows: outRows, changed } = sortRows(rows, colIndex, dir);
      self.postMessage({ ok: true, rows: outRows, changed });
    } else if (op === 'stat') {
      const { rows: outRows } = statColumns(rows);
      self.postMessage({ ok: true, rows: outRows });
    } else if (op === 'join') {
      const { leftRows, rightRows, leftCol, rightCol } = e.data;
      const { rows: outRows } = joinRows(leftRows, rightRows, leftCol, rightCol);
      self.postMessage({ ok: true, rows: outRows });
    } else if (op === 'stack') {
      const { filesRows } = e.data;
      const result = stackRows(filesRows);
      if (result.error) {
        self.postMessage({ ok: false, error: result.error });
      } else {
        self.postMessage({ ok: true, rows: result.rows });
      }
    } else if (op === 'clean') {
      const { rows: outRows, changed, stats } = cleanRows(rows);
      self.postMessage({ ok: true, rows: outRows, changed, stats });
    } else if (op === 'json') {
      const { json } = toJSON(rows);
      self.postMessage({ ok: true, json });
    } else if (op === 'sql') {
      const { sql, types } = generateSQL(rows, tableName, dialect);
      self.postMessage({ ok: true, sql, types });
    } else {
      self.postMessage({ ok: false, error: `Unknown operation: ${op}` });
    }
  } catch (err) {
    self.postMessage({ ok: false, error: 'Could not process that file.' });
  }
};
