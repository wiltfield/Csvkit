import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { createHistory } from './history.js';

const DRAFT_KEY = 'csvclean';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
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

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = !history.canUndo();
  if (redoBtn) redoBtn.disabled = !history.canRedo();
}

function snapshot() {
  return { parsedRows, currentOutputRows };
}

function applyState(state) {
  parsedRows = state.parsedRows;
  currentOutputRows = state.currentOutputRows;
  renderTable(currentOutputRows || parsedRows);
  if (currentOutputRows) save.show(); else save.hide();
}

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, { parsedRows, currentOutputRows });
});

worker.onmessage = (e) => {
  const { ok, rows, error, changed, stats } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }
  if (parsedRows === null) {
    parsedRows = rows;
    optionsPanel.classList.add('visible');
    renderTable(rows);
    term.say('File is ready. Run clean to check for issues.');
    save.hide();
    history.reset(snapshot());
    updateHistoryButtons();
    persist();
  } else {
    renderTable(rows);
    if (changed) {
      currentOutputRows = rows;
      parsedRows = rows;
      save.show();
      const parts = [];
      if (stats.raggedCount) parts.push(`${stats.raggedCount} ragged row${stats.raggedCount === 1 ? '' : 's'}`);
      if (stats.blankCount) parts.push(`${stats.blankCount} blank row${stats.blankCount === 1 ? '' : 's'} removed`);
      if (stats.trimmedCount) parts.push(`${stats.trimmedCount} row${stats.trimmedCount === 1 ? '' : 's'} trimmed`);
      term.say(`Fixed: ${parts.join(', ')}.`);
      history.push(snapshot());
      updateHistoryButtons();
      persist();
    } else {
      term.error('No formatting errors found.');
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
  updateHistoryButtons();
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
  term.say('Cleaning...');
  worker.postMessage({ op: 'clean', rows: parsedRows });
});

if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    const prev = history.undo();
    if (!prev) {
      term.error('Nothing to undo.');
      updateHistoryButtons();
      return;
    }
    applyState(prev);
    term.say('Undid last change.');
    persist();
    updateHistoryButtons();
  });
}

if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    const next = history.redo();
    if (!next) {
      term.error('Nothing to redo.');
      updateHistoryButtons();
      return;
    }
    applyState(next);
    term.say('Redid last change.');
    persist();
    updateHistoryButtons();
  });
}

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
  updateHistoryButtons();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    optionsPanel.classList.add('visible');
    const rowsToShow = draft.currentOutputRows || parsedRows;
    renderTable(rowsToShow);
    if (draft.currentOutputRows) {
      currentOutputRows = draft.currentOutputRows;
      save.show();
    }
    history.reset(snapshot());
    updateHistoryButtons();
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
    updateHistoryButtons();
  }
})();
