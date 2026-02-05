/**
 * TSSN Type Mapper — Maps database-specific SQL types to TSSN semantic types.
 * Implements TSSN Specification v0.7.0, Appendix B + Section 2.6.
 */

export type DatabaseType = "sqlserver" | "postgresql" | "mysql" | "oracle" | "sqlite";

export interface MappedType {
  /** TSSN base type */
  base: string;
  /** Preserved length (for string/char types) */
  length?: number;
  /** Whether this is an array type */
  isArray: boolean;
  /** Optional @format annotation */
  format?: string;
}

/** Types where the length parameter should be preserved */
const PRESERVE_LENGTH = new Set([
  "varchar",
  "nvarchar",
  "char",
  "nchar",
]);

/**
 * SQL Server → TSSN type mapping table.
 * Based on TSSN-SPEC.md Appendix B.
 */
const SQLSERVER_TYPES: Record<string, string> = {
  // Numeric
  tinyint: "int",
  smallint: "int",
  int: "int",
  bigint: "int",
  decimal: "decimal",
  numeric: "decimal",
  money: "decimal",
  smallmoney: "decimal",
  float: "float",
  real: "float",
  // String
  char: "char",
  nchar: "char",
  varchar: "string",
  nvarchar: "string",
  text: "text",
  ntext: "text",
  // Temporal
  date: "date",
  time: "time",
  datetime: "datetime",
  datetime2: "datetime",
  smalldatetime: "datetime",
  datetimeoffset: "datetime",
  // Other
  bit: "boolean",
  uniqueidentifier: "uuid",
  json: "json",
  xml: "text",
  varbinary: "blob",
  binary: "blob",
  image: "blob",
  geography: "string",
  geometry: "string",
  hierarchyid: "string",
  rowversion: "blob",
  timestamp: "blob",
  sql_variant: "string",
};

/** Types that receive a @format annotation when mapped */
const SQLSERVER_FORMATS: Record<string, string> = {
  datetimeoffset: "tz",
  xml: "xml",
  geography: "wkt",
  geometry: "wkt",
  hierarchyid: "hierarchyid",
};

/**
 * PostgreSQL → TSSN type mapping table.
 */
const POSTGRESQL_TYPES: Record<string, string> = {
  // Numeric
  smallint: "int",
  int2: "int",
  integer: "int",
  int4: "int",
  bigint: "int",
  int8: "int",
  serial: "int",
  smallserial: "int",
  bigserial: "int",
  numeric: "decimal",
  decimal: "decimal",
  real: "float",
  float4: "float",
  "double precision": "float",
  float8: "float",
  money: "decimal",
  // String
  "character varying": "string",
  varchar: "string",
  character: "char",
  char: "char",
  text: "text",
  // Temporal
  timestamp: "datetime",
  "timestamp without time zone": "datetime",
  "timestamp with time zone": "datetime",
  timestamptz: "datetime",
  date: "date",
  "time without time zone": "time",
  time: "time",
  "time with time zone": "time",
  timetz: "time",
  interval: "string",
  // Other
  boolean: "boolean",
  bool: "boolean",
  bytea: "blob",
  uuid: "uuid",
  json: "json",
  jsonb: "json",
  xml: "text",
  // Full-text search
  tsvector: "string",
  tsquery: "string",
  // Network
  cidr: "string",
  inet: "string",
  macaddr: "string",
  macaddr8: "string",
  // Bit strings
  bit: "string",
  "bit varying": "string",
  varbit: "string",
  // Key-value
  hstore: "json",
  // Geometric (native)
  point: "string",
  line: "string",
  lseg: "string",
  box: "string",
  path: "string",
  polygon: "string",
  circle: "string",
  // PostGIS
  geography: "string",
  geometry: "string",
};

const POSTGRESQL_FORMATS: Record<string, string> = {
  "timestamp with time zone": "tz",
  timestamptz: "tz",
  "time with time zone": "tz",
  timetz: "tz",
  interval: "interval",
  xml: "xml",
  tsvector: "tsvector",
  tsquery: "tsquery",
  cidr: "cidr",
  inet: "cidr",
  macaddr: "mac",
  macaddr8: "mac",
  bit: "bits",
  "bit varying": "bits",
  varbit: "bits",
  point: "wkt",
  line: "wkt",
  lseg: "wkt",
  box: "wkt",
  path: "wkt",
  polygon: "wkt",
  circle: "wkt",
  geography: "wkt",
  geometry: "wkt",
};

