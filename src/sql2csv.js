import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, debounce } from './draft-storage.js';

const DRAFT_KEY = 'sql2csv';

const term = createTerminal(document.getElementById('terminal'));
const queryInput = document.getElementById('query-input');
const outputArea = document.getElementById('output-area');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');

let currentOutputRows = null;

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

// Running a query needs a live connection to the user's database, which
// isn't wired up yet, this is UI-only until the Neon backend relay exists.
runBtn.addEventListener('click', () => {
  const query = queryInput.value.trim();
  if (!query) {
    term.error('Write a query first.');
    return;
  }
  term.error('Connect a database first. This isn\u2019t wired up yet.');
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
