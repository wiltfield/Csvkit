import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';

const DRAFT_KEY = 'csvjoin';

const term = createTerminal(document.getElementById('terminal'));
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const colSelectLeft = document.getElementById('col-select-left');
const colSelectRight = document.getElementById('col-select-right');
const runBtn = document.getElementById('run-btn');

const dropZoneLeft = document.getElementById('drop-zone-left');
const fileInputLeft = document.getElementById('file-input-left');
const dropZoneRight = document.getElementById('drop-zone-right');
const fileInputRight = document.getElementById('file-input-right');
const clearBtn = document.getElementById('clear-btn');

term.say('Upload both files.');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));

let leftRows = null;
let rightRows = null;
let currentOutputRows = null;
let lastJoinSerialized = null;

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

// Two files parsed separately before a join is even possible, so a draft
// only makes sense once both sides are loaded (nothing worth restoring
// with just one side uploaded).
const persist = debounce(() => {
  if (!leftRows || !rightRows) return;
  saveDraft(DRAFT_KEY, {
    leftRows,
    rightRows,
    leftCol: colSelectLeft.value,
    rightCol: colSelectRight.value,
    currentOutputRows,
    lastJoinSerialized,
  });
});

function renderTable(rows) {
  if (!rows.length) {
    outputArea.innerHTML = '<p class="lead">No data found in that file.</p>';
    return;
  }
  const [header, ...body] = rows;
  const thead = `<tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = body
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  outputArea.innerHTML = `<table class="output-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function buildColSelect(select, header, selectedValue) {
  select.innerHTML = header
    .map((name, i) => `<option value="${i}">${name}</option>`)
    .join('');
  if (selectedValue !== undefined) select.value = selectedValue;
}

function maybeShowOptions() {
  if (leftRows && rightRows) {
    optionsPanel.classList.add('visible');
    term.say('Both files loaded. Pick join columns and run.');
  }
}

worker.onmessage = (e) => {
  const { ok, rows, error, slot } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }

  if (slot === 'left') {
    leftRows = rows;
    buildColSelect(colSelectLeft, rows[0] || []);
    maybeShowOptions();
    return;
  }
  if (slot === 'right') {
    rightRows = rows;
    buildColSelect(colSelectRight, rows[0] || []);
    maybeShowOptions();
    return;
  }

  // otherwise this is a join result
  renderTable(rows);
  if (rows.length <= 1) {
    term.error('No matching rows found.');
    return;
  }
  const serialized = JSON.stringify(rows);
  if (serialized === lastJoinSerialized) {
    term.error('Join result is unchanged.');
  } else {
    lastJoinSerialized = serialized;
    currentOutputRows = rows;
    save.show();
    term.say(`Joined ${rows.length - 1} row(s).`);
    persist();
  }
};

worker.onerror = () => term.error('Could not process that file.');

function handleFile(file, side) {
  if (!file) {
    term.error('No file selected.');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    term.error('That file is not a CSV.');
    return;
  }

  clearDraft(DRAFT_KEY);
  if (side === 'left') leftRows = null; else rightRows = null;
  currentOutputRows = null;
  optionsPanel.classList.remove('visible');
  save.hide();
  lastJoinSerialized = null;
  term.say(`Uploading ${side} file...`);
  const reader = new FileReader();

  reader.onload = () => {
    term.say(`Parsing ${side} file...`);
    worker.postMessage({ op: 'parse', text: reader.result, slot: side });
  };
  reader.onerror = () => term.error('Could not read that file.');
  reader.readAsText(file);
}

runBtn.addEventListener('click', () => {
  if (!leftRows || !rightRows) {
    term.error('Upload both files first.');
    return;
  }
  const leftCol = Number(colSelectLeft.value);
  const rightCol = Number(colSelectRight.value);
  term.say('Joining...');
  worker.postMessage({ op: 'join', leftRows, rightRows, leftCol, rightCol });
});

colSelectLeft.addEventListener('change', persist);
colSelectRight.addEventListener('change', persist);

function wireDropZone(dropZone, fileInput, side) {
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0], side));
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0], side);
  });
}

wireDropZone(dropZoneLeft, fileInputLeft, 'left');
wireDropZone(dropZoneRight, fileInputRight, 'right');

clearBtn.addEventListener('click', () => {
  if (!leftRows && !rightRows) {
    term.error('No file to clear.');
    return;
  }
  clearAllDrafts();
  leftRows = null;
  rightRows = null;
  currentOutputRows = null;
  lastJoinSerialized = null;
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
  save.hide();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.leftRows && draft.rightRows) {
    leftRows = draft.leftRows;
    rightRows = draft.rightRows;
    buildColSelect(colSelectLeft, leftRows[0] || [], draft.leftCol);
    buildColSelect(colSelectRight, rightRows[0] || [], draft.rightCol);
    optionsPanel.classList.add('visible');
    if (draft.currentOutputRows) {
      currentOutputRows = draft.currentOutputRows;
      lastJoinSerialized = draft.lastJoinSerialized || null;
      renderTable(currentOutputRows);
      save.show();
    }
    term.say('Restored your last session.');
  } else {
    term.say('Upload both files.');
  }
})();
