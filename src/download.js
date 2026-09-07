// Shared "Save" logic used by every operation page: turns the current
// output rows into a CSV file and triggers a browser download, after
// asking the user for a filename (defaults to new.csv).

function escapeField(field, delimiter) {
  const str = String(field ?? '');
  if (str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(delimiter)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function rowsToCSV(rows, delimiter = ',') {
  return rows.map((row) => row.map((f) => escapeField(f, delimiter)).join(delimiter)).join('\r\n');
}

export function triggerDownload(filename, text, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Wires a Save button + inline filename box. getRows() should return the
// current output rows (array of arrays) or null/empty if there's nothing
// to save yet. getDelimiter() is optional (used by csvformat, where the
// saved file's delimiter differs from the parsed-comma table shown on
// screen); everything else saves as plain comma CSV. onSave() is optional,
// called after a real download completes, pages use it to clear their
// autosaved draft since the work is now safely on disk.
export function setupSaveButton({ saveRow, button, box, input, confirmBtn, cancelBtn, getRows, getDelimiter, defaultName = 'new.csv', onSave }) {
  button.addEventListener('click', () => {
    input.value = defaultName;
    box.classList.add('visible');
    input.focus();
    const dot = defaultName.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : defaultName.length);
  });

  cancelBtn.addEventListener('click', () => {
    box.classList.remove('visible');
  });

  confirmBtn.addEventListener('click', () => {
    const rows = getRows();
    if (!rows || !rows.length) {
      box.classList.remove('visible');
      return;
    }
    let name = input.value.trim() || defaultName;
    if (!name.toLowerCase().endsWith('.csv')) name += '.csv';
    const delimiter = getDelimiter ? getDelimiter() : ',';
    triggerDownload(name, rowsToCSV(rows, delimiter));
    box.classList.remove('visible');
    onSave?.();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  });

  return {
    show() { saveRow.classList.add('visible'); },
    hide() { saveRow.classList.remove('visible'); box.classList.remove('visible'); },
  };
}

// csvjson-only variant: saves a JSON string instead of CSV rows, since
// there's no sensible "download as CSV" option for JSON output.
export function setupJSONSaveButton({ saveRow, button, box, input, confirmBtn, cancelBtn, getJSON, onSave }) {
  button.addEventListener('click', () => {
    input.value = 'new.json';
    box.classList.add('visible');
    input.focus();
    input.setSelectionRange(0, 3);
  });

  cancelBtn.addEventListener('click', () => {
    box.classList.remove('visible');
  });

  confirmBtn.addEventListener('click', () => {
    const json = getJSON();
    if (!json) {
      box.classList.remove('visible');
      return;
    }
    let name = input.value.trim() || 'new.json';
    if (!name.toLowerCase().endsWith('.json')) name += '.json';
    triggerDownload(name, json, 'application/json;charset=utf-8;');
    box.classList.remove('visible');
    onSave?.();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  });

  return {
    show() { saveRow.classList.add('visible'); },
    hide() { saveRow.classList.remove('visible'); box.classList.remove('visible'); },
  };
}
