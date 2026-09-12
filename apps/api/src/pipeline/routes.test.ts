// @vitest-environment node
/**
 * The two routes, and the stream in particular.
 *
 * The stream needs its own test because it failed in a way the result could not show: the
 * final frame arrived correctly while every progress frame before it was silently dropped,
 * so the response was valid, the recipes were right, and the screen that exists to narrate
 * the work had nothing to narrate. Only reading the frames catches that.
 *
 * No network and no model: the gateway is built with no generator, so every stage takes its
 * documented fallback, and search is configured as unavailable. What is under test is the
 * plumbing, not the pipeline.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';
import { parseEnv } from '../config/env';
import { createGateway } from '../llm/gateway';

const ORIGIN = 'https://kitchen.example';

const start = () =>
  buildServer({
    env: parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', CORS_ORIGINS: ORIGIN }),
    pipeline: {
      gateway: createGateway({ generate: null }),
      brave: { available: false, reason: 'no search in this test' },
      elevenlabs: { available: false, reason: 'no voice in this test' },
    },
  });

/** Pull the `event: x / data: {...}` frames out of an SSE body. */
const framesIn = (body: string): { event: string; data: Record<string, unknown> }[] =>
  body
    .split('\n\n')
    .filter((block) => block.includes('data:'))
    .map((block) => {
      const event = /^event:\s*(.*)$/m.exec(block)?.[1]?.trim() ?? 'message';
      const data = JSON.parse(/^data:\s*(.*)$/m.exec(block)?.[1] ?? '{}') as Record<string, unknown>;
      return { event, data };
    });

describe('POST /v1/cook', () => {
  it('answers with plain JSON when the caller did not ask to watch', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cook',
      payload: { wants: 'pasta', pantry: 'tomatoes, garlic' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toMatchObject({ recipes: [], notes: expect.any(Array) });
    await app.close();
  });

  it('streams progress frames, not just the result', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cook',
      headers: { accept: 'text/event-stream' },
      payload: { wants: 'pasta', pantry: 'tomatoes, garlic. two of us cooking' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const frames = framesIn(res.body);
    const progress = frames.filter((f) => f.event === 'progress');

    // The regression: the result arrived and every frame before it was dropped.
    expect(progress.length).toBeGreaterThan(1);
    expect(frames.at(-1)?.event).toBe('result');

    // And the frames are in the order the work happens.
    const kinds = progress.map((f) => f.data['kind']);
    expect(kinds[0]).toBe('heard');
    expect(kinds).toContain('searching');

    await app.close();
  });

  /**
   * The stream is written to `reply.raw`, which goes around the reply object — and around
   * every header the CORS plugin put on it. The preflight passed, the JSON route worked,
   * and the browser refused the stream with "Origin is not allowed by
   * Access-Control-Allow-Origin. Status code: 200", which is a 200 nobody can read.
   */
  it('keeps the CORS headers a browser needs to read the stream at all', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cook',
      headers: { accept: 'text/event-stream', origin: ORIGIN },
      payload: { wants: 'pasta', pantry: 'tomatoes' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);

    // And the plain JSON path, which never lost them, still has them.
    const json = await app.inject({
      method: 'POST',
      url: '/v1/cook',
      headers: { origin: ORIGIN },
      payload: { wants: 'pasta', pantry: 'tomatoes' },
    });
    expect(json.headers['access-control-allow-origin']).toBe(ORIGIN);

    await app.close();
  });

  it('answers the preflight a streaming POST triggers', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/cook',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,accept',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    await app.close();
  });

  it('says what it heard before it goes looking', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cook',
      headers: { accept: 'text/event-stream' },
      payload: { wants: 'pasta', pantry: 'tomatoes' },
    });
    const heard = framesIn(res.body).find((f) => f.data['kind'] === 'heard');
    expect(heard?.data).toMatchObject({ cookCount: expect.any(Number), portionTarget: expect.any(Number) });
    await app.close();
  });

  it('refuses two empty answers rather than searching for nothing', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cook',
      payload: { wants: '   ', pantry: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
    await app.close();
  });
});

describe('POST /v1/voice/transcribe', () => {
  it('needs audio, and says so in a sentence', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/voice/transcribe',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/recording as audio/);
    await app.close();
  });

  it('reports an unconfigured provider as a dependency problem, not a bad request', async () => {
    const app = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/voice/transcribe',
      headers: { 'content-type': 'audio/webm' },
      payload: Buffer.from('not really audio, but bytes'),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('dependency_unavailable');
    await app.close();
  });
});