const POSTGRESQL_PRESERVE_LENGTH = new Set([
  "character varying",
  "varchar",
  "character",
  "char",
]);

/**
 * MySQL → TSSN type mapping table.
 */
const MYSQL_TYPES: Record<string, string> = {
  // Numeric
  tinyint: "int",
  smallint: "int",
  mediumint: "int",
  int: "int",
  integer: "int",
  bigint: "int",
  decimal: "decimal",
  numeric: "decimal",
  float: "float",
  double: "float",
  "double precision": "float",
  real: "float",
  // String
  char: "char",
  varchar: "string",
  tinytext: "text",
  text: "text",
  mediumtext: "text",
  longtext: "text",
  // Binary
  binary: "blob",
  varbinary: "blob",
  tinyblob: "blob",
  blob: "blob",
  mediumblob: "blob",
  longblob: "blob",
  // Temporal
  date: "date",
  time: "time",
  datetime: "datetime",
  timestamp: "datetime",
  year: "int",
  // Other
  json: "json",
  bit: "string",
  // Spatial
  geometry: "string",
  point: "string",
  linestring: "string",
  polygon: "string",
  multipoint: "string",
  multilinestring: "string",
  multipolygon: "string",
  geometrycollection: "string",
};

const MYSQL_FORMATS: Record<string, string> = {
  bit: "bits",
  geometry: "wkt",
  point: "wkt",
  linestring: "wkt",
  polygon: "wkt",
  multipoint: "wkt",
  multilinestring: "wkt",
  multipolygon: "wkt",
  geometrycollection: "wkt",
};

const MYSQL_PRESERVE_LENGTH = new Set(["char", "varchar"]);

/**
 * Oracle → TSSN type mapping table.
 * Note: Oracle DATE includes time — maps to datetime, NOT date.
 */
const ORACLE_TYPES: Record<string, string> = {
  // Numeric — NUMBER mapping depends on precision/scale (handled in mapType)
  number: "number",
  binary_float: "float",
  binary_double: "float",
  // String
  varchar2: "string",
  nvarchar2: "string",
  char: "char",
  nchar: "char",
  clob: "text",
  nclob: "text",
  long: "text",
  // Temporal — DATE includes time in Oracle!
  date: "datetime",
  timestamp: "datetime",
  "timestamp with time zone": "datetime",
  "timestamp with local time zone": "datetime",
  "interval year to month": "string",
  "interval day to second": "string",
  // Other
  boolean: "boolean",
  raw: "blob",
  "long raw": "blob",
  blob: "blob",
  bfile: "blob",
  json: "json",
  xmltype: "text",
  rowid: "string",
  urowid: "string",
  sdo_geometry: "string",
};

const ORACLE_FORMATS: Record<string, string> = {
  "timestamp with time zone": "tz",
  "timestamp with local time zone": "tz",
  "interval year to month": "interval",
  "interval day to second": "interval",
  xmltype: "xml",
  sdo_geometry: "wkt",
};

const ORACLE_PRESERVE_LENGTH = new Set([
  "varchar2",
  "nvarchar2",
  "char",
  "nchar",
]);

/**
 * SQLite → TSSN type mapping table.
 * SQLite uses type affinity; these are the commonly declared types.
 */
const SQLITE_TYPES: Record<string, string> = {
  // INTEGER affinity
  int: "int",
  integer: "int",
  tinyint: "int",
  smallint: "int",
  mediumint: "int",
  bigint: "int",
  int2: "int",
  int8: "int",
  // REAL affinity
  real: "float",
  double: "float",
  "double precision": "float",
  float: "float",
  // TEXT affinity
  text: "text",
  clob: "text",
  // BLOB affinity
  blob: "blob",
  // Common declared types mapped via affinity
  varchar: "string",
  "character varying": "string",
  char: "char",
  character: "char",
  nchar: "char",
  nvarchar: "string",
  boolean: "boolean",
  date: "date",
  datetime: "datetime",
  timestamp: "datetime",
  decimal: "decimal",
  numeric: "decimal",
  json: "json",
};

