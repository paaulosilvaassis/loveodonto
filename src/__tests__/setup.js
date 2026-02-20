const store = new Map();

global.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

if (!global.crypto) {
  global.crypto = {};
}

if (!global.crypto.randomUUID) {
  let counter = 0;
  global.crypto.randomUUID = () => {
    counter += 1;
    return `test-uuid-${counter}`;
  };
}
