import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, debounce } from './draft-storage.js';
import { setupConnectionUI, getConnectionString, runQuery, getSchema } from './db-connection.js';

const DRAFT_KEY = 'sql2csv';

const term = createTerminal(document.getElementById('terminal'));
const queryInput = document.getElementById('query-input');
const outputArea = document.getElementById('output-area');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const browseBtn = document.getElementById('browse-tables-btn');
const schemaPanel = document.getElementById('schema-panel');
const insertConfirm = document.getElementById('insert-query-confirm');
const insertLabel = document.getElementById('insert-query-label');
const insertAppendBtn = document.getElementById('insert-query-append');
const insertReplaceBtn = document.getElementById('insert-query-replace');
const insertCancelBtn = document.getElementById('insert-query-cancel');

let currentOutputRows = null;
let dbConnected = false;
let pendingTableName = null;

setupConnectionUI({
  connectBtn: document.getElementById('db-connect-btn'),
  statusRow: document.getElementById('db-status-row'),
  disconnectBtn: document.getElementById('db-disconnect-btn'),
  formBox: document.getElementById('db-form'),
  connStrInput: document.getElementById('db-connstr-input'),
  formConfirm: document.getElementById('db-form-confirm'),
  formCancel: document.getElementById('db-form-cancel'),
  confirmBox: document.getElementById('db-disconnect-confirm'),
  confirmYes: document.getElementById('db-disconnect-yes'),
  confirmNo: document.getElementById('db-disconnect-no'),
}, term, (connected) => {
  dbConnected = connected;
});

const save = setupSaveButton({
  saveRow: document.getElementById('save-row'),
  button: document.getElementById('save-btn'),
  box: document.getElementById('save-box'),
  input: document.getElementById('save-filename'),
  confirmBtn: document.getElementById('save-confirm'),
  cancelBtn: document.getElementById('save-cancel'),
  getRows: () => currentOutputRows,
  onSave: () => clearDraft(DRAFT_KEY),
});

function renderSchema(tables) {
  if (!tables || tables.length === 0) {
    schemaPanel.innerHTML = '<p class="lead">No tables found in the public schema.</p>';
    return;
  }
  schemaPanel.innerHTML = tables.map((t) => `
    <div class="schema-table">
      <button class="schema-table-toggle" type="button" data-table="${t.name}">
        <span class="schema-table-name">${t.name}</span>
        <span class="schema-caret">&#9656;</span>
      </button>
      <div class="schema-columns hidden">
        ${t.columns.map((c) => `<div class="schema-column"><span class="col-name">${c.name}</span><span class="col-type">${c.type}</span></div>`).join('')}
      </div>
    </div>
  `).join('');

  schemaPanel.querySelectorAll('.schema-table-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cols = btn.nextElementSibling;
      const caret = btn.querySelector('.schema-caret');
      const isOpen = !cols.classList.contains('hidden');
      cols.classList.toggle('hidden');
      caret.innerHTML = isOpen ? '&#9656;' : '&#9662;';
      openInsertPopup(btn.dataset.table);
    });
  });
}

function openInsertPopup(tableName) {
  pendingTableName = tableName;
  insertLabel.textContent = `Insert query for "${tableName}"?`;
  insertConfirm.classList.add('visible');
}

function closeInsertPopup() {
  insertConfirm.classList.remove('visible');
  pendingTableName = null;
}

insertAppendBtn.addEventListener('click', () => {
  if (!pendingTableName) return;
  const stmt = `SELECT * FROM ${pendingTableName};`;
  queryInput.value = queryInput.value.trim() ? `${queryInput.value}\n${stmt}` : stmt;
  persist();
  closeInsertPopup();
});

insertReplaceBtn.addEventListener('click', () => {
  if (!pendingTableName) return;
  queryInput.value = `SELECT * FROM ${pendingTableName};`;
  persist();
  closeInsertPopup();
});

insertCancelBtn.addEventListener('click', () => {
  closeInsertPopup();
});

browseBtn.addEventListener('click', async () => {
  const connStr = getConnectionString();
  if (!connStr) {
    term.error('Connect a database first.');
    return;
  }
  browseBtn.disabled = true;
  term.say('Loading tables...');
  const result = await getSchema(connStr);
  browseBtn.disabled = false;
  if (!result.ok) {
    term.error(result.error || 'Could not load schema.');
    return;
  }
  renderSchema(result.tables);
  term.say(`Found ${result.tables.length} table${result.tables.length === 1 ? '' : 's'}.`);
});

function renderTable(rows) {
  // rows: array-of-arrays, first row is the header.
  const [header, ...data] = rows;
  const thead = `<tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = data
    .map((row) => `<tr>${row.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`)
    .join('');
  outputArea.innerHTML = `<table class="output-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

const persist = debounce(() => {
  saveDraft(DRAFT_KEY, { queryValue: queryInput.value, currentOutputRows });
});

queryInput.addEventListener('input', persist);

runBtn.addEventListener('click', async () => {
  const query = queryInput.value.trim();
  if (!query) {
    term.error('Write a query first.');
    return;
  }
  if (!dbConnected) {
    term.error('Connect a database first.');
    return;
  }
  const connStr = getConnectionString();
  if (!connStr) {
    term.error('Connect a database first.');
    return;
  }
  runBtn.disabled = true;
  term.say('Running query...');
  const result = await runQuery(connStr, query);
  runBtn.disabled = false;
  if (!result.ok) {
    term.error(result.error || 'Query failed.');
    return;
  }
  const objRows = result.rows;
  if (!objRows || objRows.length === 0) {
    outputArea.innerHTML = '<p class="lead">Query ran successfully but returned no rows.</p>';
    currentOutputRows = null;
    save.hide();
    term.error('No rows returned.');
    persist();
    return;
  }
  const header = Object.keys(objRows[0]);
  const dataRows = objRows.map((r) => header.map((h) => r[h]));
  currentOutputRows = [header, ...dataRows];
  renderTable(currentOutputRows);
  save.show();
  term.say(`Query returned ${objRows.length} row${objRows.length === 1 ? '' : 's'}.`);
  persist();
});

clearBtn.addEventListener('click', () => {
  queryInput.value = '';
  outputArea.innerHTML = '';
  currentOutputRows = null;
  save.hide();
  clearDraft(DRAFT_KEY);
  term.say('Cleared.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.queryValue) {
    queryInput.value = draft.queryValue;
    if (draft.currentOutputRows) {
      currentOutputRows = draft.currentOutputRows;
      renderTable(currentOutputRows);
      save.show();
    }
    term.say('Restored your last session.');
  } else {
    term.say('Connect a database, then write a query.');
  }
})();
