jest.mock('dns/promises', () => ({
  __esModule: true,
  default: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
    resolveCname: jest.fn(),
  },
}));

import dns from 'dns/promises';
import { detectWildcard } from '../lib/reverse';

const dnsMock = dns as unknown as {
  resolve4: jest.Mock;
  resolve6: jest.Mock;
  resolveCname: jest.Mock;
};

describe('detectWildcard', () => {
  beforeEach(() => jest.resetAllMocks());

  test('returns true when all 3 random subdomains resolve to same IPs', async () => {
    dnsMock.resolve4.mockResolvedValue(['1.2.3.4']);
    dnsMock.resolve6.mockResolvedValue([]);
    dnsMock.resolveCname.mockResolvedValue([]);

    const result = await detectWildcard('example.com');
    expect(result).toBe(true);
  });

  test('returns false when no random subdomains resolve', async () => {
    dnsMock.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
    dnsMock.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
    dnsMock.resolveCname.mockRejectedValue(new Error('NXDOMAIN'));

    const result = await detectWildcard('example.com');
    expect(result).toBe(false);
  });

  test('returns false when only 1 of 3 resolves', async () => {
    let callCount = 0;
    dnsMock.resolve4.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(['1.2.3.4']);
      return Promise.reject(new Error('NXDOMAIN'));
    });
    dnsMock.resolve6.mockRejectedValue(new Error('NXDOMAIN'));
    dnsMock.resolveCname.mockRejectedValue(new Error('NXDOMAIN'));

    const result = await detectWildcard('example.com');
    expect(result).toBe(false);
  });

  test('returns false when subdomains resolve to different IPs', async () => {
    let callCount = 0;
    dnsMock.resolve4.mockImplementation(() => {
      callCount++;
      return Promise.resolve([`10.0.0.${callCount}`]);
    });
    dnsMock.resolve6.mockResolvedValue([]);
    dnsMock.resolveCname.mockResolvedValue([]);

    const result = await detectWildcard('example.com');
    expect(result).toBe(false);
  });
});
