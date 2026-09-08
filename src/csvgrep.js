import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { createHistory } from './history.js';

const DRAFT_KEY = 'csvgrep';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const colSelect = document.getElementById('col-select');
const patternInput = document.getElementById('pattern-input');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));
const history = createHistory();

let parsedRows = null;
let currentOutputRows = null;
let lastApplied = null; // { colIndex, pattern } of the last query actually run
let pendingQuery = null;

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

function buildColSelect(header) {
  colSelect.innerHTML = header
    .map((name, i) => `<option value="${i}">${name}</option>`)
    .join('');
}


function snapshot() {
  return {
    currentOutputRows,
    lastApplied,
    colIndex: colSelect.value,
    pattern: patternInput.value,
  };
}

function applyState(state) {
  currentOutputRows = state.currentOutputRows;
  lastApplied = state.lastApplied;
  if (state.colIndex !== undefined) colSelect.value = state.colIndex;
  patternInput.value = state.pattern || '';
  renderTable(currentOutputRows || parsedRows);
  if (currentOutputRows) save.show(); else save.hide();
}

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, {
    parsedRows,
    currentOutputRows,
    colIndex: colSelect.value,
    pattern: patternInput.value,
    lastApplied,
  });
});

worker.onmessage = (e) => {
  const { ok, rows, error, changed } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }
  if (parsedRows === null) {
    parsedRows = rows;
    buildColSelect(rows[0] || []);
    optionsPanel.classList.add('visible');
    renderTable(rows);
    term.say('File is ready. Enter a pattern and run.');
    save.hide();
    history.reset(snapshot());
    persist();
  } else {
    renderTable(rows);
    lastApplied = pendingQuery;
    const count = rows.length ? rows.length - 1 : 0;
    if (count === 0) {
      term.error('No matching rows found.');
    } else if (!changed) {
      term.error('All rows matched, nothing was filtered.');
    } else {
      currentOutputRows = rows;
      save.show();
      term.say(`Found ${count} matching row${count === 1 ? '' : 's'}.`);
      history.push(snapshot());
    }
    persist();
  }
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
  parsedRows = null;
  currentOutputRows = null;
  lastApplied = null;
  optionsPanel.classList.remove('visible');
  save.hide();
  history.clear();
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

runBtn.addEventListener('click', () => {
  if (!parsedRows) {
    term.error('Upload a file first.');
    return;
  }
  const pattern = patternInput.value;
  if (!pattern) {
    term.error('Enter a pattern to search for.');
    return;
  }
  const colIndex = Number(colSelect.value);
  if (lastApplied && lastApplied.colIndex === colIndex && lastApplied.pattern === pattern) {
    term.error('Already filtered with that column and pattern.');
    return;
  }
  pendingQuery = { colIndex, pattern };
  term.say('Filtering...');
  worker.postMessage({ op: 'grep', rows: parsedRows, colIndex, pattern });
});

if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    const prev = history.undo();
    if (!prev) {
      term.error('Nothing to undo.');
      return;
    }
    applyState(prev);
    term.say('Undid last change.');
    persist();
  });
}

if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    const next = history.redo();
    if (!next) {
      term.error('Nothing to redo.');
      return;
    }
    applyState(next);
    term.say('Redid last change.');
    persist();
  });
}

colSelect.addEventListener('change', persist);
patternInput.addEventListener('input', persist);

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
  if (!parsedRows) {
    term.error('No file to clear.');
    return;
  }
  clearAllDrafts();
  parsedRows = null;
  currentOutputRows = null;
  lastApplied = null;
  colSelect.innerHTML = '';
  patternInput.value = '';
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
  save.hide();
  history.clear();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    buildColSelect(parsedRows[0] || []);
    optionsPanel.classList.add('visible');
    if (draft.colIndex !== undefined) colSelect.value = draft.colIndex;
    if (draft.pattern) patternInput.value = draft.pattern;
    if (draft.lastApplied) lastApplied = draft.lastApplied;
    const rowsToShow = draft.currentOutputRows || parsedRows;
    renderTable(rowsToShow);
    if (draft.currentOutputRows) {
      currentOutputRows = draft.currentOutputRows;
      save.show();
    }
    history.reset(snapshot());
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
  }
})();
