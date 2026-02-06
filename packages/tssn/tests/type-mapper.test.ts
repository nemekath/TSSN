import { describe, it, expect } from "vitest";
import { mapType } from "../src/type-mapper.js";

describe("TypeMapper", () => {
  describe("SQL Server", () => {
    describe("numeric types", () => {
      it.each([
        ["TINYINT", "int"],
        ["SMALLINT", "int"],
        ["INT", "int"],
        ["BIGINT", "int"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });

      it.each([
        ["DECIMAL", "decimal"],
        ["NUMERIC", "decimal"],
        ["MONEY", "decimal"],
        ["SMALLMONEY", "decimal"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });

      it.each([
        ["FLOAT", "float"],
        ["REAL", "float"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });
    });

    describe("string types", () => {
      it("maps CHAR(n) with preserved length", () => {
        const result = mapType("sqlserver", "CHAR", 10);
        expect(result.base).toBe("char");
        expect(result.length).toBe(10);
      });

      it("maps NCHAR(n) with preserved length", () => {
        const result = mapType("sqlserver", "NCHAR", 50);
        expect(result.base).toBe("char");
        expect(result.length).toBe(50);
      });

      it("maps VARCHAR(n) with preserved length", () => {
        const result = mapType("sqlserver", "VARCHAR", 255);
        expect(result.base).toBe("string");
        expect(result.length).toBe(255);
      });

      it("maps NVARCHAR(n) with preserved length", () => {
        const result = mapType("sqlserver", "NVARCHAR", 100);
        expect(result.base).toBe("string");
        expect(result.length).toBe(100);
      });

      it("maps VARCHAR(MAX) → text", () => {
        const result = mapType("sqlserver", "VARCHAR", -1);
        expect(result.base).toBe("text");
        expect(result.length).toBeUndefined();
      });

      it("maps NVARCHAR(MAX) → text", () => {
        const result = mapType("sqlserver", "NVARCHAR", -1);
        expect(result.base).toBe("text");
        expect(result.length).toBeUndefined();
      });

      it.each([
        ["TEXT", "text"],
        ["NTEXT", "text"],
      ])("maps deprecated %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });
    });

    describe("temporal types", () => {
      it.each([
        ["DATE", "date"],
        ["TIME", "time"],
        ["DATETIME", "datetime"],
        ["DATETIME2", "datetime"],
        ["SMALLDATETIME", "datetime"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });

      it("maps DATETIMEOFFSET → datetime with @format: tz", () => {
        const result = mapType("sqlserver", "DATETIMEOFFSET");
        expect(result.base).toBe("datetime");
        expect(result.format).toBe("tz");
      });
    });

    describe("other types", () => {
      it("maps BIT → boolean", () => {
        expect(mapType("sqlserver", "BIT").base).toBe("boolean");
      });

      it("maps UNIQUEIDENTIFIER → uuid", () => {
        expect(mapType("sqlserver", "UNIQUEIDENTIFIER").base).toBe("uuid");
      });

      it("maps JSON → json", () => {
        expect(mapType("sqlserver", "JSON").base).toBe("json");
      });

      it("maps XML → text with @format: xml", () => {
        const result = mapType("sqlserver", "XML");
        expect(result.base).toBe("text");
        expect(result.format).toBe("xml");
      });

      it.each([
        ["VARBINARY", "blob"],
        ["BINARY", "blob"],
        ["IMAGE", "blob"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });

      it("maps GEOGRAPHY → string with @format: wkt", () => {
        const result = mapType("sqlserver", "GEOGRAPHY");
        expect(result.base).toBe("string");
        expect(result.format).toBe("wkt");
      });

      it("maps GEOMETRY → string with @format: wkt", () => {
        const result = mapType("sqlserver", "GEOMETRY");
        expect(result.base).toBe("string");
        expect(result.format).toBe("wkt");
      });

      it("maps HIERARCHYID → string with @format: hierarchyid", () => {
        const result = mapType("sqlserver", "HIERARCHYID");
        expect(result.base).toBe("string");
        expect(result.format).toBe("hierarchyid");
      });

      it.each([
        ["ROWVERSION", "blob"],
        ["TIMESTAMP", "blob"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlserver", sql).base).toBe(expected);
      });

      it("maps SQL_VARIANT → string", () => {
        expect(mapType("sqlserver", "SQL_VARIANT").base).toBe("string");
      });
    });

    it("defaults unknown types to string", () => {
      expect(mapType("sqlserver", "SOME_CUSTOM_TYPE").base).toBe("string");
    });
  });

  describe("PostgreSQL", () => {
    describe("numeric types", () => {
      it.each([
        ["smallint", "int"],
        ["int2", "int"],
        ["integer", "int"],
        ["int4", "int"],
        ["bigint", "int"],
        ["int8", "int"],
        ["serial", "int"],
        ["smallserial", "int"],
        ["bigserial", "int"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("postgresql", sql).base).toBe(expected);
      });

      it.each([
        ["numeric", "decimal"],
        ["decimal", "decimal"],
        ["money", "decimal"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("postgresql", sql).base).toBe(expected);
      });

      it.each([
        ["real", "float"],
        ["float4", "float"],
        ["double precision", "float"],
        ["float8", "float"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("postgresql", sql).base).toBe(expected);
      });
    });

    describe("temporal types with timezone", () => {
      it("maps TIMESTAMPTZ → datetime with @format: tz", () => {
        const result = mapType("postgresql", "timestamptz");
        expect(result.base).toBe("datetime");
        expect(result.format).toBe("tz");
      });

      it("maps TIMESTAMP WITH TIME ZONE → datetime with @format: tz", () => {
        const result = mapType("postgresql", "timestamp with time zone");
        expect(result.base).toBe("datetime");
        expect(result.format).toBe("tz");
      });

      it("maps plain TIMESTAMP → datetime without format", () => {
        const result = mapType("postgresql", "timestamp");
        expect(result.base).toBe("datetime");
        expect(result.format).toBeUndefined();
      });
    });

    describe("array types", () => {
      it("maps TEXT[] → string array", () => {
        const result = mapType("postgresql", "text[]");
        expect(result.base).toBe("text");
        expect(result.isArray).toBe(true);
      });

      it("maps INTEGER[] → int array", () => {
        const result = mapType("postgresql", "integer[]");
        expect(result.base).toBe("int");
        expect(result.isArray).toBe(true);
      });

      it("maps _text (internal notation) → string array", () => {
        const result = mapType("postgresql", "_text");
        expect(result.base).toBe("text");
        expect(result.isArray).toBe(true);
      });
    });

    describe("key-value types", () => {
      it("maps HSTORE → json", () => {
        expect(mapType("postgresql", "hstore").base).toBe("json");
      });
    });

    describe("full-text search types", () => {
      it("maps TSVECTOR → string with @format: tsvector", () => {
        const result = mapType("postgresql", "tsvector");
        expect(result.base).toBe("string");
        expect(result.format).toBe("tsvector");
      });

      it("maps TSQUERY → string with @format: tsquery", () => {
        const result = mapType("postgresql", "tsquery");
        expect(result.base).toBe("string");
        expect(result.format).toBe("tsquery");
      });
    });

    describe("network types", () => {
      it.each([
        ["cidr", "cidr"],
        ["inet", "cidr"],
        ["macaddr", "mac"],
        ["macaddr8", "mac"],
      ])("maps %s → string with @format: %s", (sql, expectedFormat) => {
        const result = mapType("postgresql", sql);
        expect(result.base).toBe("string");
        expect(result.format).toBe(expectedFormat);
      });
    });

    describe("bit string types", () => {
      it.each(["bit", "bit varying", "varbit"])(
        "maps %s → string with @format: bits",
        (sql) => {
          const result = mapType("postgresql", sql);
          expect(result.base).toBe("string");
          expect(result.format).toBe("bits");
        },
      );
    });
  });

  describe("MySQL", () => {
    describe("numeric types", () => {
      it.each([
        ["TINYINT", "int"],
        ["SMALLINT", "int"],
        ["MEDIUMINT", "int"],
        ["INT", "int"],
        ["BIGINT", "int"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("mysql", sql).base).toBe(expected);
      });

      it("maps TINYINT(1) → boolean", () => {
        const result = mapType("mysql", "TINYINT", 1);
        expect(result.base).toBe("boolean");
      });

      it("maps TINYINT without (1) → int", () => {
        const result = mapType("mysql", "TINYINT");
        expect(result.base).toBe("int");
      });
    });

    describe("string types", () => {
      it("maps CHAR(n) with preserved length", () => {
        const result = mapType("mysql", "CHAR", 36);
        expect(result.base).toBe("char");
        expect(result.length).toBe(36);
      });

      it("maps VARCHAR(n) with preserved length", () => {
        const result = mapType("mysql", "VARCHAR", 255);
        expect(result.base).toBe("string");
        expect(result.length).toBe(255);
      });

      it.each([
        ["TINYTEXT", "text"],
        ["TEXT", "text"],
        ["MEDIUMTEXT", "text"],
        ["LONGTEXT", "text"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("mysql", sql).base).toBe(expected);
      });
    });

    describe("binary types", () => {
      it.each([
        ["BINARY", "blob"],
        ["VARBINARY", "blob"],
        ["TINYBLOB", "blob"],
        ["BLOB", "blob"],
        ["MEDIUMBLOB", "blob"],
        ["LONGBLOB", "blob"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("mysql", sql).base).toBe(expected);
      });
    });

    describe("temporal types", () => {
      it.each([
        ["DATE", "date"],
        ["TIME", "time"],
        ["DATETIME", "datetime"],
        ["TIMESTAMP", "datetime"],
        ["YEAR", "int"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("mysql", sql).base).toBe(expected);
      });
    });

    describe("other types", () => {
      it("maps BOOLEAN → boolean", () => {
        expect(mapType("mysql", "BOOLEAN").base).toBe("boolean");
      });

      it("maps BOOL → boolean", () => {
        expect(mapType("mysql", "BOOL").base).toBe("boolean");
      });

      it("maps JSON → json", () => {
        expect(mapType("mysql", "JSON").base).toBe("json");
      });

      it("maps BIT → string with @format: bits", () => {
        const result = mapType("mysql", "BIT");
        expect(result.base).toBe("string");
        expect(result.format).toBe("bits");
      });
    });

    describe("spatial types", () => {
      it.each([
        "GEOMETRY",
        "POINT",
        "LINESTRING",
        "POLYGON",
        "MULTIPOINT",
        "MULTILINESTRING",
        "MULTIPOLYGON",
        "GEOMETRYCOLLECTION",
      ])("maps %s → string with @format: wkt", (sql) => {
        const result = mapType("mysql", sql);
        expect(result.base).toBe("string");
        expect(result.format).toBe("wkt");
      });
    });
  });

  describe("Oracle", () => {
    describe("numeric types", () => {
      it("maps NUMBER (no precision) → number", () => {
        expect(mapType("oracle", "NUMBER").base).toBe("number");
      });

      it("maps NUMBER(10) (no scale) → int", () => {
        const result = mapType("oracle", "NUMBER", 10);
        expect(result.base).toBe("int");
      });

      it("maps NUMBER(10,0) (explicit scale=0) → int", () => {
        const result = mapType("oracle", "NUMBER", 10, 0);
        expect(result.base).toBe("int");
      });

      it("maps NUMBER(10,2) (scale>0) → decimal", () => {
        const result = mapType("oracle", "NUMBER", 10, 2);
        expect(result.base).toBe("decimal");
      });

      it.each([
        ["BINARY_FLOAT", "float"],
        ["BINARY_DOUBLE", "float"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("oracle", sql).base).toBe(expected);
      });
    });

    describe("string types", () => {
      it("maps VARCHAR2(n) with preserved length", () => {
        const result = mapType("oracle", "VARCHAR2", 255);
        expect(result.base).toBe("string");
        expect(result.length).toBe(255);
      });

      it("maps NVARCHAR2(n) with preserved length", () => {
        const result = mapType("oracle", "NVARCHAR2", 100);
        expect(result.base).toBe("string");
        expect(result.length).toBe(100);
      });

      it("maps CHAR(n) with preserved length", () => {
        const result = mapType("oracle", "CHAR", 10);
        expect(result.base).toBe("char");
        expect(result.length).toBe(10);
      });

      it.each([
        ["CLOB", "text"],
        ["NCLOB", "text"],
        ["LONG", "text"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("oracle", sql).base).toBe(expected);
      });
    });

    describe("temporal types", () => {
      it("maps Oracle DATE → datetime (includes time!)", () => {
        expect(mapType("oracle", "DATE").base).toBe("datetime");
      });

      it("maps TIMESTAMP → datetime", () => {
        expect(mapType("oracle", "TIMESTAMP").base).toBe("datetime");
      });

      it("maps TIMESTAMP WITH TIME ZONE → datetime with @format: tz", () => {
        const result = mapType("oracle", "timestamp with time zone");
        expect(result.base).toBe("datetime");
        expect(result.format).toBe("tz");
      });

      it("maps TIMESTAMP WITH LOCAL TIME ZONE → datetime with @format: tz", () => {
        const result = mapType("oracle", "timestamp with local time zone");
        expect(result.base).toBe("datetime");
        expect(result.format).toBe("tz");
      });

      it.each([
        ["interval year to month", "interval"],
        ["interval day to second", "interval"],
      ])("maps %s → string with @format: %s", (sql, expectedFormat) => {
        const result = mapType("oracle", sql);
        expect(result.base).toBe("string");
        expect(result.format).toBe(expectedFormat);
      });
    });

    describe("other types", () => {
      it("maps BOOLEAN → boolean", () => {
        expect(mapType("oracle", "BOOLEAN").base).toBe("boolean");
      });

      it.each([
        ["RAW", "blob"],
        ["LONG RAW", "blob"],
        ["BLOB", "blob"],
        ["BFILE", "blob"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("oracle", sql).base).toBe(expected);
      });

      it("maps JSON → json", () => {
        expect(mapType("oracle", "JSON").base).toBe("json");
      });

      it("maps XMLTYPE → text with @format: xml", () => {
        const result = mapType("oracle", "XMLTYPE");
        expect(result.base).toBe("text");
        expect(result.format).toBe("xml");
      });

      it.each([
        ["ROWID", "string"],
        ["UROWID", "string"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("oracle", sql).base).toBe(expected);
      });

      it("maps SDO_GEOMETRY → string with @format: wkt", () => {
        const result = mapType("oracle", "SDO_GEOMETRY");
        expect(result.base).toBe("string");
        expect(result.format).toBe("wkt");
      });
    });
  });

  describe("SQLite", () => {
    describe("integer affinity types", () => {
      it.each([
        ["INT", "int"],
        ["INTEGER", "int"],
        ["TINYINT", "int"],
        ["SMALLINT", "int"],
        ["MEDIUMINT", "int"],
        ["BIGINT", "int"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlite", sql).base).toBe(expected);
      });
    });

    describe("real affinity types", () => {
      it.each([
        ["REAL", "float"],
        ["DOUBLE", "float"],
        ["FLOAT", "float"],
        ["DOUBLE PRECISION", "float"],
      ])("maps %s → %s", (sql, expected) => {
        expect(mapType("sqlite", sql).base).toBe(expected);
      });
    });

    describe("text affinity types", () => {
      it("maps TEXT → text", () => {
        expect(mapType("sqlite", "TEXT").base).toBe("text");
      });

      it("maps VARCHAR(n) with preserved length", () => {
        const result = mapType("sqlite", "VARCHAR", 255);
        expect(result.base).toBe("string");
        expect(result.length).toBe(255);
      });

      it("maps CHAR(n) with preserved length", () => {
        const result = mapType("sqlite", "CHAR", 36);
        expect(result.base).toBe("char");
        expect(result.length).toBe(36);
      });
    });

    describe("blob affinity", () => {
      it("maps BLOB → blob", () => {
        expect(mapType("sqlite", "BLOB").base).toBe("blob");
      });
    });

    describe("common declared types", () => {
      it("maps BOOLEAN → boolean", () => {
        expect(mapType("sqlite", "BOOLEAN").base).toBe("boolean");
      });

      it("maps DATE → date", () => {
        expect(mapType("sqlite", "DATE").base).toBe("date");
      });

      it("maps DATETIME → datetime", () => {
        expect(mapType("sqlite", "DATETIME").base).toBe("datetime");
      });

      it("maps DECIMAL → decimal", () => {
        expect(mapType("sqlite", "DECIMAL").base).toBe("decimal");
      });

      it("maps JSON → json", () => {
        expect(mapType("sqlite", "JSON").base).toBe("json");
      });
    });

    it("defaults unknown types to string", () => {
      expect(mapType("sqlite", "WHATEVER").base).toBe("string");
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase SQL types", () => {
      expect(mapType("sqlserver", "BIGINT").base).toBe("int");
    });

    it("handles mixed case SQL types", () => {
      expect(mapType("sqlserver", "DateTime2").base).toBe("datetime");
    });

    it("handles lowercase SQL types", () => {
      expect(mapType("sqlserver", "varchar", 100).base).toBe("string");
    });
  });
});
