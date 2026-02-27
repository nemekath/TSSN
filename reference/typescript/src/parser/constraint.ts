import type { Constraint } from '../types.js';
import { PATTERNS } from '../constants.js';

/**
 * Extract structured constraints from a comment string.
 *
 * Recognises: PRIMARY KEY / PK, UNIQUE, FK -> Table(col),
 * FOREIGN KEY -> schema.Table(col), INDEX, AUTO_INCREMENT / IDENTITY,
 * DEFAULT value.
 */
export function parseConstraints(comment: string): Constraint[] {
  const constraints: Constraint[] = [];

  if (PATTERNS.primaryKey.test(comment)) {
    constraints.push({ type: 'PRIMARY_KEY' });
  }

  if (PATTERNS.unique.test(comment)) {
    constraints.push({ type: 'UNIQUE' });
  }

  const fkMatch = PATTERNS.foreignKey.exec(comment);
  if (fkMatch) {
    // Groups: 1=quoted schema, 2=simple schema, 3=quoted table, 4=simple table, 5=quoted col, 6=simple col
    const refSchema = fkMatch[1]?.replace(/``/g, '`') ?? fkMatch[2];
    const refTable = fkMatch[3]?.replace(/``/g, '`') ?? fkMatch[4]!;
    const refColumn = fkMatch[5]?.replace(/``/g, '`') ?? fkMatch[6]!;

    if (refSchema) {
      constraints.push({
        type: 'FOREIGN_KEY',
        referenceTable: refTable,
        referenceColumn: refColumn,
        referenceSchema: refSchema,
      });
    } else {
      constraints.push({
        type: 'FOREIGN_KEY',
        referenceTable: refTable,
        referenceColumn: refColumn,
      });
    }
  }

  if (PATTERNS.index.test(comment)) {
    constraints.push({ type: 'INDEX' });
  }

  if (PATTERNS.autoIncrement.test(comment)) {
    constraints.push({ type: 'AUTO_INCREMENT' });
  }

  const defaultMatch = PATTERNS.defaultValue.exec(comment);
  if (defaultMatch) {
    constraints.push({ type: 'DEFAULT', value: defaultMatch[1]!.trim() });
  }

  return constraints;
}
