import { describe, expect, it } from 'vitest';
import { offsetFrom, resolveApiBase } from './api';

/**
 * Where the client sends its requests. The first shared session ever tried went to the
 * dev server instead of the API and got a bare 404, because nothing was configured and
 * "nothing" meant "this origin". These pin down what "nothing" means now.
 */
const laptop = { protocol: 'http:', hostname: 'localhost' };
const phone = { protocol: 'http:', hostname: '172.20.10.14' };

describe('where the API is', () => {
  it('assumes port 8080 on the page’s host in development when nothing is configured', () => {
    expect(resolveApiBase(undefined, laptop, true)).toBe('http://localhost:8080');
    expect(resolveApiBase('', phone, true)).toBe('http://172.20.10.14:8080');
  });

  it('is the page’s own origin in production when nothing is configured', () => {
    expect(resolveApiBase(undefined, { protocol: 'https:', hostname: 'hackaton-508407.web.app' }, false)).toBe('');
  });

  it('uses what is configured', () => {
    expect(resolveApiBase('https://api.example.com/', laptop, true)).toBe('https://api.example.com');
    expect(resolveApiBase('https://api.example.com', phone, false)).toBe('https://api.example.com');
  });

  it('points a phone on the wifi at the laptop rather than at its own localhost', () => {
    expect(resolveApiBase('http://localhost:8080', phone, true)).toBe('http://172.20.10.14:8080');
    expect(resolveApiBase('http://127.0.0.1:8080', phone, false)).toBe('http://172.20.10.14:8080');
    // On the laptop itself, localhost is right.
    expect(resolveApiBase('http://localhost:8080', laptop, true)).toBe('http://localhost:8080');
  });

  it('copes with no window at all', () => {
    expect(resolveApiBase('http://localhost:8080/', null, true)).toBe('http://localhost:8080');
    expect(resolveApiBase(undefined, null, true)).toBe('');
  });
});

describe('the clock offset', () => {
  it('credits half the round trip to the request', () => {
    // Sent at 1000, answered "1500" by the server, received at 1200: the server was read at
    // about 1100 on this clock, so it runs 400 ahead.
    expect(offsetFrom(1500, 1000, 1200)).toBe(400);
  });
});
