import { createTerminal } from './terminal.js';
import { setupJSONSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';

const DRAFT_KEY = 'csvjson';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));

let parsedRows = null;
let currentJSON = null;
let lastJSON = null;

const save = setupJSONSaveButton({
  saveRow: document.getElementById('save-row'),
  button: document.getElementById('save-btn'),
  box: document.getElementById('save-box'),
  input: document.getElementById('save-filename'),
  confirmBtn: document.getElementById('save-confirm'),
  cancelBtn: document.getElementById('save-cancel'),
  getJSON: () => currentJSON,
  onSave: () => clearDraft(DRAFT_KEY),
});

function renderJSON(json) {
  outputArea.innerHTML = `<pre class="json-view">${json.replace(/</g, '&lt;')}</pre>`;
}

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, { parsedRows, currentJSON, lastJSON });
});

worker.onmessage = (e) => {
  const { ok, rows, json, error } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }
  if (parsedRows === null && rows !== undefined) {
    parsedRows = rows;
    optionsPanel.classList.add('visible');
    term.say('File is ready. Convert to JSON.');
    save.hide();
    persist();
  } else if (json !== undefined) {
    renderJSON(json);
    if (json === lastJSON) {
      term.error('Already converted, nothing changed.');
    } else {
      lastJSON = json;
      currentJSON = json;
      save.show();
      term.say('Converted to JSON.');
      persist();
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
  currentJSON = null;
  lastJSON = null;
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
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
  term.say('Converting...');
  worker.postMessage({ op: 'json', rows: parsedRows });
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
  currentJSON = null;
  lastJSON = null;
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
  save.hide();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    optionsPanel.classList.add('visible');
    if (draft.currentJSON) {
      currentJSON = draft.currentJSON;
      lastJSON = draft.lastJSON;
      renderJSON(draft.currentJSON);
      save.show();
    }
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
  }
})();
