/**
 * Minimal React Native test environment setup.
 *
 * Replaces @react-native/jest-preset/jest/setup.js which contains Flow type
 * annotations that babel-jest cannot parse without the full react-native
 * babel preset. This provides the subset of globals that
 * @testing-library/react-native needs for our component tests.
 */

'use strict';

// Provide requestAnimationFrame / cancelAnimationFrame stubs required by React.
if (typeof global.requestAnimationFrame !== 'function') {
  global.requestAnimationFrame = function (callback) {
    return setTimeout(callback, 0);
  };
}

if (typeof global.cancelAnimationFrame !== 'function') {
  global.cancelAnimationFrame = function (id) {
    clearTimeout(id);
  };
}

// window alias (React Native 0.45+)
if (typeof window !== 'object') {
  globalThis.window = global;
  globalThis.window.navigator = {};
}

// Silence React DevTools warning in test env
if (typeof globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined') {
  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: true,
    renderers: { values: () => [] },
    on() {},
    off() {},
    inject() {},
    checkDCE() {},
  };
  globalThis.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
}
