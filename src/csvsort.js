import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { createHistory } from './history.js';

const DRAFT_KEY = 'csvsort';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const colSelect = document.getElementById('col-select');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));
const history = createHistory();

let parsedRows = null;
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

function currentDir() {
  return document.querySelector('input[name="dir"]:checked')?.value || 'asc';
}

function setDir(dir) {
  const radio = document.querySelector(`input[name="dir"][value="${dir}"]`);
  if (radio) radio.checked = true;
}


function snapshot() {
  return { parsedRows, currentOutputRows, colIndex: colSelect.value, dir: currentDir() };
}

function applyState(state) {
  parsedRows = state.parsedRows;
  currentOutputRows = state.currentOutputRows;
  if (state.colIndex !== undefined) colSelect.value = state.colIndex;
  if (state.dir) setDir(state.dir);
  renderTable(currentOutputRows || parsedRows);
  if (currentOutputRows) save.show(); else save.hide();
}

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, {
    parsedRows,
    currentOutputRows,
    colIndex: colSelect.value,
    dir: currentDir(),
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
    term.say('File is ready. Pick a column and run.');
    save.hide();
    history.reset(snapshot());
    persist();
  } else {
    renderTable(rows);
    if (changed) {
      parsedRows = rows;
      currentOutputRows = rows;
      save.show();
      term.say('Rows sorted.');
      history.push(snapshot());
      persist();
    } else {
      term.error('Rows are already in that order.');
    }
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
  if (!parsedRows) return;
  const colIndex = Number(colSelect.value);
  const dir = currentDir();
  term.say('Sorting...');
  worker.postMessage({ op: 'sort', rows: parsedRows, colIndex, dir });
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
document.querySelectorAll('input[name="dir"]').forEach((r) => r.addEventListener('change', persist));

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
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
  save.hide();
  history.clear();
  term.say('File cleared from storage.');
});

// Restore a previous session, if any, before falling back to the normal
// "upload your file" starting state.
(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    buildColSelect(parsedRows[0] || []);
    optionsPanel.classList.add('visible');
    if (draft.colIndex !== undefined) colSelect.value = draft.colIndex;
    if (draft.dir) setDir(draft.dir);
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
