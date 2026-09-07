import { createTerminal } from './terminal.js';
import { setupSaveButton } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';

const DRAFT_KEY = 'csvlook';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const clearBtn = document.getElementById('clear-btn');

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));

let currentRows = null;

const save = setupSaveButton({
  saveRow: document.getElementById('save-row'),
  button: document.getElementById('save-btn'),
  box: document.getElementById('save-box'),
  input: document.getElementById('save-filename'),
  confirmBtn: document.getElementById('save-confirm'),
  cancelBtn: document.getElementById('save-cancel'),
  getRows: () => currentRows,
  onSave: () => clearDraft(DRAFT_KEY),
});

const persist = debounce(() => {
  if (!currentRows) return;
  saveDraft(DRAFT_KEY, { currentRows });
});

function renderTable(rows) {
  currentRows = rows;
  if (!rows.length) {
    outputArea.innerHTML = '<p class="lead">No data found in that file.</p>';
    save.hide();
    return;
  }
  const [header, ...body] = rows;
  const thead = `<tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = body
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  outputArea.innerHTML = `<table class="output-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  save.show();
}

worker.onmessage = (e) => {
  const { ok, rows, error } = e.data;
  if (ok) {
    renderTable(rows);
    term.say('File is ready.');
    persist();
  } else {
    term.error(error || 'Could not process that file.');
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
  save.hide();
  term.say('Uploading...');
  const reader = new FileReader();

  // reports real read progress for big files instead of a static message
  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      term.say(`Uploading... ${pct}%`);
    }
  };

  reader.onload = () => {
    term.say('Formatting...');
    worker.postMessage({ op: 'look', text: reader.result });
  };
  reader.onerror = () => term.error('Could not read that file.');
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

clearBtn.addEventListener('click', () => {
  if (!currentRows) {
    term.error('No file to clear.');
    return;
  }
  clearAllDrafts();
  currentRows = null;
  outputArea.innerHTML = '';
  save.hide();
  term.say('File cleared from storage.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.currentRows) {
    renderTable(draft.currentRows);
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
  }
})();
