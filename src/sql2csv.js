import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, debounce } from './draft-storage.js';
import { setupConnectionUI, getConnectionString, runQuery } from './db-connection.js';

const DRAFT_KEY = 'sql2csv';

const term = createTerminal(document.getElementById('terminal'));
const queryInput = document.getElementById('query-input');
const outputArea = document.getElementById('output-area');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');

let currentOutputRows = null;
let dbConnected = false;

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
