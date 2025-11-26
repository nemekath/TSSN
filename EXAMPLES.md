# TSSN Examples

Focused examples for each specification feature. For the complete specification, see [TSSN-SPEC.md](TSSN-SPEC.md).

## Table of Contents

1. [Core Syntax](#1-core-syntax)
2. [Data Types](#2-data-types)
3. [Array Types](#3-array-types)
4. [Literal Union Types](#4-literal-union-types)
5. [Nullability](#5-nullability)
6. [Constraints](#6-constraints)
7. [Multi-Column Constraints](#7-multi-column-constraints)
8. [Vendor-Specific Types](#8-vendor-specific-types)
9. [Schema Namespaces](#9-schema-namespaces)
10. [Quoted Identifiers](#10-quoted-identifiers)
11. [Domain Annotations](#11-domain-annotations)
12. [Complete Example](#12-complete-example)

---

## 1. Core Syntax

Basic interface structure (Section 2.1):

```typescript
interface TableName {
  column_name: type;
  another_column: type;
}
```

---

## 2. Data Types

All supported type categories (Section 2.2):

```typescript
interface TypeShowcase {
  // Numeric types
  id: int;
  price: decimal;
  rating: float;
  quantity: number;        // Generic numeric

  // String types
  code: char(3);
  name: string(100);
  description: text;

  // Temporal types
  created_at: datetime;
  birth_date: date;
  start_time: time;

  // Other types
  is_active: boolean;
  data: json;
  file: blob;
  external_id: uuid;
}
```

---

## 3. Array Types

The `[]` suffix for array columns (Section 2.2.5):

```typescript
interface Articles {
  id: int;              // PRIMARY KEY
  title: string(200);
  tags: string[];       // PostgreSQL text[], use ANY() or @> operators
  scores: int[];        // PostgreSQL integer[]
  metadata?: json[];    // Optional array of JSON objects
}
```

This helps LLMs generate correct array operations:

```sql
-- Find articles with 'javascript' tag
WHERE 'javascript' = ANY(tags)

-- Find articles with multiple tags
WHERE tags @> ARRAY['javascript', 'typescript']
```

---

## 4. Literal Union Types

TypeScript-style unions for enum columns (Section 2.2.6):

```typescript
interface Orders {
  id: int;              // PRIMARY KEY
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  priority: 1 | 2 | 3;
  payment?: 'card' | 'bank' | 'crypto';  // Nullable union
}
```

This helps LLMs generate correct WHERE clauses without hallucinating invalid values:

```sql
-- LLM knows exact valid options
WHERE status = 'shipped'
WHERE status IN ('pending', 'shipped')
WHERE priority = 1
```

---

## 5. Nullability

The `?` suffix indicates nullable columns (Section 2.3):

```typescript
interface Users {
  id: int;              // NOT NULL (required)
  email: string(255);   // NOT NULL (required)
  phone?: string(20);   // NULL allowed (optional)
  bio?: text;           // NULL allowed (optional)
}
```

---

## 6. Constraints

Inline comment patterns for constraints (Section 2.4):

```typescript
interface Products {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  sku: string(50);      // UNIQUE
  name: string(200);    // INDEX
  category_id: int;     // FK -> Categories(id)
  status: string(20);   // CHECK IN ('active', 'draft', 'archived')
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}
```

Foreign key with referential actions:

```typescript
interface OrderItems {
  id: int;              // PRIMARY KEY
  order_id: int;        // FK -> Orders(id), ON DELETE CASCADE
  product_id: int;      // FK -> Products(id), ON DELETE SET NULL
}
```

---

## 7. Multi-Column Constraints

Interface-level comments for composite constraints (Section 2.5):

```typescript
// UNIQUE(user_id, organization_id)
// INDEX(created_at, status)
interface Memberships {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> Users(id)
  organization_id: int; // FK -> Organizations(id)
  status: string(20);
  created_at: datetime;
}
```

Junction table (many-to-many):

```typescript
// UNIQUE(post_id, tag_id)
interface PostTags {
  id: int;              // PRIMARY KEY
  post_id: int;         // FK -> Posts(id)
  tag_id: int;          // FK -> Tags(id)
}
```

---

## 8. Vendor-Specific Types

Using `@format` annotation for vendor types (Section 2.6):

```typescript
interface GeoData {
  id: int;              // PRIMARY KEY
  location: string;     // @format: wkt, GEOGRAPHY in SQL Server
  boundary: string;     // @format: wkt, GEOMETRY data
  config: text;         // @format: xml
  ip_range: string;     // @format: cidr
}
```

---

## 9. Schema Namespaces

Using `@schema` annotation for multi-schema databases (Section 2.7):

```typescript
// @schema: auth
interface Users {
  id: int;              // PRIMARY KEY
  email: string(255);   // UNIQUE
}

// @schema: billing
interface Invoices {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> auth.Users(id)
  amount: decimal;
}

// @schema: public
interface Orders {
  id: int;              // PRIMARY KEY
  user_id: int;         // FK -> auth.Users(id)
  invoice_id: int;      // FK -> billing.Invoices(id)
}
```

---

## 10. Quoted Identifiers

Backtick quoting for legacy identifiers with spaces or special characters (Section 2.8):

```typescript
interface `Order Details` {
  `Order ID`: int;            // PRIMARY KEY
  `Product Name`: string(100);
  `Unit Price`: decimal;
  `Qty Ordered`: int;
  `Ship Date`?: datetime;
}
```

This signals to LLMs that database-specific escaping is required:

```sql
-- SQL Server
SELECT [Order ID], [Product Name] FROM [Order Details]

-- MySQL
SELECT `Order ID`, `Product Name` FROM `Order Details`

-- PostgreSQL
SELECT "Order ID", "Product Name" FROM "Order Details"
```

---

## 11. Domain Annotations

Custom annotations for metadata (Section 3):

```typescript
// @description: User accounts with authentication data
interface Users {
  id: int;              // PRIMARY KEY, @generated: auto
  email: string(255);   // @validation: email
  role: string(20);     // @enum: [admin, user, guest]
  legacy_id?: int;      // @deprecated: use id instead
  api_version: int;     // @since: v2.0
}
```

---

## 12. Complete Example

A realistic schema combining all features:

```typescript
// @schema: app
// @description: Core application tables

interface Organizations {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(200);
  slug: string(200);    // UNIQUE, INDEX
  settings?: json;
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}

// UNIQUE(email)
// INDEX(organization_id, role)
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  email: string(255);   // UNIQUE
  name: string(100);
  role: string(20);     // CHECK IN ('admin', 'member', 'guest')
  last_login?: datetime;
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}

// UNIQUE(user_id, project_id)
interface ProjectMembers {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  project_id: int;      // FK -> Projects(id), ON DELETE CASCADE
  permission: string(20);
  joined_at: datetime;
}

interface Projects {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  name: string(200);
  description?: text;
  status: string(20);   // CHECK IN ('active', 'archived')
  created_by: int;      // FK -> Users(id)
  created_at: datetime;
  updated_at?: datetime;
}
```

This example demonstrates:
- Schema namespace (`@schema: app`)
- All constraint types (PK, FK, UNIQUE, INDEX, CHECK, DEFAULT)
- Nullable columns (`?` suffix)
- Referential actions (ON DELETE CASCADE)
- Multi-column constraints at interface level
- Common data types (int, string, datetime, json, text)

For array types and quoted identifiers, see sections 3 and 9 above.
