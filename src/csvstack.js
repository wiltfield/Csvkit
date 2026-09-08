import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { createHistory } from './history.js';

const DRAFT_KEY = 'csvstack';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const runBtn = document.getElementById('run-btn');
const chipList = document.getElementById('file-chip-list');
const clearBtn = document.getElementById('clear-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));
const history = createHistory();

// Ordered list of { id, name, rows } for every file successfully parsed.
let files = [];
let nextId = 0;
let currentOutputRows = null;
let lastStackSerialized = null;

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

// Only files that have actually finished parsing are worth restoring; a
// file mid-upload when the tab closed is cheap enough to just re-add.
const persist = debounce(() => {
  const ready = files.filter((f) => f.rows !== null);
  if (!ready.length) { clearDraft(DRAFT_KEY); return; }
  saveDraft(DRAFT_KEY, {
    files: ready,
    nextId,
    currentOutputRows,
    lastStackSerialized,
  });
});

function renderTable(rows) {
  if (!rows.length) {
    outputArea.innerHTML = '<p class="lead">No data found.</p>';
    return;
  }
  const [header, ...body] = rows;
  const thead = `<tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = body
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  outputArea.innerHTML = `<table class="output-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderChips() {
  chipList.innerHTML = files
    .map(
      (f) => `
        <span class="file-chip" data-id="${f.id}">
          ${f.name}
          <button type="button" class="remove-btn" data-id="${f.id}" aria-label="Remove ${f.name}">&times;</button>
        </span>
      `
    )
    .join('');

  chipList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      files = files.filter((f) => f.id !== id);
      renderChips();
      updateOptionsVisibility();
      history.push(snapshot());
      updateHistoryButtons();
      persist();
    });
  });
}

function updateOptionsVisibility() {
  if (files.length >= 2) {
    optionsPanel.classList.add('visible');
    term.say(`${files.length} files ready. Stack when you\u2019re set.`);
  } else {
    optionsPanel.classList.remove('visible');
  }
}

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = !history.canUndo();
  if (redoBtn) redoBtn.disabled = !history.canRedo();
}

function snapshot() {
  return {
    files: files.map((f) => ({ id: f.id, name: f.name, rows: f.rows })),
    currentOutputRows,
    lastStackSerialized,
  };
}

function applyState(state) {
  files = state.files.map((f) => ({ ...f }));
  renderChips();
  updateOptionsVisibility();
  currentOutputRows = state.currentOutputRows;
  lastStackSerialized = state.lastStackSerialized;
  if (currentOutputRows) {
    renderTable(currentOutputRows);
    save.show();
  } else {
    outputArea.innerHTML = '';
    save.hide();
  }
}

worker.onmessage = (e) => {
  const { ok, rows, error, slot } = e.data;
  if (!ok) {
    // slot present means this was a parse failure for one added file;
    // no slot means it was the stack operation itself failing (mismatch).
    if (slot !== undefined) {
      term.error(error || 'Could not process that file.');
    } else {
      term.error(error || 'Could not stack those files.');
    }
    return;
  }

  if (slot !== undefined) {
    const entry = files.find((f) => f.id === Number(slot.split(':')[1]));
    if (entry) entry.rows = rows;
    updateOptionsVisibility();
    history.push(snapshot());
    updateHistoryButtons();
    persist();
    return;
  }

  // stack result
  renderTable(rows);
  const serialized = JSON.stringify(rows);
  if (lastStackSerialized !== null && serialized === lastStackSerialized) {
    term.error('Stacked result is unchanged.');
  } else {
    lastStackSerialized = serialized;
    currentOutputRows = rows;
    save.show();
    term.say(`Stacked into ${rows.length - 1} row(s).`);
    history.push(snapshot());
    updateHistoryButtons();
    persist();
  }
};

worker.onerror = () => term.error('Could not process that file.');

function addFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    term.error('That file is not a CSV.');
    return;
  }
  if (files.length === 0) {
    history.reset({ files: [], currentOutputRows: null, lastStackSerialized: null });
    updateHistoryButtons();
  }
  const id = nextId++;
  files.push({ id, name: file.name, rows: null });
  renderChips();
  currentOutputRows = null;
  lastStackSerialized = null;
  save.hide();

  term.say(`Uploading ${file.name}...`);
  const reader = new FileReader();
  reader.onload = () => {
    term.say(`Parsing ${file.name}...`);
    worker.postMessage({ op: 'parse', text: reader.result, slot: `stack:${id}` });
  };
  reader.onerror = () => term.error('Could not read that file.');
  reader.readAsText(file);
}

runBtn.addEventListener('click', () => {
  const ready = files.filter((f) => f.rows !== null);
  if (ready.length < 2) {
    term.error('Add at least two files first.');
    return;
  }
  term.say('Stacking...');
  worker.postMessage({ op: 'stack', filesRows: ready.map((f) => f.rows) });
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
fileInput.addEventListener('change', () => {
  Array.from(fileInput.files).forEach(addFile);
  fileInput.value = '';
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  Array.from(e.dataTransfer.files).forEach(addFile);
});

clearBtn.addEventListener('click', () => {
  if (!files.length) {
    term.error('No file to clear.');
    return;
  }
  clearAllDrafts();
  files = [];
  nextId = 0;
  currentOutputRows = null;
  lastStackSerialized = null;
  renderChips();
  updateOptionsVisibility();
  outputArea.innerHTML = '';
  save.hide();
  history.clear();
  updateHistoryButtons();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.files && draft.files.length) {
    files = draft.files;
    nextId = draft.nextId || files.length;
    renderChips();
    updateOptionsVisibility();
    if (draft.currentOutputRows) {
      currentOutputRows = draft.currentOutputRows;
      lastStackSerialized = draft.lastStackSerialized || null;
      renderTable(currentOutputRows);
      save.show();
    }
    history.reset(snapshot());
    updateHistoryButtons();
    term.say('Restored your last session.');
  } else {
    term.say('Add two or more files.');
    updateHistoryButtons();
  }
})();
