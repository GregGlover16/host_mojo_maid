import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../src/app';
import type { FastifyInstance } from 'fastify';

describe('GET /version', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns version from package.json and environment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/version',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ version: string; environment: string }>();
    expect(body.version).toBe('0.1.0');
    expect(body.environment).toBe('test');
  });
});