const SQLITE_FORMATS: Record<string, string> = {};

const SQLITE_PRESERVE_LENGTH = new Set([
  "varchar",
  "character varying",
  "char",
  "character",
  "nchar",
  "nvarchar",
]);

const TYPE_MAPS: Record<
  DatabaseType,
  {
    types: Record<string, string>;
    formats: Record<string, string>;
    preserveLength: Set<string>;
  }
> = {
  sqlserver: {
    types: SQLSERVER_TYPES,
    formats: SQLSERVER_FORMATS,
    preserveLength: PRESERVE_LENGTH,
  },
  postgresql: {
    types: POSTGRESQL_TYPES,
    formats: POSTGRESQL_FORMATS,
    preserveLength: POSTGRESQL_PRESERVE_LENGTH,
  },
  mysql: {
    types: MYSQL_TYPES,
    formats: MYSQL_FORMATS,
    preserveLength: MYSQL_PRESERVE_LENGTH,
  },
  oracle: {
    types: ORACLE_TYPES,
    formats: ORACLE_FORMATS,
    preserveLength: ORACLE_PRESERVE_LENGTH,
  },
  sqlite: {
    types: SQLITE_TYPES,
    formats: SQLITE_FORMATS,
    preserveLength: SQLITE_PRESERVE_LENGTH,
  },
};

/**
 * Map a database-specific SQL type to a TSSN semantic type.
 *
 * @param database - Target database system
 * @param sqlType - The SQL type name (e.g. "NVARCHAR", "DATETIME2", "TEXT[]")
 * @param length - Optional length/precision parameter
 * @returns The mapped TSSN type information
 *
 * @example
 * ```ts
 * mapType("sqlserver", "NVARCHAR", 255);
 * // { base: "string", length: 255, isArray: false }
 *
 * mapType("sqlserver", "DATETIMEOFFSET");
 * // { base: "datetime", isArray: false, format: "tz" }
 *
 * mapType("postgresql", "TEXT[]");
 * // { base: "string", isArray: true }
 *
 * mapType("oracle", "NUMBER", 10, 2);
 * // { base: "decimal", isArray: false }
 * ```
 */
export function mapType(
  database: DatabaseType,
  sqlType: string,
  length?: number,
  scale?: number,
): MappedType {
  const config = TYPE_MAPS[database];
  let normalized = sqlType.toLowerCase().trim();
  let isArray = false;

  // Detect PostgreSQL array notation: text[] or _text
  if (normalized.endsWith("[]")) {
    isArray = true;
    normalized = normalized.slice(0, -2);
  } else if (database === "postgresql" && normalized.startsWith("_")) {
    isArray = true;
    normalized = normalized.slice(1);
  }

  // Special case: MySQL TINYINT(1) is boolean
  if (database === "mysql" && normalized === "tinyint" && length === 1) {
    return { base: "boolean", isArray, length: undefined };
  }

  // Special case: SQL Server VARCHAR(MAX) / NVARCHAR(MAX) → text
  if (
    database === "sqlserver" &&
    (normalized === "varchar" || normalized === "nvarchar") &&
    length === -1 // -1 is the conventional representation of MAX
  ) {
    return { base: "text", isArray, length: undefined };
  }

  // Special case: Oracle NUMBER(p,s) — mapping depends on scale
  // NUMBER without precision → number (generic)
  // NUMBER(n) with scale=0 → int
  // NUMBER(p,s) with scale>0 → decimal
  if (database === "oracle" && normalized === "number" && length !== undefined) {
    if (scale !== undefined && scale > 0) {
      return { base: "decimal", isArray, length: undefined };
    }
    return { base: "int", isArray, length: undefined };
  }

  const base = config.types[normalized] ?? "string";
  const format = config.formats[normalized];
  const preserveLength =
    config.preserveLength.has(normalized) && length !== undefined;

  return {
    base,
    length: preserveLength ? length : undefined,
    isArray,
    format,
  };
}
