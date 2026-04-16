# TSSN Examples

Focused examples for each specification feature. For the complete specification, see [TSSN-SPEC.md](TSSN-SPEC.md).

## Table of Contents

1. [Core Syntax](#1-core-syntax)
2. [Data Types](#2-data-types)
3. [Array Types](#3-array-types)
4. [Literal Union Types](#4-literal-union-types)
5. [Type Aliases](#5-type-aliases)
6. [Nullability](#6-nullability)
7. [Constraints](#7-constraints)
8. [Multi-Column Constraints](#8-multi-column-constraints)
9. [Composite Primary Keys](#9-composite-primary-keys)
10. [Computed Columns](#10-computed-columns)
11. [Views](#11-views)
12. [Vendor-Specific Types](#12-vendor-specific-types)
13. [Schema Namespaces](#13-schema-namespaces)
14. [Quoted Identifiers](#14-quoted-identifiers)
15. [Domain Annotations](#15-domain-annotations)
16. [Complete Example](#16-complete-example)

---

## 1. Core Syntax

Basic interface structure (Section 2.1):

```typescript
interface TableName {
  column_name: int;
  another_column: string(255);
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

## 5. Type Aliases

Reusable type definitions for literal unions and sized types (Section 2.2.7):

```typescript
type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';
type Priority = 1 | 2 | 3;

interface Orders {
  id: int;              // PRIMARY KEY
  status: OrderStatus;
  priority: Priority;
}

interface Shipments {
  id: int;              // PRIMARY KEY
  order_id: int;        // FK -> Orders(id)
  status: OrderStatus;  // Same allowed values, no repetition
}
```

Without aliases, every table repeats the full union — with aliases, the
definition is paid for once in the token budget. This is the highest-leverage
compression feature for schemas with shared enums.

---

## 6. Nullability

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

## 7. Constraints

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

## 8. Multi-Column Constraints

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

Junction table with a surrogate primary key:

```typescript
// UNIQUE(post_id, tag_id)
interface PostTags {
  id: int;              // PRIMARY KEY
  post_id: int;         // FK -> Posts(id)
  tag_id: int;          // FK -> Tags(id)
}
```

---

## 9. Composite Primary Keys

Tables without a surrogate `id` column use an interface-level `PK(...)` comment
(Section 2.5.1). No column carries an inline `PRIMARY KEY` marker:

```typescript
// PK(post_id, tag_id)
interface PostTags {
  post_id: int;         // FK -> Posts(id)
  tag_id: int;          // FK -> Tags(id)
  tagged_at: datetime;  // DEFAULT CURRENT_TIMESTAMP
}
```

Composite key with three columns:

```typescript
// PK(organization_id, user_id, role)
interface Memberships {
  organization_id: int; // FK -> Organizations(id)
  user_id: int;         // FK -> Users(id)
  role: string(20);
  granted_at: datetime;
}
```

Column order in `PK(...)` reflects the intended index order — LLMs may use
this to prefer predicates on the leading columns.

---

## 10. Computed Columns

The `@computed` annotation marks derived columns (Section 3.3):

```typescript
interface Users {
  id: int;                      // PRIMARY KEY
  first_name: string(50);
  last_name: string(50);
  full_name: string(101);       // @computed: first_name || ' ' || last_name
  email: string(255);           // UNIQUE
  email_domain: string(255);    // @computed
}
```

LLMs should prefer stored columns in hot predicates:

```sql
-- Good: filter by stored, indexed column
SELECT * FROM users WHERE email LIKE '%@example.com';

-- Avoid: filter by computed column (may bypass indexes)
SELECT * FROM users WHERE email_domain = 'example.com';
```

---

## 11. Views

Views use the `view` keyword instead of `interface` (Section 2.9):

```typescript
view ActiveUsers {
  id: int;              // PRIMARY KEY
  email: string(255);
  organization_id: int; // FK -> Organizations(id)
  last_login: datetime;
}
```

Materialized view (cached, refresh semantics):

```typescript
// @materialized
view UserStats {
  user_id: int;         // PRIMARY KEY
  total_orders: int;
  lifetime_value: decimal;
  last_order_at?: datetime;
}
```

An LLM consuming this schema knows:
- `ActiveUsers` is a view — do not attempt `INSERT INTO ActiveUsers ...`
- `UserStats` is materialized — results may be stale; prefer base tables
  when freshness matters

---

## 12. Vendor-Specific Types

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

## 13. Schema Namespaces

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

## 14. Quoted Identifiers

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

## 15. Domain Annotations

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

## 16. Complete Example

A realistic schema combining all v0.8 features:

```typescript
// @schema: app
// @description: Core application tables

type UserRole = 'admin' | 'member' | 'guest';
type ProjectStatus = 'active' | 'archived';
type Permission = 'read' | 'write' | 'owner';

interface Organizations {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(200);
  slug: string(200);    // UNIQUE, INDEX
  settings?: json;
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}

// INDEX(organization_id, role)
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  email: string(255);   // UNIQUE
  first_name: string(50);
  last_name: string(50);
  full_name: string(101); // @computed: first_name || ' ' || last_name
  role: UserRole;
  last_login?: datetime;
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}

// PK(user_id, project_id)
interface ProjectMembers {
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  project_id: int;      // FK -> Projects(id), ON DELETE CASCADE
  permission: Permission;
  joined_at: datetime;
}

interface Projects {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  name: string(200);
  description?: text;
  status: ProjectStatus;
  tags: string[];
  created_by: int;      // FK -> Users(id)
  created_at: datetime;
  updated_at?: datetime;
}

view ActiveProjects {
  id: int;              // PRIMARY KEY
  organization_id: int; // FK -> Organizations(id)
  name: string(200);
  status: ProjectStatus;
}

// @materialized
view OrganizationStats {
  organization_id: int; // PRIMARY KEY
  user_count: int;
  project_count: int;
  last_activity_at?: datetime;
}
```

This example demonstrates every v0.8 feature:

- **Type aliases** (`UserRole`, `ProjectStatus`, `Permission`) — defined once,
  reused across tables
- **Composite primary key** (`ProjectMembers`) — no surrogate `id` column
- **Computed column** (`full_name` in `Users`)
- **Views** (`ActiveProjects`) and materialized views (`OrganizationStats`)
- **Schema namespace** (`@schema: app`)
- **Array types** (`tags: string[]`)
- All standard constraint types (PK, FK, UNIQUE, INDEX, DEFAULT)
- Nullable columns (`?` suffix)
- Referential actions (ON DELETE CASCADE)
