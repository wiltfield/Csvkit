// Separate module worker (not the shared csv-worker.js) because parsing
// xlsx/xls/ods needs the SheetJS library, which only works as an ES import
// in a { type: 'module' } worker. Everything else (json, ndjson, tsv,
// geojson, dbf, fixed-width) is parsed by hand here too, keeping this
// worker self-contained.
import * as XLSX from 'xlsx';

function objectsToRows(arr) {
  const keys = [];
  arr.forEach((obj) => {
    Object.keys(obj || {}).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
  });
  const body = arr.map((obj) => keys.map((k) => (obj && obj[k] !== undefined ? String(obj[k]) : '')));
  return [keys, ...body];
}

function parseJSONInput(text) {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : [data];
  return objectsToRows(arr);
}

function parseNDJSONInput(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length);
  const arr = lines.map((line) => JSON.parse(line));
  return objectsToRows(arr);
}

function parseGeoJSONInput(text) {
  const data = JSON.parse(text);
  let features;
  if (data.type === 'FeatureCollection') features = data.features || [];
  else if (data.type === 'Feature') features = [data];
  else features = [];

  const arr = features.map((f) => ({
    ...(f.properties || {}),
    geometry: JSON.stringify(f.geometry ?? null),
  }));
  return objectsToRows(arr);
}

function parseTSVInput(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length);
  return lines.map((line) => line.split('\t'));
}

// xlsx/xls/ods all read the same way through SheetJS.
function parseSpreadsheetInput(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return rows.map((r) => r.map((c) => (c === undefined || c === null ? '' : String(c))));
}

// Minimal dBase III/IV (.dbf) reader: header gives field name/type/length,
// each record is a fixed-width row of field values, memo (M) fields are
// left as their raw pointer text since the .dbt memo file isn't read here.
function parseDBFInput(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const numRecords = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  const decoder = new TextDecoder('latin1');

  const fields = [];
  let offset = 32;
  while (bytes[offset] !== 0x0d && offset < headerLen) {
    let name = '';
    for (let i = 0; i < 11; i++) {
      const c = bytes[offset + i];
      if (c === 0) break;
      name += String.fromCharCode(c);
    }
    const length = bytes[offset + 16];
    fields.push({ name, length });
    offset += 32;
  }

  const header = fields.map((f) => f.name);
  const body = [];
  let recOffset = headerLen;
  for (let r = 0; r < numRecords; r++) {
    const deleted = bytes[recOffset] === 0x2a;
    let fieldOffset = recOffset + 1;
    const row = fields.map((f) => {
      const raw = decoder.decode(bytes.slice(fieldOffset, fieldOffset + f.length)).trim();
      fieldOffset += f.length;
      return raw;
    });
    if (!deleted) body.push(row);
    recOffset += recordLen;
  }
  return [header, ...body];
}

// Fixed-width text needs a schema telling us where each column starts and
// how wide it is. Schema is a small CSV: header row "column,start,length",
// one data row per column, start is 0-indexed.
function parseSchema(schemaText) {
  const lines = schemaText.split(/\r\n|\n|\r/).filter((l) => l.trim().length);
  return lines.slice(1).map((line) => {
    const [column, start, length] = line.split(',');
    return { column: (column || '').trim(), start: Number(start), length: Number(length) };
  });
}

function parseFixedInput(text, schemaText) {
  const defs = parseSchema(schemaText);
  const header = defs.map((d) => d.column);
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length);
  const body = lines.map((line) => defs.map((d) => line.slice(d.start, d.start + d.length).trim()));
  return [header, ...body];
}

self.onmessage = (e) => {
  const { format, text, buffer, schemaText } = e.data;
  try {
    let rows;
    if (format === 'json') rows = parseJSONInput(text);
    else if (format === 'ndjson') rows = parseNDJSONInput(text);
    else if (format === 'geojson') rows = parseGeoJSONInput(text);
    else if (format === 'tsv') rows = parseTSVInput(text);
    else if (format === 'xlsx' || format === 'xls' || format === 'ods') rows = parseSpreadsheetInput(buffer);
    else if (format === 'dbf') rows = parseDBFInput(buffer);
    else if (format === 'fixed') rows = parseFixedInput(text, schemaText);
    else throw new Error('Unsupported format');
    self.postMessage({ ok: true, rows });
  } catch (err) {
    self.postMessage({ ok: false, error: 'Could not convert that file.' });
  }
};
