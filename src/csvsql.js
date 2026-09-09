import { createTerminal } from './terminal.js';
import { triggerDownload } from './download.js';
import { saveDraft, loadDraft, clearDraft, clearAllDrafts, debounce } from './draft-storage.js';
import { setupConnectionUI, getConnectionString, runInsert } from './db-connection.js';

const DRAFT_KEY = 'csvsql';

const term = createTerminal(document.getElementById('terminal'));
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const outputArea = document.getElementById('output-area');
const tableNameInput = document.getElementById('table-name-input');

const modeToggle = document.getElementById('mode-toggle');
const generatePanel = document.getElementById('generate-panel');
const connectPanel = document.getElementById('connect-panel');
const dialectSelect = document.getElementById('dialect-select');
const connectDialectSelect = document.getElementById('connect-dialect-select');
const runBtn = document.getElementById('run-btn');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');

const saveRow = document.getElementById('save-row');
const saveBtn = document.getElementById('save-btn');
const saveBox = document.getElementById('save-box');
const saveFilename = document.getElementById('save-filename');
const saveConfirm = document.getElementById('save-confirm');
const saveCancel = document.getElementById('save-cancel');

const insertBtn = document.getElementById('insert-db-btn');

let mode = 'generate'; // 'generate' | 'connect'
let dbConnected = false;

setupConnectionUI({
  selectEl: document.getElementById('db-select'),
  statusRow: document.getElementById('db-status-row'),
  statusText: document.getElementById('db-status-text'),
  renameBtn: document.getElementById('db-rename-btn'),
  removeBtn: document.getElementById('db-remove-btn'),
  renameBox: document.getElementById('db-rename-box'),
  renameInput: document.getElementById('db-rename-input'),
  renameConfirm: document.getElementById('db-rename-confirm'),
  renameCancel: document.getElementById('db-rename-cancel'),
  formBox: document.getElementById('db-form'),
  nameInput: document.getElementById('db-name-input'),
  connStrInput: document.getElementById('db-connstr-input'),
  formConfirm: document.getElementById('db-form-confirm'),
  formCancel: document.getElementById('db-form-cancel'),
  confirmBox: document.getElementById('db-remove-confirm'),
  confirmYes: document.getElementById('db-remove-yes'),
  confirmNo: document.getElementById('db-remove-no'),
  dialectSelect: connectDialectSelect,
}, term, (connected) => {
  dbConnected = connected;
  insertBtn.classList.toggle('stub-btn', !connected);
});

const worker = new Worker(new URL('./csv-worker.js', import.meta.url));

let parsedRows = null;
let currentSQL = null;
let currentStatements = null;
let lastTableName = null;
let lastDialect = null;

// Set right before postMessage({op:'sql', ...}) so onmessage knows which
// table/dialect the result belongs to, and whether an insert should follow.
let pendingGeneration = null; // { tableName, dialect }
let pendingInsertAfterGenerate = null; // { connStr, tableName, dialect }

