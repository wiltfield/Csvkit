// Shared autosave-to-localStorage helper. Every op page saves enough state
// to fully reconstruct what was on screen, debounced so typing/editing
// doesn't hammer localStorage. A draft is cleared once its page's data is
// either downloaded (real Save) or the user explicitly starts fresh (new
// upload, "New file", etc), so it only ever represents unsaved work.

const PREFIX = 'csvkit-draft:';

export function saveDraft(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch (err) {
    // Storage full, private mode, or unavailable: drafts are a convenience,
    // fail silently rather than breaking the page.
  }
}

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (err) {
    // ignore
  }
}

// Wipes every stored draft, used by the "Clear file" button so a user can
// force a page back to a blank/no-upload state instead of relying on
// autosave to eventually go away on its own.
export function clearAllDrafts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    // ignore
  }
}

export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
