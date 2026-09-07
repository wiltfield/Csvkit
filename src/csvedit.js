import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { createEditableGrid } from './editable-grid.js';

const DRAFT_KEY = 'csvedit';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const optionsPanel = document.getElementById('options-panel');
const gridEl = document.getElementById('grid');
const addRowBtn = document.getElementById('add-row-btn');
const addColBtn = document.getElementById('add-col-btn');
const clearBtn = document.getElementById('clear-btn');

const worker = new Worker('src/csv-worker.js');

let rows = null;

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
  if (!rows) return;
  saveDraft(DRAFT_KEY, { rows });
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

worker.onmessage = (e) => {
  const { ok, rows: parsed, error } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }
  rows = parsed.length ? parsed : [['Column 1']];
  optionsPanel.classList.add('visible');
  grid.render();
  term.say('File is ready. Edit cells, or add/remove rows and columns.');
  save.hide();
  persist();
};

worker.onerror = () => term.error('Could not process that file.');

function handleFile(file) {
  if (!file) {
    term.error('No file selected.');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    term.error('That file is not a CSV.');
    return;
  }

  clearDraft(DRAFT_KEY);
  rows = null;
  optionsPanel.classList.remove('visible');
  save.hide();
  term.say('Uploading...');
  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      term.say(`Uploading... ${pct}%`);
    }
  };

  reader.onload = () => {
    term.say('Parsing...');
    worker.postMessage({ op: 'parse', text: reader.result });
  };
  reader.onerror = () => term.error('Could not read that file.');
  reader.readAsText(file);
}

addRowBtn.addEventListener('click', () => grid.addRow());
addColBtn.addEventListener('click', () => grid.addColumn());

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});

clearBtn.addEventListener('click', () => {
  if (!rows) {
    term.error('No file to clear.');
    return;
  }
  clearAllDrafts();
  rows = null;
  optionsPanel.classList.remove('visible');
  gridEl.innerHTML = '';
  save.hide();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.rows) {
    rows = draft.rows;
    optionsPanel.classList.add('visible');
    grid.render();
    save.show();
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
  }
})();
