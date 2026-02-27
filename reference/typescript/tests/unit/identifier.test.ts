import { describe, it, expect } from 'vitest';
import { parseIdentifier } from '../../src/parser/identifier.js';

describe('parseIdentifier', () => {
  describe('simple identifiers', () => {
    it('parses a lowercase name', () => {
      expect(parseIdentifier('users')).toEqual(['users', '']);
    });

    it('parses a PascalCase name', () => {
      expect(parseIdentifier('Users')).toEqual(['Users', '']);
    });

    it('parses snake_case with trailing content', () => {
      expect(parseIdentifier('user_id: int')).toEqual(['user_id', ': int']);
    });

    it('parses name starting with underscore', () => {
      expect(parseIdentifier('_private')).toEqual(['_private', '']);
    });

    it('parses name with digits', () => {
      expect(parseIdentifier('col2?: string')).toEqual(['col2', '?: string']);
    });

    it('returns null for digit-leading input', () => {
      expect(parseIdentifier('123abc')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseIdentifier('')).toBeNull();
    });
  });

  describe('quoted identifiers', () => {
    it('parses a quoted name with spaces', () => {
      expect(parseIdentifier('`Order Details`')).toEqual(['Order Details', '']);
    });

    it('parses a quoted name with trailing content', () => {
      expect(parseIdentifier('`Order ID`: int')).toEqual(['Order ID', ': int']);
    });

    it('unescapes doubled backticks', () => {
      expect(parseIdentifier('`col``name`')).toEqual(['col`name', '']);
    });

    it('handles quoted name with hyphen', () => {
      expect(parseIdentifier('`my-table`')).toEqual(['my-table', '']);
    });

    it('handles quoted name starting with digit', () => {
      expect(parseIdentifier('`123col`')).toEqual(['123col', '']);
    });

    it('returns null for unclosed backtick', () => {
      expect(parseIdentifier('`unclosed')).toBeNull();
    });
  });
});
