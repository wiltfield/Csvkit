import { createTerminal } from './terminal.js';
import { triggerDownload } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { setupConnectionUI, isConnected } from './db-connection.js';

const DRAFT_KEY = 'csvsql';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const optionsPanel = document.getElementById('options-panel');
const tableNameInput = document.getElementById('table-name-input');
const dialectSelect = document.getElementById('dialect-select');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');

const saveRow = document.getElementById('save-row');
const saveBtn = document.getElementById('save-btn');
const saveBox = document.getElementById('save-box');
const saveFilename = document.getElementById('save-filename');
const saveConfirm = document.getElementById('save-confirm');
const saveCancel = document.getElementById('save-cancel');

const insertBtn = document.getElementById('insert-db-btn');

let dbConnected = false;
setupConnectionUI({
  connectBtn: document.getElementById('db-connect-btn'),
  statusRow: document.getElementById('db-status-row'),
  disconnectBtn: document.getElementById('db-disconnect-btn'),
  formBox: document.getElementById('db-form'),
  connStrInput: document.getElementById('db-connstr-input'),
  formConfirm: document.getElementById('db-form-confirm'),
  formCancel: document.getElementById('db-form-cancel'),
  confirmBox: document.getElementById('db-disconnect-confirm'),
  confirmYes: document.getElementById('db-disconnect-yes'),
  confirmNo: document.getElementById('db-disconnect-no'),
}, term, (connected) => {
  dbConnected = connected;
  insertBtn.classList.toggle('stub-btn', !connected);
});

const worker = new Worker('src/csv-worker.js');

let parsedRows = null;
let currentSQL = null;
let lastTableName = null;
let lastDialect = null;

function renderSQL(sql) {
  if (!sql) {
    outputArea.innerHTML = '<p class="lead">No data found in that file.</p>';
    return;
  }
  outputArea.innerHTML = `<pre class="json-view">${sql.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
}

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, {
    parsedRows,
    currentSQL,
    lastTableName,
    lastDialect,
    tableNameValue: tableNameInput.value,
    dialectValue: dialectSelect.value,
  });
});

worker.onmessage = (e) => {
  const { ok, error, rows, sql } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    return;
  }
  if (rows && parsedRows === null) {
    // Initial parse of the uploaded file.
    parsedRows = rows;
    optionsPanel.classList.add('visible');
    outputArea.innerHTML = '<p class="lead">File is ready. Name your table and generate SQL.</p>';
    term.say('File is ready. Name your table and generate SQL.');
    persist();
    return;
  }
  // SQL generation result.
  currentSQL = sql;
  lastTableName = tableNameInput.value.trim() || 'data';
  lastDialect = dialectSelect.value;
  renderSQL(sql);
  saveRow.classList.add('visible');
  term.say('SQL generated. Save the file or insert into a database.');
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
  parsedRows = null;
  currentSQL = null;
  lastTableName = null;
  optionsPanel.classList.remove('visible');
  saveRow.classList.remove('visible');
  saveBox.classList.remove('visible');
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
  const tableName = tableNameInput.value.trim() || 'data';
  const dialect = dialectSelect.value;
  if (currentSQL && tableName === lastTableName && dialect === lastDialect) {
    term.error(`Already generated ${dialectSelect.options[dialectSelect.selectedIndex].text} SQL for table "${tableName}".`);
    return;
  }
  term.say('Generating SQL...');
  worker.postMessage({ op: 'sql', rows: parsedRows, tableName, dialect });
});

tableNameInput.addEventListener('input', persist);
dialectSelect.addEventListener('change', persist);

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
  currentSQL = null;
  lastTableName = null;
  tableNameInput.value = '';
  optionsPanel.classList.remove('visible');
  outputArea.innerHTML = '';
  saveRow.classList.remove('visible');
  saveBox.classList.remove('visible');
  term.say('File cleared from storage.');
});

// Save wiring: downloads currentSQL as a .sql file (text, not CSV rows,
// so this doesn't reuse download.js's setupSaveButton).
saveBtn.addEventListener('click', () => {
  saveFilename.value = `${lastTableName || 'data'}.sql`;
  saveBox.classList.add('visible');
  saveFilename.focus();
  const dot = saveFilename.value.lastIndexOf('.');
  saveFilename.setSelectionRange(0, dot > 0 ? dot : saveFilename.value.length);
});

saveCancel.addEventListener('click', () => saveBox.classList.remove('visible'));

saveConfirm.addEventListener('click', () => {
  if (!currentSQL) {
    saveBox.classList.remove('visible');
    return;
  }
  let name = saveFilename.value.trim() || 'data.sql';
  if (!name.toLowerCase().endsWith('.sql')) name += '.sql';
  triggerDownload(name, currentSQL, 'application/sql;charset=utf-8;');
  saveBox.classList.remove('visible');
  clearDraft(DRAFT_KEY);
});

saveFilename.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveConfirm.click();
  if (e.key === 'Escape') saveCancel.click();
});

// Actually inserting into the DB is wired in a later chunk. For now this
// just reflects connection state; the insert call itself is still stubbed.
insertBtn.addEventListener('click', () => {
  if (!dbConnected) {
    term.error('Connect a database first.');
    return;
  }
  term.error('Database is connected, but insert isn\u2019t wired up yet.');
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    optionsPanel.classList.add('visible');
    if (draft.tableNameValue) tableNameInput.value = draft.tableNameValue;
    if (draft.dialectValue) dialectSelect.value = draft.dialectValue;
    if (draft.currentSQL) {
      currentSQL = draft.currentSQL;
      lastTableName = draft.lastTableName;
      lastDialect = draft.lastDialect;
      renderSQL(currentSQL);
      saveRow.classList.add('visible');
    } else {
      outputArea.innerHTML = '<p class="lead">File is ready. Name your table and generate SQL.</p>';
    }
    term.say('Restored your last session.');
  } else {
    term.say('Upload your file.');
  }
})();
