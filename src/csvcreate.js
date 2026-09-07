import { createTerminal } from './terminal.js';
import { setupSaveButton, rowsToCSV } from './download.js';
import { saveDraft, loadDraft, clearDraft, debounce } from './draft-storage.js';
import { createEditableGrid } from './editable-grid.js';

const DRAFT_KEY = 'csvcreate';

const term = createTerminal(document.getElementById('terminal'));
const gridEl = document.getElementById('grid');
const gridToolbar = document.getElementById('grid-toolbar');
const textPanel = document.getElementById('text-mode-panel');
const textArea = document.getElementById('text-area');
const delimiterInput = document.getElementById('delimiter-input');
const addRowBtn = document.getElementById('add-row-btn');
const addColBtn = document.getElementById('add-col-btn');
const newFileBtn = document.getElementById('new-file-btn');
const modeButtons = document.querySelectorAll('.mode-btn');

let rows = [['Column 1']];
let mode = 'grid';

const save = setupSaveButton({
  saveRow: document.getElementById('save-row'),
  button: document.getElementById('save-btn'),
  box: document.getElementById('save-box'),
  input: document.getElementById('save-filename'),
  confirmBtn: document.getElementById('save-confirm'),
  cancelBtn: document.getElementById('save-cancel'),
  getRows: () => rows,
  onSave: () => clearDraft(DRAFT_KEY),
});

const persist = debounce(() => {
  saveDraft(DRAFT_KEY, {
    rows,
    mode,
    delimiter: delimiterInput.value,
    text: mode === 'text' ? textArea.value : null,
  });
});

const grid = createEditableGrid(gridEl, {
  getRows: () => rows,
  onChange: (action) => {
    persist();
    save.show();
    if (action === 'add-row') term.say('Row added.');
    else if (action === 'add-col') term.say('Column added.');
    else if (action === 'remove-row') term.say('Row removed.');
    else if (action === 'remove-col') term.say('Column removed.');
    else if (action === 'remove-row-blocked') term.error('No rows left to remove.');
    else if (action === 'remove-col-blocked') term.error('Need at least one column.');
  },
});

// Small standalone parser mirroring the shared worker's parseCSV, but
// parameterized on delimiter since text mode's delimiter is user-chosen.
// Kept here rather than in the shared worker since this only ever runs on
// small hand-typed/pasted text, not large uploaded files.
function parseDelimited(text, delimiter) {
  const parsedRows = [];
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
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      parsedRows.push(row); row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); parsedRows.push(row); }
  return parsedRows.filter((r) => r.length > 1 || r[0] !== '');
}

function showGridMode() {
  gridToolbar.classList.remove('hidden');
  gridEl.classList.remove('hidden');
  textPanel.classList.remove('visible');
}

function showTextMode() {
  gridToolbar.classList.add('hidden');
  gridEl.classList.add('hidden');
  textPanel.classList.add('visible');
}

// Grid and text are two views of the same `rows` array, switching modes
// serializes/parses between them so nothing typed is ever lost.
function switchMode(newMode) {
  if (newMode === mode) return;
  const delim = delimiterInput.value || ',';
  if (newMode === 'text') {
    textArea.value = rowsToCSV(rows, delim);
    showTextMode();
  } else {
    const parsed = parseDelimited(textArea.value, delim);
    if (parsed.length) rows = parsed;
    grid.render();
    showGridMode();
  }
  mode = newMode;
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === newMode));
  persist();
}

modeButtons.forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));

addRowBtn.addEventListener('click', () => grid.addRow());
addColBtn.addEventListener('click', () => grid.addColumn());

newFileBtn.addEventListener('click', () => {
  clearDraft(DRAFT_KEY);
  rows = [['Column 1']];
  mode = 'grid';
  textArea.value = '';
  delimiterInput.value = ',';
  grid.render();
  showGridMode();
  modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === 'grid'));
  save.hide();
  term.say('Started a new file.');
});

textArea.addEventListener('input', persist);
delimiterInput.addEventListener('input', persist);

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.rows) {
    rows = draft.rows;
    mode = draft.mode || 'grid';
    if (draft.delimiter) delimiterInput.value = draft.delimiter;
    if (mode === 'text') {
      textArea.value = draft.text || rowsToCSV(rows, delimiterInput.value || ',');
      showTextMode();
    } else {
      grid.render();
      showGridMode();
    }
    modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    save.show();
    term.say('Restored your last session.');
  } else {
    grid.render();
    term.say('Start typing, or switch to Text mode to paste data.');
  }
})();
