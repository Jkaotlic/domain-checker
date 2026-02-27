jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({ body, status: init?.status || 200 }),
  },
}));

import { POST } from '../app/api/check/route';

const mockHeaders = { get: () => null };

describe('app/api/check/route', () => {
  test('returns 400 for missing domain', async () => {
    const req: any = { json: async () => ({}), headers: mockHeaders };
    const res: any = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // Full integration test: DNS brute-force + 10 OSINT sources + resolve.
  // Requires network and may exceed CI timeouts. Run manually with:
  //   INTEGRATION=1 npx jest __tests__/api-check-route.test.ts
  const runIntegration = process.env.INTEGRATION === '1' ? test : test.skip;
  runIntegration('returns result structure for example.com', async () => {
    const req: any = { json: async () => ({ domain: 'example.com' }), headers: mockHeaders };
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('domain', 'example.com');
    expect(res.body).toHaveProperty('subdomains');
  }, 120000);
});
