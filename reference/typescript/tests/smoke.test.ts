import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('smoke', () => {
  it('exports a version constant', () => {
    expect(VERSION).toBe('0.8.0');
  });
});
