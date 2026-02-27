jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({ body, status: init?.status || 200 }),
  },
}));

import { POST } from '../app/api/reverse/route';

const mockHeaders = { get: () => null };

describe('app/api/reverse/route', () => {
  test('returns 400 for missing text', async () => {
    const req: any = { json: async () => ({}), headers: mockHeaders };
    const res: any = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('parses IP list and returns results', async () => {
    const body = { text: '8.8.8.8\n1.1.1.1' };
    const req: any = { json: async () => body, headers: mockHeaders };
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
  }, 20000);
});
