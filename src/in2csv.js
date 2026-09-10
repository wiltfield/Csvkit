import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';

const DRAFT_KEY = 'in2csv';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const schemaPanel = document.getElementById('schema-panel');
const schemaInput = document.getElementById('schema-input');
const convertBtn = document.getElementById('convert-btn');
const clearBtn = document.getElementById('clear-btn');

const worker = new Worker(new URL('./in2csv-worker.js', import.meta.url), { type: 'module' });

let currentOutputRows = null;
let pendingText = null; // fixed-width data file, held until a schema is added
let pendingSchemaText = null;

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
  if (currentOutputRows) {
    saveDraft(DRAFT_KEY, { currentOutputRows });
  } else if (pendingText !== null) {
    saveDraft(DRAFT_KEY, { pendingText });
  }
});

worker.onmessage = (e) => {
  const { ok, rows, error } = e.data;
  if (!ok) {
    term.error(error || 'Could not convert that file.');
    save.hide();
    return;
  }
  if (!rows.length) {
    term.error('No data found in that file.');
    save.hide();
    return;
  }
  renderTable(rows);
  currentOutputRows = rows;
  save.show();
  term.say('Converted to CSV.');
  persist();
};

worker.onerror = () => term.error('Could not convert that file.');

function detectFormat(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ndjson')) return 'ndjson';
  if (lower.endsWith('.geojson')) return 'geojson';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.ods')) return 'ods';
  if (lower.endsWith('.dbf')) return 'dbf';
  if (lower.endsWith('.fwf') || lower.endsWith('.txt')) return 'fixed';
  return null;
}

function resetSchemaFlow() {
  pendingText = null;
  pendingSchemaText = null;
  schemaPanel.classList.remove('visible');
  schemaInput.value = '';
}

function tryRunFixed() {
  if (pendingText === null || pendingSchemaText === null) return;
  term.say('Converting...');
  worker.postMessage({ format: 'fixed', text: pendingText, schemaText: pendingSchemaText });
}

function handleFile(file) {
  if (!file) {
    term.error('No file selected.');
    return;
  }
  const format = detectFormat(file.name);
  if (!format) {
    term.error('That file type is not supported.');
    return;
  }

  clearDraft(DRAFT_KEY);
  currentOutputRows = null;
  save.hide();
  resetSchemaFlow();
  term.say('Uploading...');
  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      term.say(`Uploading... ${pct}%`);
    }
  };

  reader.onerror = () => term.error('Could not read that file.');

  if (format === 'xlsx' || format === 'xls' || format === 'ods' || format === 'dbf') {
    reader.onload = () => {
      term.say('Converting...');
      worker.postMessage({ format, buffer: reader.result }, [reader.result]);
    };
    reader.readAsArrayBuffer(file);
  } else if (format === 'fixed') {
    reader.onload = () => {
      pendingText = reader.result;
      schemaPanel.classList.add('visible');
      term.say('File is ready. Add a schema (column,start,length) to convert.');
      persist();
    };
    reader.readAsText(file);
  } else {
    reader.onload = () => {
      term.say('Converting...');
      worker.postMessage({ format, text: reader.result });
    };
    reader.readAsText(file);
  }
}

function handleSchemaFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingSchemaText = reader.result;
    tryRunFixed();
  };
  reader.onerror = () => term.error('Could not read that schema file.');
  reader.readAsText(file);
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

schemaInput.addEventListener('change', () => handleSchemaFile(schemaInput.files[0]));
convertBtn.addEventListener('click', () => {
  if (pendingText === null) {
    term.error('Upload the fixed-width file first.');
    return;
  }
  if (pendingSchemaText === null) {
    term.error('Add a schema file first.');
    return;
  }
  tryRunFixed();
});

clearBtn.addEventListener('click', () => {
  if (!currentOutputRows && pendingText === null) {
    term.error('No file to clear.');
    return;
  }
  clearAllDrafts();
  currentOutputRows = null;
  resetSchemaFlow();
  outputArea.innerHTML = '';
  save.hide();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.currentOutputRows) {
    currentOutputRows = draft.currentOutputRows;
    renderTable(currentOutputRows);
    save.show();
    term.say('Restored your last session.');
  } else if (draft && draft.pendingText) {
    pendingText = draft.pendingText;
    schemaPanel.classList.add('visible');
    term.say('Restored your last session. Add a schema (column,start,length) to convert.');
  } else {
    term.say('Upload a file to convert.');
  }
})();
