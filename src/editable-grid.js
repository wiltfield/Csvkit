// Shared editable-table logic for csvedit and csvcreate. Renders an
// array-of-arrays as a grid of <input> cells (header row included), wires
// cell editing, add/remove row/column, and per-column ascending/descending
// sort. Reports back what happened via onChange so each page can decide
// its own terminal wording and when to persist a draft; this module only
// touches the DOM and the rows array itself.
function escapeAttr(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Loosely numeric-aware compare so sorting "2" before "10" works as
// expected, falls back to locale string compare for non-numeric columns.
function compareValues(a, b) {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  const aIsNum = a !== '' && !Number.isNaN(na) && String(na) === String(a).trim();
  const bIsNum = b !== '' && !Number.isNaN(nb) && String(nb) === String(b).trim();
  if (aIsNum && bIsNum) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function createEditableGrid(container, { getRows, onChange }) {
  function render() {
    const rows = getRows();
    if (!rows.length || !rows[0].length) {
      container.innerHTML = '<p class="lead">No columns yet.</p>';
      return;
    }
    const [header, ...body] = rows;
    const headCells = header
      .map((h, c) => `
        <th>
          <div class="th-inner">
            <input class="cell-input header-input" type="text" value="${escapeAttr(h)}" data-col="${c}">
            <span class="sort-btns">
              <button class="sort-btn" type="button" data-col="${c}" data-dir="asc" title="Sort ascending">&#9650;</button>
              <button class="sort-btn" type="button" data-col="${c}" data-dir="desc" title="Sort descending">&#9660;</button>
            </span>
            <button class="remove-col-btn" type="button" data-col="${c}" title="Remove column">&times;</button>
          </div>
        </th>
      `)
      .join('');
    const bodyRows = body
      .map((row, r) => `
        <tr>
          ${row.map((val, c) => `<td><input class="cell-input" type="text" value="${escapeAttr(val)}" data-row="${r}" data-col="${c}"></td>`).join('')}
          <td class="row-actions"><button class="remove-row-btn" type="button" data-row="${r}" title="Remove row">&times;</button></td>
        </tr>
      `)
      .join('');
    container.innerHTML = `
      <table class="output-table edit-table">
        <thead><tr>${headCells}<th></th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  container.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.classList.contains('cell-input')) return;
    const rows = getRows();
    const col = Number(t.dataset.col);
    if (t.classList.contains('header-input')) {
      rows[0][col] = t.value;
    } else {
      rows[Number(t.dataset.row) + 1][col] = t.value;
    }
    onChange('edit');
  });

  container.addEventListener('click', (e) => {
    const t = e.target;
    const rows = getRows();
    if (t.classList.contains('remove-row-btn')) {
      if (rows.length <= 1) { onChange('remove-row-blocked'); return; }
      rows.splice(Number(t.dataset.row) + 1, 1);
      render();
      onChange('remove-row');
    } else if (t.classList.contains('remove-col-btn')) {
      if (rows[0].length <= 1) { onChange('remove-col-blocked'); return; }
      const col = Number(t.dataset.col);
      rows.forEach((r) => r.splice(col, 1));
      render();
      onChange('remove-col');
    } else if (t.classList.contains('sort-btn')) {
      const col = Number(t.dataset.col);
      const dir = t.dataset.dir;
      const [header, ...body] = rows;
      body.sort((a, b) => {
        const cmp = compareValues(a[col], b[col]);
        return dir === 'desc' ? -cmp : cmp;
      });
      rows.splice(0, rows.length, header, ...body);
      render();
      onChange('sort-col');
    }
  });

  function addRow() {
    const rows = getRows();
    const colCount = rows[0]?.length || 1;
    rows.push(Array(colCount).fill(''));
    render();
    onChange('add-row');
  }

  function addColumn() {
    const rows = getRows();
    const n = (rows[0]?.length || 0) + 1;
    rows.forEach((r, i) => r.push(i === 0 ? `Column ${n}` : ''));
    render();
    onChange('add-col');
  }

  return { render, addRow, addColumn };
}
