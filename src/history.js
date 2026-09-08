// Simple bounded undo/redo stack. States are stored as JSON-cloned
// snapshots so later mutations to the live objects can't corrupt history.
export function createHistory(limit = 20) {
  let stack = [];
  let index = -1;

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function reset(initialState) {
    stack = [clone(initialState)];
    index = 0;
  }

  function push(state) {
    if (index < 0) {
      reset(state);
      return;
    }
    stack = stack.slice(0, index + 1);
    stack.push(clone(state));
    if (stack.length > limit) stack.shift();
    index = stack.length - 1;
  }

  function canUndo() {
    return index > 0;
  }

  function canRedo() {
    return index >= 0 && index < stack.length - 1;
  }

  function undo() {
    if (!canUndo()) return null;
    index--;
    return clone(stack[index]);
  }

  function redo() {
    if (!canRedo()) return null;
    index++;
    return clone(stack[index]);
  }

  function clear() {
    stack = [];
    index = -1;
  }

  return { reset, push, undo, redo, canUndo, canRedo, clear };
}
