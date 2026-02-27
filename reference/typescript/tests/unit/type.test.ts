import { describe, it, expect } from 'vitest';
import { parseTypeExpression } from '../../src/parser/type.js';

describe('parseTypeExpression', () => {
  describe('base types', () => {
    const baseTypes = [
      'int', 'string', 'decimal', 'float', 'number',
      'char', 'text', 'datetime', 'date', 'time',
      'boolean', 'blob', 'uuid', 'json',
    ];

    for (const t of baseTypes) {
      it(`parses ${t}`, () => {
        const result = parseTypeExpression(t);
        expect(result).toEqual({
          type: t,
          length: undefined,
          isArray: false,
          unionValues: [],
        });
      });
    }
  });

  describe('length parameters', () => {
    it('parses string(255)', () => {
      const result = parseTypeExpression('string(255)');
      expect(result).toEqual({
        type: 'string',
        length: 255,
        isArray: false,
        unionValues: [],
      });
    });

    it('parses char(3)', () => {
      const result = parseTypeExpression('char(3)');
      expect(result).toEqual({
        type: 'char',
        length: 3,
        isArray: false,
        unionValues: [],
      });
    });
  });

  describe('array types', () => {
    it('parses string[]', () => {
      const result = parseTypeExpression('string[]');
      expect(result).toEqual({
        type: 'string',
        length: undefined,
        isArray: true,
        unionValues: [],
      });
    });

    it('parses int[]', () => {
      const result = parseTypeExpression('int[]');
      expect(result).toEqual({
        type: 'int',
        length: undefined,
        isArray: true,
        unionValues: [],
      });
    });

    it('parses json[]', () => {
      const result = parseTypeExpression('json[]');
      expect(result).toEqual({
        type: 'json',
        length: undefined,
        isArray: true,
        unionValues: [],
      });
    });

    it('parses string(255)[] (length + array combined)', () => {
      const result = parseTypeExpression('string(255)[]');
      expect(result).toEqual({
        type: 'string',
        length: 255,
        isArray: true,
        unionValues: [],
      });
    });
  });

  describe('union types (string)', () => {
    it('parses string union', () => {
      const result = parseTypeExpression("'pending' | 'shipped' | 'delivered'");
      expect(result).toEqual({
        type: 'union',
        length: undefined,
        isArray: false,
        unionValues: ['pending', 'shipped', 'delivered'],
      });
    });

    it('parses two-value string union', () => {
      const result = parseTypeExpression("'yes' | 'no'");
      expect(result).toEqual({
        type: 'union',
        length: undefined,
        isArray: false,
        unionValues: ['yes', 'no'],
      });
    });
  });

  describe('union types (numeric)', () => {
    it('parses numeric union', () => {
      const result = parseTypeExpression('1 | 2 | 3');
      expect(result).toEqual({
        type: 'union',
        length: undefined,
        isArray: false,
        unionValues: [1, 2, 3],
      });
    });

    it('parses negative numeric union', () => {
      const result = parseTypeExpression('-1 | 0 | 1');
      expect(result).toEqual({
        type: 'union',
        length: undefined,
        isArray: false,
        unionValues: [-1, 0, 1],
      });
    });
  });

  describe('unknown types', () => {
    it('accepts unknown type names', () => {
      const result = parseTypeExpression('geography');
      expect(result).toEqual({
        type: 'geography',
        length: undefined,
        isArray: false,
        unionValues: [],
      });
    });
  });

  describe('invalid types', () => {
    it('returns null for empty string', () => {
      expect(parseTypeExpression('')).toBeNull();
    });

    it('returns null for just parentheses', () => {
      expect(parseTypeExpression('(255)')).toBeNull();
    });
  });
});