function renderSQL(sql) {
  if (!sql) {
    outputArea.innerHTML = '<p class="lead">No data found in that file.</p>';
    return;
  }
  outputArea.innerHTML = `<pre class="json-view">${sql.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
}

function updatePanelVisibility() {
  modeToggle.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const ready = !!parsedRows;
  generatePanel.classList.toggle('visible', ready && mode === 'generate');
  connectPanel.classList.toggle('visible', ready && mode === 'connect');
}

function switchMode(newMode) {
  mode = newMode;
  updatePanelVisibility();
  persist();
}

modeToggle.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

const persist = debounce(() => {
  if (!parsedRows) return;
  saveDraft(DRAFT_KEY, {
    parsedRows,
    currentSQL,
    currentStatements,
    lastTableName,
    lastDialect,
    tableNameValue: tableNameInput.value,
    dialectValue: dialectSelect.value,
    connectDialectValue: connectDialectSelect.value,
    mode,
  });
});

worker.onmessage = (e) => {
  const { ok, error, rows, sql, statements } = e.data;
  if (!ok) {
    term.error(error || 'Could not process that file.');
    pendingGeneration = null;
    pendingInsertAfterGenerate = null;
    return;
  }
  if (rows && parsedRows === null) {
    // Initial parse of the uploaded file.
    parsedRows = rows;
    updatePanelVisibility();
    outputArea.innerHTML = '<p class="lead">File is ready. Name your table and generate SQL.</p>';
    term.say('File is ready. Name your table and generate SQL.');
    persist();
    return;
  }
  // SQL generation result.
  currentSQL = sql;
  currentStatements = statements;
  lastTableName = pendingGeneration ? pendingGeneration.tableName : (tableNameInput.value.trim() || 'data');
  lastDialect = pendingGeneration ? pendingGeneration.dialect : dialectSelect.value;
  pendingGeneration = null;
  renderSQL(sql);
  saveRow.classList.add('visible');
  term.say('SQL generated. Save the file or insert into a database.');
  persist();

  if (pendingInsertAfterGenerate) {
    const { connStr, tableName, dialect } = pendingInsertAfterGenerate;
    pendingInsertAfterGenerate = null;
    doInsert(connStr, currentStatements, dialect, tableName);
  }
};

worker.onerror = () => {
  term.error('Could not process that file.');
  pendingGeneration = null;
  pendingInsertAfterGenerate = null;
};

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
  currentStatements = null;
  lastTableName = null;
  updatePanelVisibility();
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
  pendingGeneration = { tableName, dialect };
  term.say('Generating SQL...');
  worker.postMessage({ op: 'sql', rows: parsedRows, tableName, dialect });
});

copyBtn.addEventListener('click', () => {
  if (!currentSQL) {
    term.error('Nothing to copy.');
    return;
  }
  navigator.clipboard.writeText(currentSQL).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.disabled = true;
    setTimeout(() => {
      copyBtn.textContent = original;
      copyBtn.disabled = false;
    }, 1500);
  }).catch(() => {
    term.error('Could not copy to clipboard.');
  });
});

tableNameInput.addEventListener('input', persist);
dialectSelect.addEventListener('change', persist);
connectDialectSelect.addEventListener('change', persist);

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
  currentStatements = null;
  lastTableName = null;
  pendingGeneration = null;
  pendingInsertAfterGenerate = null;
  tableNameInput.value = '';
  updatePanelVisibility();
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

// Inserts the given statements into the connected database via the
// relay's /insert endpoint.
async function doInsert(connStr, statements, dialect, tableName) {
  insertBtn.disabled = true;
  term.say(`Inserting into "${tableName || 'data'}"...`);
  const result = await runInsert(connStr, statements, dialect);
  insertBtn.disabled = false;
  if (!result.ok) {
    term.error(result.error || 'Insert failed.');
    return;
  }
  term.say(`Inserted into "${tableName || 'data'}".`);
}

// Insert into database: generates SQL for the current table name + connect
// dialect if it isn't already generated for that exact combo, then inserts.
insertBtn.addEventListener('click', async () => {
  if (!parsedRows) {
    term.error('Upload a file first.');
    return;
  }
  if (!dbConnected) {
    term.error('Connect a database first.');
    return;
  }
  const connStr = getConnectionString();
  if (!connStr) {
    term.error('Connect a database first.');
    return;
  }
  const tableName = tableNameInput.value.trim() || 'data';
  const dialect = connectDialectSelect.value;

  if (currentStatements && tableName === lastTableName && dialect === lastDialect) {
    doInsert(connStr, currentStatements, dialect, tableName);
    return;
  }

  pendingGeneration = { tableName, dialect };
  pendingInsertAfterGenerate = { connStr, tableName, dialect };
  term.say('Generating SQL...');
  worker.postMessage({ op: 'sql', rows: parsedRows, tableName, dialect });
});

(function restore() {
  const draft = loadDraft(DRAFT_KEY);
  if (draft && draft.parsedRows) {
    parsedRows = draft.parsedRows;
    if (draft.tableNameValue) tableNameInput.value = draft.tableNameValue;
    if (draft.dialectValue) dialectSelect.value = draft.dialectValue;
    if (draft.connectDialectValue) connectDialectSelect.value = draft.connectDialectValue;
    mode = draft.mode === 'connect' ? 'connect' : 'generate';
    updatePanelVisibility();
    if (draft.currentSQL) {
      currentSQL = draft.currentSQL;
      currentStatements = draft.currentStatements || null;
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
