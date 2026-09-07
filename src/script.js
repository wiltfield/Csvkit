const root = document.documentElement;
const toggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  toggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  localStorage.setItem('theme', theme);
}

const saved = localStorage.getItem('theme');
applyTheme(saved === 'light' ? 'light' : 'dark');

toggle.addEventListener('click', () => {
  const current = root.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// homepage only: clicking an operation button goes to its page
document.querySelectorAll('.op[data-op]').forEach((btn) => {
  btn.addEventListener('click', () => {
    window.location.href = `${btn.dataset.op}.html`;
  });
});
