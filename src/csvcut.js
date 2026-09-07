import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';

const DRAFT_KEY = 'csvcut';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const colPicker = document.getElementById('col-picker');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));

let parsedRows = null;
let selectedOrder = []; // indices in click order
let currentOutputRows = null;
let lastApplied = null; // indices/order of the last cut actually run
let pendingOrder = null;

function sameOrder(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

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

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, { parsedRows, currentOutputRows, selectedOrder, lastApplied });
});

function buildColPicker(header, checkedIndices) {
  colPicker.innerHTML = header
    .map((name, i) => `
      <label>
        <input type="checkbox" value="${i}" ${checkedIndices.includes(i) ? 'checked' : ''}>
        ${name}
      </label>
    `)
    .join('');
  selectedOrder = [...checkedIndices];

  colPicker.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.value);
      if (cb.checked) {
        if (!selectedOrder.includes(idx)) selectedOrder.push(idx);
      } else {
        selectedOrder = selectedOrder.filter((i) => i !== idx);
      }
      persist();
    });
  });
}

worker.onmessage = (e) => {
  const { ok, rows, error, changed } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }
  if (parsedRows === null) {
    parsedRows = rows;
    buildColPicker(rows[0] || [], (rows[0] || []).map((_, i) => i));
    optionsPanel.classList.add('visible');
    renderTable(rows);
    term.say('File is ready. Pick columns and run.');
    save.hide();
    persist();
  } else {
    renderTable(rows);
    lastApplied = pendingOrder;
    if (changed) {
      currentOutputRows = rows;
      save.show();
      term.say('Columns cut.');
    } else {
      term.error('No columns were removed or reordered.');
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
  if (!selectedOrder.length) {
    term.error('Select at least one column.');
    return;
  }
  if (sameOrder(lastApplied, selectedOrder)) {
    term.error('Already cut with that column selection.');
    return;
  }
  pendingOrder = [...selectedOrder];
  term.say('Cutting columns...');
  worker.postMessage({ op: 'cut', rows: parsedRows, indices: selectedOrder });
});

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
  selectedOrder = [];
  lastApplied = null;
  colPicker.innerHTML = '';
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
  save.hide();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    buildColPicker(parsedRows[0] || [], draft.selectedOrder || (parsedRows[0] || []).map((_, i) => i));
    optionsPanel.classList.add('visible');
    if (draft.lastApplied) lastApplied = draft.lastApplied;
    const rowsToShow = draft.currentOutputRows || parsedRows;
    renderTable(rowsToShow);
    if (draft.currentOutputRows) {
      currentOutputRows = draft.currentOutputRows;
      save.show();
    }
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
  }
})();
