jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({ body, status: init?.status || 200 }),
  },
}));

import { POST } from '../../app/api/check/route';

describe('app/api/check/route', () => {
  test('returns 400 for missing domain', async () => {
    const req: any = { json: async () => ({}) };
    const res: any = await POST(req);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns result structure for example.com', async () => {
    const req: any = { json: async () => ({ domain: 'example.com' }) };
    const res: any = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('domain', 'example.com');
    expect(res.body).toHaveProperty('subdomains');
  }, 20000);
});
