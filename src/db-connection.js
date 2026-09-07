// Shared DB connection helper: stores the user's Neon connection string
// client-side (localStorage, same pattern as draft-storage.js), never sent
// anywhere except with each relay request, and never stored server-side.
// Wires a small Connect/Disconnect UI that csvsql.js and sql2csv.js both use.

const STORAGE_KEY = 'csvkit-db-token';

// Netlify relay base. Update if the relay is redeployed elsewhere.
const RELAY_BASE = 'https://gorgeous-pavlova-cf0a77.netlify.app/.netlify/functions';

export function getConnectionString() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return null;
  }
}

export function isConnected() {
  return !!getConnectionString();
}

function storeConnectionString(connStr) {
  try {
    localStorage.setItem(STORAGE_KEY, connStr);
  } catch (err) {
    // ignore, connection just won't persist across reloads
  }
}

function forgetConnectionString() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // ignore
  }
}

// Validates a connection string against the relay with a trivial query.
// Returns { ok: true } or { ok: false, error }.
export async function testConnection(connStr) {
  try {
    const res = await fetch(`${RELAY_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr, sql: 'SELECT 1' }),
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

// Runs a SELECT query against the relay's /query endpoint.
// Returns { ok: true, rows } or { ok: false, error }.
export async function runQuery(connStr, sql) {
  try {
    const res = await fetch(`${RELAY_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr, sql }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `Relay returned ${res.status}.` };
    }
    return { ok: true, rows: data.rows || [] };
  } catch (err) {
    return { ok: false, error: 'Could not reach the relay. Check your connection.' };
  }
}

// Runs one or more CREATE TABLE / INSERT statements against the relay's
// /insert endpoint. `statements` can be a single SQL string containing
// multiple statements, or an array of statement strings.
// Returns { ok: true } or { ok: false, error }.
export async function runInsert(connStr, statements) {
  const list = Array.isArray(statements)
    ? statements
    : statements.split(';').map((s) => s.trim()).filter(Boolean);
  try {
    const res = await fetch(`${RELAY_BASE}/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connStr, statements: list }),
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
export function setupConnectionUI(elements, term, onChange) {
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
    term.say('Validating connection...');
    formConfirm.disabled = true;
    const result = await testConnection(connStr);
    formConfirm.disabled = false;
    if (!result.ok) {
      term.error(result.error || 'Could not connect. Check your connection string.');
      return;
    }
    storeConnectionString(connStr);
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
    forgetConnectionString();
    confirmBox.classList.remove('visible');
    term.say('Database disconnected.');
    render();
  });

  render();
}
