import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, debounce } from './draft-storage.js';
import { setupConnectionUI } from './db-connection.js';

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

const persist = debounce(() => {
  saveDraft(DRAFT_KEY, { queryValue: queryInput.value });
});

queryInput.addEventListener('input', persist);

// Actually running the query is wired in a later chunk. For now this just
// reflects connection state.
runBtn.addEventListener('click', () => {
  const query = queryInput.value.trim();
  if (!query) {
    term.error('Write a query first.');
    return;
  }
  if (!dbConnected) {
    term.error('Connect a database first.');
    return;
  }
  term.error('Database is connected, but Run isn\u2019t wired up yet.');
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
    term.say('Restored your last session.');
  } else {
    term.say('Connect a database, then write a query.');
  }
})();
