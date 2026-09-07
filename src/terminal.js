// Shared terminal status screen logic, used by every operation page.
const MAX_LINES = 3;

export function createTerminal(el) {
  let lines = [];

  function render() {
    el.innerHTML = lines
      .map((l) => `<div class="terminal-line">${l}</div>`)
      .join('');
  }

  return {
    say(msg) {
      el.classList.remove('error');
      lines.push(msg);
      if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
      render();
    },
    error(msg) {
      el.classList.add('error');
      lines.push(msg);
      if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
      render();
    },
    clear() {
      lines = [];
      el.classList.remove('error');
      render();
    },
  };
}
