jest.mock('../lib/net/fetchWithRetry', () => ({
  fetchWithRetry: jest.fn(),
}));

import { fetchSource } from '../lib/sources/fetchSource';
import { fetchWithRetry } from '../lib/net/fetchWithRetry';

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<typeof fetchWithRetry>;

describe('fetchSource', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns filtered subdomains from parser output', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: async () => ['sub.example.com', 'other.notexample.com', 'deep.sub.example.com'],
    } as any);

    const result = await fetchSource(
      'https://api.test.com',
      (data) => data as string[],
      'example.com',
      'test-source',
    );

    expect(result).toContain('sub.example.com');
    expect(result).toContain('deep.sub.example.com');
    expect(result).not.toContain('other.notexample.com');
  });

  test('strips wildcard prefix from names', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: async () => ['*.example.com', '*.api.example.com'],
    } as any);

    const result = await fetchSource(
      'https://api.test.com',
      (data) => data as string[],
      'example.com',
      'test-source',
    );

    expect(result).toContain('example.com');
    expect(result).toContain('api.example.com');
    expect(result).not.toContain('*.example.com');
  });

  test('returns empty array on HTTP error', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as any);

    const result = await fetchSource(
      'https://api.test.com',
      (data) => data as string[],
      'example.com',
      'test-source',
    );

    expect(result).toEqual([]);
  });

  test('returns empty array on network error', async () => {
    mockFetchWithRetry.mockRejectedValueOnce(new Error('network error'));

    const result = await fetchSource(
      'https://api.test.com',
      (data) => data as string[],
      'example.com',
      'test-source',
    );

    expect(result).toEqual([]);
  });

  test('deduplicates results', async () => {
    mockFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: async () => ['api.example.com', 'API.EXAMPLE.COM', 'api.example.com'],
    } as any);

    const result = await fetchSource(
      'https://api.test.com',
      (data) => data as string[],
      'example.com',
      'test-source',
    );

    expect(result).toEqual(['api.example.com']);
  });
});
