// Shared DB connection helper: stores the user's connection string
// client-side (localStorage, same pattern as draft-storage.js), never sent
// anywhere except with each relay request, and never stored server-side.
// Wires a small Connect/Disconnect UI that csvsql.js and sql2csv.js both use.

// Storage model: an array of saved connections, plus a separate pointer to
// which one is "active" (used by the DB-dependent buttons on each page).
// Replaces the old single csvkit-db-token string so a user can save more
// than one database and switch between them (chunk 8 builds the UI for
// that on top of these helpers).
const CONNECTIONS_KEY = 'csvkit-db-connections';
const ACTIVE_KEY = 'csvkit-db-active-id';

// Relay base. Vercel serverless functions live under /api on the same domain.
const RELAY_BASE = '/api';

// The 4 dialects with live Connect/Insert/Run support.
export const SUPPORTED_DIALECTS = ['postgresql', 'cockroachdb', 'mysql', 'mariadb'];

const DIALECT_LABELS = {
  postgresql: 'PostgreSQL',
  cockroachdb: 'CockroachDB',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
};

export function dialectLabel(dialect) {
  return DIALECT_LABELS[dialect] || dialect;
}

function loadConnections() {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function persistConnections(list) {
  try {
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));
  } catch (err) {
    // ignore, list just won't persist across reloads
  }
}

function getActiveConnectionId() {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch (err) {
    return null;
  }
}

function setActiveConnectionId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch (err) {
    // ignore
  }
}

// Returns every saved connection: [{ id, name, connectionString, dialect }].
export function getConnections() {
  return loadConnections();
}

// Returns the currently active connection object, or null.
export function getActiveConnection() {
  const id = getActiveConnectionId();
  if (!id) return null;
  return loadConnections().find((c) => c.id === id) || null;
}

// Sets which saved connection is active. No-op if the id isn't in the list.
export function setActiveConnection(id) {
  const exists = loadConnections().some((c) => c.id === id);
  setActiveConnectionId(exists ? id : null);
}

// Adds a new saved connection, makes it active, and returns the new entry.
// name falls back to the dialect's display label if left blank.
export function addConnection(name, connStr, dialect) {
  const list = loadConnections();
  const entry = {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name && name.trim() ? name.trim() : dialectLabel(dialect),
    connectionString: connStr,
    dialect,
  };
  list.push(entry);
  persistConnections(list);
  setActiveConnectionId(entry.id);
  return entry;
}

// Removes a saved connection. Clears the active pointer if it was active.
export function removeConnection(id) {
  const list = loadConnections().filter((c) => c.id !== id);
  persistConnections(list);
  if (getActiveConnectionId() === id) {
    setActiveConnectionId(null);
  }
}

// Renames a saved connection. Returns false if the id wasn't found.
export function renameConnection(id, newName) {
  const list = loadConnections();
  const entry = list.find((c) => c.id === id);
  if (!entry) return false;
  entry.name = newName && newName.trim() ? newName.trim() : entry.name;
  persistConnections(list);
  return true;
}

// Backward-compat single-connection helpers, now backed by whichever saved
// connection is active. Existing callers (runQuery/runInsert callers in
// csvsql.js/sql2csv.js) keep working unchanged.
export function getConnectionString() {
  const active = getActiveConnection();
  return active ? active.connectionString : null;
}

export function isConnected() {
  return !!getActiveConnection();
}

// Validates a connection string against the relay with a trivial query.
// Returns { ok: true, detectedDialect } or { ok: false, error }.
export async function testConnection(connStr, dialect) {
  try {
    const res = await fetch(`${RELAY_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr, sql: 'SELECT 1', dialect }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `Relay returned ${res.status}.` };
    }
    return { ok: true, detectedDialect: data.detectedDialect };
  } catch (err) {
    return { ok: false, error: 'Could not reach the relay. Check your connection.' };
  }
}

// Runs a SELECT query against the relay's /query endpoint.
// Returns { ok: true, rows, detectedDialect } or { ok: false, error }.
export async function runQuery(connStr, sql, dialect) {
  try {
    const res = await fetch(`${RELAY_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr, sql, dialect }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `Relay returned ${res.status}.` };
    }
    return { ok: true, rows: data.rows || [], detectedDialect: data.detectedDialect };
  } catch (err) {
    return { ok: false, error: 'Could not reach the relay. Check your connection.' };
  }
}

