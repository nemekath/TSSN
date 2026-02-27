import { describe, it, expect } from 'vitest';
import { parseConstraints } from '../../src/parser/constraint.js';

describe('parseConstraints', () => {
  describe('PRIMARY KEY', () => {
    it('recognises PRIMARY KEY', () => {
      expect(parseConstraints('PRIMARY KEY')).toEqual([
        { type: 'PRIMARY_KEY' },
      ]);
    });

    it('recognises PK shorthand', () => {
      expect(parseConstraints('PK')).toEqual([
        { type: 'PRIMARY_KEY' },
      ]);
    });

    it('is case-insensitive', () => {
      expect(parseConstraints('primary key')).toEqual([
        { type: 'PRIMARY_KEY' },
      ]);
    });
  });

  describe('UNIQUE', () => {
    it('recognises UNIQUE', () => {
      expect(parseConstraints('UNIQUE')).toEqual([
        { type: 'UNIQUE' },
      ]);
    });
  });

  describe('FOREIGN KEY', () => {
    it('recognises FK -> Table(col)', () => {
      const result = parseConstraints('FK -> Users(id)');
      expect(result).toEqual([{
        type: 'FOREIGN_KEY',
        referenceTable: 'Users',
        referenceColumn: 'id',
      }]);
    });

    it('recognises FOREIGN KEY -> Table(col)', () => {
      const result = parseConstraints('FOREIGN KEY -> Organizations(id)');
      expect(result).toEqual([{
        type: 'FOREIGN_KEY',
        referenceTable: 'Organizations',
        referenceColumn: 'id',
      }]);
    });

    it('recognises cross-schema FK -> schema.Table(col)', () => {
      const result = parseConstraints('FK -> auth.Users(id)');
      expect(result).toEqual([{
        type: 'FOREIGN_KEY',
        referenceTable: 'Users',
        referenceColumn: 'id',
        referenceSchema: 'auth',
      }]);
    });
  });

  describe('INDEX', () => {
    it('recognises INDEX', () => {
      expect(parseConstraints('INDEX')).toEqual([
        { type: 'INDEX' },
      ]);
    });
  });

  describe('AUTO_INCREMENT', () => {
    it('recognises AUTO_INCREMENT', () => {
      expect(parseConstraints('AUTO_INCREMENT')).toEqual([
        { type: 'AUTO_INCREMENT' },
      ]);
    });

    it('recognises IDENTITY', () => {
      expect(parseConstraints('IDENTITY')).toEqual([
        { type: 'AUTO_INCREMENT' },
      ]);
    });
  });

  describe('DEFAULT', () => {
    it('recognises DEFAULT with value', () => {
      const result = parseConstraints('DEFAULT CURRENT_TIMESTAMP');
      expect(result).toEqual([{
        type: 'DEFAULT',
        value: 'CURRENT_TIMESTAMP',
      }]);
    });

    it('extracts DEFAULT before comma', () => {
      const result = parseConstraints('DEFAULT 0, some note');
      expect(result).toEqual([{
        type: 'DEFAULT',
        value: '0',
      }]);
    });
  });

  describe('multiple constraints', () => {
    it('extracts PK and AUTO_INCREMENT together', () => {
      const result = parseConstraints('PRIMARY KEY, AUTO_INCREMENT');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'PRIMARY_KEY' });
      expect(result[1]).toEqual({ type: 'AUTO_INCREMENT' });
    });

    it('extracts UNIQUE and INDEX together', () => {
      const result = parseConstraints('UNIQUE, INDEX');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'UNIQUE' });
      expect(result[1]).toEqual({ type: 'INDEX' });
    });

    it('extracts FK with additional notes', () => {
      const result = parseConstraints('FK -> Users(id), ON DELETE CASCADE');
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('FOREIGN_KEY');
      expect(result[0]!.referenceTable).toBe('Users');
    });
  });

  describe('quoted identifiers in FK', () => {
    it('handles quoted table and column in FK', () => {
      const result = parseConstraints('FK -> `Order Details`(`Order ID`)');
      expect(result).toEqual([{
        type: 'FOREIGN_KEY',
        referenceTable: 'Order Details',
        referenceColumn: 'Order ID',
      }]);
    });

    it('handles quoted schema in cross-schema FK', () => {
      const result = parseConstraints('FK -> `my schema`.`My Table`(`My Col`)');
      expect(result).toEqual([{
        type: 'FOREIGN_KEY',
        referenceTable: 'My Table',
        referenceColumn: 'My Col',
        referenceSchema: 'my schema',
      }]);
    });

    it('handles backtick-escaped names in FK', () => {
      const result = parseConstraints('FK -> `col``name`(`id`)');
      expect(result).toEqual([{
        type: 'FOREIGN_KEY',
        referenceTable: 'col`name',
        referenceColumn: 'id',
      }]);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for plain comment', () => {
      expect(parseConstraints('just a note')).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(parseConstraints('')).toEqual([]);
    });

    it('does not produce INDEX from AUTO_INCREMENT', () => {
      // AUTO_INCREMENT does not contain the substring INDEX,
      // so \bINDEX\b should never match
      const result = parseConstraints('AUTO_INCREMENT');
      expect(result).toEqual([{ type: 'AUTO_INCREMENT' }]);
      expect(result.find(c => c.type === 'INDEX')).toBeUndefined();
    });

    it('handles DEFAULT with quoted string value', () => {
      const result = parseConstraints("DEFAULT 'hello world'");
      expect(result).toEqual([{
        type: 'DEFAULT',
        value: "'hello world'",
      }]);
    });
  });
});
