/** The 14 standard LINDT base types (informational — unknown types are still valid). */
export const BASE_TYPES = new Set([
  'int', 'string', 'decimal', 'float', 'number',
  'char', 'text', 'datetime', 'date', 'time',
  'boolean', 'blob', 'uuid', 'json',
]);

/** Pre-compiled regex patterns used throughout the parser. */
export const PATTERNS = {
  /** Matches `interface Name {` or `interface \`Quoted Name\` {` */
  interfaceDecl: /^interface\s+(?:`((?:[^`]|``)*)`|([a-zA-Z_]\w*))\s*\{/,

  /** Matches a simple identifier: letter or underscore, then word chars. */
  simpleId: /^[a-zA-Z_]\w*/,

  /** Matches a quoted identifier: `` `...` `` (content may contain ``). */
  quotedId: /^`((?:[^`]|``)*)`/,

  /** Detects a literal union type expression (strings and/or numbers separated by |). */
  unionType: /^('[^']*'|-?\d+)(\s*\|\s*('[^']*'|-?\d+))+$/,

  /** Parses a simple type: base_type, optional (length), optional []. */
  simpleType: /^(\w+)(?:\((\d+)\))?(\[\])?$/,

  /** Matches PRIMARY KEY or PK. */
  primaryKey: /\bPRIMARY\s+KEY\b|\bPK\b/i,

  /** Matches UNIQUE. */
  unique: /\bUNIQUE\b/i,

  /** Matches FK -> [schema.]Table(col) or FOREIGN KEY -> [schema.]Table(col). */
  foreignKey: /(?:FK|FOREIGN\s+KEY)\s*->\s*(?:(?:`((?:[^`]|``)*)`|(\w+))\.)?(?:`((?:[^`]|``)*)`|(\w+))\((?:`((?:[^`]|``)*)`|(\w+))\)/i,

  /** Matches INDEX. */
  index: /\bINDEX\b/i,

  /** Matches AUTO_INCREMENT or IDENTITY. */
  autoIncrement: /\bAUTO_INCREMENT\b|\bIDENTITY\b/i,

  /** Matches DEFAULT value (captures until comma or end of string). */
  defaultValue: /\bDEFAULT\s+(.+?)(?:,|$)/i,

  /** Matches an annotation: @name: value (stops before next @annotation or end). */
  annotation: /@(\w+):\s*(.+?)(?=,\s*@|\s*$)/,
} as const;
