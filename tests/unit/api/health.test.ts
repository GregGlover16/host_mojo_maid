import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../src/app';
import type { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok: true', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ ok: boolean; timestamp: string }>();
    expect(body.ok).toBe(true);
    expect(body.timestamp).toBeDefined();
  });
});
