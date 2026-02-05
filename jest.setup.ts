/**
 * Jest setup file.
 * Provide a simple global fetch mock so tests can stub it.
 */

declare const global: any;

if (!global.fetch) {
  global.fetch = jest.fn();
}

export {};
