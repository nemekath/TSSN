import { describe, it, expect } from 'vitest';
import { parseAnnotations } from '../../src/parser/annotation.js';

describe('parseAnnotations', () => {
  it('extracts a single annotation', () => {
    expect(parseAnnotations('@schema: public')).toEqual([
      { name: 'schema', value: 'public' },
    ]);
  });

  it('extracts @format annotation', () => {
    expect(parseAnnotations('@format: wkt')).toEqual([
      { name: 'format', value: 'wkt' },
    ]);
  });

  it('extracts @enum annotation', () => {
    expect(parseAnnotations('@enum: [admin, user, guest]')).toEqual([
      { name: 'enum', value: '[admin, user, guest]' },
    ]);
  });

  it('extracts @deprecated annotation', () => {
    expect(parseAnnotations('@deprecated: use customer_id')).toEqual([
      { name: 'deprecated', value: 'use customer_id' },
    ]);
  });

  it('extracts @since annotation', () => {
    expect(parseAnnotations('@since: v2.0')).toEqual([
      { name: 'since', value: 'v2.0' },
    ]);
  });

  it('extracts annotation after constraint text', () => {
    const result = parseAnnotations('FK -> Users(id), @since: v2.0');
    expect(result).toEqual([
      { name: 'since', value: 'v2.0' },
    ]);
  });

  it('extracts multiple annotations on one line', () => {
    const result = parseAnnotations('@generated: auto, @since: v2.0');
    expect(result).toEqual([
      { name: 'generated', value: 'auto' },
      { name: 'since', value: 'v2.0' },
    ]);
  });

  it('extracts three annotations on one line', () => {
    const result = parseAnnotations('@format: wkt, @deprecated: use geojson, @since: v3.0');
    expect(result).toEqual([
      { name: 'format', value: 'wkt' },
      { name: 'deprecated', value: 'use geojson' },
      { name: 'since', value: 'v3.0' },
    ]);
  });

  it('handles annotation value without trailing comma', () => {
    const result = parseAnnotations('@format: wkt');
    expect(result).toEqual([
      { name: 'format', value: 'wkt' },
    ]);
  });

  it('returns empty array when no annotations', () => {
    expect(parseAnnotations('PRIMARY KEY, AUTO_INCREMENT')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseAnnotations('')).toEqual([]);
  });
});
