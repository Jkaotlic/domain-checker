/**
 * Jest setup file.
 * Provide a simple global fetch mock so tests can stub it.
 */

declare const global: { fetch?: typeof fetch };

if (!global.fetch) {
  // Cast jest.fn() to the expected `fetch` type to avoid `any`.
  global.fetch = (jest.fn() as unknown) as typeof fetch;
}

export {};
