# TSSN Examples

Focused examples for each specification feature. For the complete specification, see [TSSN-SPEC.md](TSSN-SPEC.md).

## Table of Contents

1. [Core Syntax](#1-core-syntax)
2. [Data Types](#2-data-types)
3. [Nullability](#3-nullability)
4. [Constraints](#4-constraints)
5. [Multi-Column Constraints](#5-multi-column-constraints)
6. [Vendor-Specific Types](#6-vendor-specific-types)
7. [Schema Namespaces](#7-schema-namespaces)
8. [Domain Annotations](#8-domain-annotations)
9. [Complete Example](#9-complete-example)

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

## 3. Nullability

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

## 4. Constraints

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

## 5. Multi-Column Constraints

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

## 6. Vendor-Specific Types

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

## 7. Schema Namespaces

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

## 8. Domain Annotations

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

## 9. Complete Example

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