// Fetches the connected database's tables and columns via the relay's
// /query endpoint. Returns { ok: true, tables: [{ name, columns: [{name, type}] }] }
// or { ok: false, error }. dialect is required to pick the right schema
// filter: Postgres/CockroachDB scope to the "public" schema, MySQL/MariaDB
// scope to the current database (they don't use a "public" schema).
export async function getSchema(connStr, dialect) {
  const isMysqlFamily = dialect === 'mysql' || dialect === 'mariadb';
  const sql = isMysqlFamily
    ? `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`
    : `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
  const result = await runQuery(connStr, sql, dialect);
  if (!result.ok) return result;
  const tables = [];
  const byName = new Map();
  for (const row of result.rows) {
    const tName = row.table_name;
    if (!byName.has(tName)) {
      const entry = { name: tName, columns: [] };
      byName.set(tName, entry);
      tables.push(entry);
    }
    byName.get(tName).columns.push({ name: row.column_name, type: row.data_type });
  }
  return { ok: true, tables };
}

// Runs one or more CREATE TABLE / INSERT statements against the relay's
// /insert endpoint. `statements` must be an array of statement strings
// (the caller generates these directly, so there's no need to split SQL
// text on semicolons here, which would break on any semicolon inside a
// quoted value).
// Returns { ok: true } or { ok: false, error }.
export async function runInsert(connStr, statements, dialect) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return { ok: false, error: 'No statements to run.' };
  }
  try {
    const res = await fetch(`${RELAY_BASE}/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr, statements, dialect }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `Relay returned ${res.status}.` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Could not reach the relay. Check your connection.' };
  }
}

// Wires the Connect/Disconnect UI. `elements` are DOM nodes already present
// in the page's HTML (see csvsql.html / sql2csv.html markup):
//   connectBtn      - "Connect DB" button, visible when disconnected
//   statusRow       - wrapper shown when connected ("Connected" + Disconnect)
//   disconnectBtn   - "Disconnect" button
//   formBox         - inline form container (hidden by default)
//   connStrInput    - text input for the connection string
//   formConfirm     - "Connect" confirm button inside the form
//   formCancel      - "Cancel" button inside the form
//   confirmBox      - disconnect confirmation popup container (hidden by default)
//   confirmYes      - confirm disconnect button
//   confirmNo       - cancel disconnect button
// `term` is the page's terminal instance (say/error).
// `onChange(connected)` is called whenever connection state changes, so the
// page can enable/disable its DB-dependent button.
// `getDialect()` (optional) returns the currently-selected dialect string
// (one of SUPPORTED_DIALECTS). When provided, Connect sends it to the relay
// and, if the relay detects a different dialect on the actual database,
// the connection is refused with a red terminal error naming the mismatch
// instead of silently connecting with the wrong driver assumptions.
export function setupConnectionUI(elements, term, onChange, getDialect) {
  const {
    connectBtn, statusRow, disconnectBtn,
    formBox, connStrInput, formConfirm, formCancel,
    confirmBox, confirmYes, confirmNo,
  } = elements;

  function render() {
    const connected = isConnected();
    connectBtn.classList.toggle('hidden', connected);
    statusRow.classList.toggle('hidden', !connected);
    formBox.classList.remove('visible');
    confirmBox.classList.remove('visible');
    onChange(connected);
  }

  connectBtn.addEventListener('click', () => {
    connStrInput.value = '';
    formBox.classList.add('visible');
    connStrInput.focus();
  });

  formCancel.addEventListener('click', () => {
    formBox.classList.remove('visible');
  });

  formConfirm.addEventListener('click', async () => {
    const connStr = connStrInput.value.trim();
    if (!connStr) {
      term.error('Enter a connection string first.');
      return;
    }
    const dialect = getDialect ? getDialect() : undefined;
    term.say('Validating connection...');
    formConfirm.disabled = true;
    const result = await testConnection(connStr, dialect);
    formConfirm.disabled = false;
    if (!result.ok) {
      term.error(result.error || 'Could not connect. Check your connection string.');
      return;
    }
    if (dialect && result.detectedDialect && result.detectedDialect !== dialect) {
      term.error(
        `Selected ${dialectLabel(dialect)}, but this database is ${dialectLabel(result.detectedDialect)}. Pick the right dialect and reconnect.`
      );
      return;
    }
    addConnection(undefined, connStr, dialect);
    term.say('Database connected.');
    render();
  });

  connStrInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') formConfirm.click();
    if (e.key === 'Escape') formCancel.click();
  });

  disconnectBtn.addEventListener('click', () => {
    confirmBox.classList.add('visible');
  });

  confirmNo.addEventListener('click', () => {
    confirmBox.classList.remove('visible');
  });

  confirmYes.addEventListener('click', () => {
    const active = getActiveConnection();
    if (active) removeConnection(active.id);
    confirmBox.classList.remove('visible');
    term.say('Database disconnected.');
    render();
  });

  render();
}
