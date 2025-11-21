# TSSN Examples

This document provides comprehensive examples of TSSN (TypeScript-Style Schema Notation) covering various real-world scenarios and use cases.

## Table of Contents

1. [Basic Examples](#basic-examples)
2. [E-Commerce Schema](#e-commerce-schema)
3. [Multi-Tenant SaaS](#multi-tenant-saas)
4. [Social Media Platform](#social-media-platform)
5. [Content Management System](#content-management-system)
6. [Financial System](#financial-system)
7. [Healthcare Records](#healthcare-records)
8. [Audit and Compliance](#audit-and-compliance)
9. [Legacy System Migration](#legacy-system-migration)
10. [Time-Series Data](#time-series-data)

---

## Basic Examples

### Simple User Table

```typescript
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  username: string(50); // UNIQUE
  email: string(255);   // UNIQUE
  password_hash: string(255);
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}
```

### Table with Nullable Columns

```typescript
interface Profiles {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  first_name?: string(100);
  last_name?: string(100);
  bio?: text;
  avatar_url?: string(500);
  birth_date?: date;
  updated_at?: datetime;
}
```

### Many-to-Many Relationship

```typescript
interface Students {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  student_number: string(20); // UNIQUE
  name: string(200);
  email: string(255);   // UNIQUE
}

interface Courses {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  code: string(10);     // UNIQUE
  name: string(200);
  credits: int;
}

// UNIQUE(student_id, course_id)
// INDEX(enrollment_date)
interface Enrollments {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  student_id: int;      // FK -> Students(id), ON DELETE CASCADE
  course_id: int;       // FK -> Courses(id), ON DELETE CASCADE
  grade?: string(2);
  enrollment_date: datetime;
  completion_date?: datetime;
}
```

---

## E-Commerce Schema

Complete e-commerce platform schema with products, orders, and payments.

```typescript
interface Categories {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(100);    // UNIQUE
  slug: string(100);    // UNIQUE, INDEX
  parent_id?: int;      // FK -> Categories(id), Self-referential
  description?: text;
  created_at: datetime;
}

// INDEX(sku), INDEX(category_id), INDEX(status)
interface Products {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  sku: string(50);      // UNIQUE
  name: string(200);
  slug: string(200);    // UNIQUE, INDEX
  description?: text;
  category_id: int;     // FK -> Categories(id)
  price: decimal;       // Stored in cents for precision
  compare_price?: decimal;
  cost?: decimal;
  stock_quantity: int;  // DEFAULT 0
  status: string(20);   // CHECK IN ('active', 'draft', 'archived')
  created_at: datetime;
  updated_at?: datetime;
}

interface ProductImages {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  product_id: int;      // FK -> Products(id), ON DELETE CASCADE
  url: string(500);
  alt_text?: string(200);
  sort_order: int;      // DEFAULT 0
}

interface Customers {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);   // UNIQUE
  first_name: string(100);
  last_name: string(100);
  phone?: string(20);
  created_at: datetime;
  updated_at?: datetime;
}

interface Addresses {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  customer_id: int;     // FK -> Customers(id), ON DELETE CASCADE
  type: string(20);     // CHECK IN ('shipping', 'billing')
  street1: string(200);
  street2?: string(200);
  city: string(100);
  state: string(100);
  postal_code: string(20);
  country: string(2);   // ISO country code
  is_default: boolean;  // DEFAULT false
}

// INDEX(customer_id), INDEX(status), INDEX(created_at)
interface Orders {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  order_number: string(20); // UNIQUE
  customer_id: int;     // FK -> Customers(id)
  status: string(20);   // CHECK IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')
  subtotal: decimal;
  tax: decimal;
  shipping: decimal;
  total: decimal;
  shipping_address_id: int; // FK -> Addresses(id)
  billing_address_id: int;  // FK -> Addresses(id)
  notes?: text;
  created_at: datetime;
  updated_at?: datetime;
  shipped_at?: datetime;
  delivered_at?: datetime;
}

interface OrderItems {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  order_id: int;        // FK -> Orders(id), ON DELETE CASCADE
  product_id: int;      // FK -> Products(id)
  quantity: int;
  unit_price: decimal;  // Price at time of order
  total: decimal;       // quantity * unit_price
}

// INDEX(order_id), INDEX(status)
interface Payments {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  order_id: int;        // FK -> Orders(id)
  amount: decimal;
  currency: string(3);  // ISO 4217 currency code
  status: string(20);   // CHECK IN ('pending', 'completed', 'failed', 'refunded')
  payment_method: string(50);
  transaction_id?: string(255); // External payment gateway ID
  created_at: datetime;
  completed_at?: datetime;
}
```

---

## Multi-Tenant SaaS

Schema for a multi-tenant SaaS application with organizations and team management.

```typescript
// @table: core.organizations
// @row_level_security: enabled
interface Organizations {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(200);
  slug: string(200);    // UNIQUE, INDEX
  plan: string(50);     // CHECK IN ('free', 'starter', 'professional', 'enterprise')
  status: string(20);   // CHECK IN ('active', 'suspended', 'cancelled')
  trial_ends_at?: datetime;
  created_at: datetime;
  updated_at?: datetime;
}

// @table: core.users
// UNIQUE(email), INDEX(organization_id)
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  email: string(255);   // UNIQUE
  name: string(200);
  password_hash: string(255);
  email_verified_at?: datetime;
  last_login_at?: datetime;
  status: string(20);   // CHECK IN ('active', 'inactive', 'suspended')
  created_at: datetime;
  updated_at?: datetime;
}

// @table: core.organization_members
// UNIQUE(organization_id, user_id)
// INDEX(user_id), INDEX(role)
interface OrganizationMembers {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  role: string(50);     // CHECK IN ('owner', 'admin', 'member', 'guest')
  invited_by?: int;     // FK -> Users(id)
  joined_at: datetime;
  updated_at?: datetime;
}

// @table: core.teams
// UNIQUE(organization_id, slug)
interface Teams {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  name: string(100);
  slug: string(100);    // INDEX
  description?: text;
  created_by: int;      // FK -> Users(id)
  created_at: datetime;
}

// UNIQUE(team_id, user_id)
interface TeamMembers {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  team_id: int;         // FK -> Teams(id), ON DELETE CASCADE
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  role: string(50);     // CHECK IN ('lead', 'member')
  added_at: datetime;
}

// @table: core.projects
// INDEX(organization_id), INDEX(status)
interface Projects {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  team_id?: int;        // FK -> Teams(id)
  name: string(200);
  slug: string(200);    // INDEX
  description?: text;
  status: string(20);   // CHECK IN ('active', 'on_hold', 'completed', 'cancelled')
  owner_id: int;        // FK -> Users(id)
  created_at: datetime;
  updated_at?: datetime;
}

// @table: core.api_keys
// @description: API keys for programmatic access
// UNIQUE(key_hash), INDEX(organization_id)
interface ApiKeys {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  organization_id: int; // FK -> Organizations(id), ON DELETE CASCADE
  name: string(100);
  key_prefix: string(10); // First 10 chars for identification
  key_hash: string(255);  // Hashed key for security
  permissions: json;    // JSON array of permissions
  last_used_at?: datetime;
  expires_at?: datetime;
  created_by: int;      // FK -> Users(id)
  created_at: datetime;
}
```

---

## Social Media Platform

Schema for a social media platform with posts, comments, and interactions.

```typescript
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  username: string(50); // UNIQUE, INDEX
  email: string(255);   // UNIQUE
  display_name: string(100);
  bio?: text;
  avatar_url?: string(500);
  cover_url?: string(500);
  verified: boolean;    // DEFAULT false
  follower_count: int;  // DEFAULT 0, Denormalized for performance
  following_count: int; // DEFAULT 0
  created_at: datetime;
  updated_at?: datetime;
}

// UNIQUE(follower_id, following_id)
// INDEX(follower_id), INDEX(following_id)
interface Follows {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  follower_id: int;     // FK -> Users(id), ON DELETE CASCADE
  following_id: int;    // FK -> Users(id), ON DELETE CASCADE
  created_at: datetime;
}

// INDEX(user_id), INDEX(created_at)
interface Posts {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  content?: text;
  media_urls?: json;    // Array of media URLs
  visibility: string(20); // CHECK IN ('public', 'followers', 'private')
  like_count: int;      // DEFAULT 0, Denormalized
  comment_count: int;   // DEFAULT 0, Denormalized
  share_count: int;     // DEFAULT 0, Denormalized
  edited: boolean;      // DEFAULT false
  created_at: datetime;
  updated_at?: datetime;
}

// INDEX(post_id), INDEX(user_id), INDEX(created_at)
interface Comments {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  post_id: int;         // FK -> Posts(id), ON DELETE CASCADE
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  parent_id?: int;      // FK -> Comments(id), For nested comments
  content: text;
  like_count: int;      // DEFAULT 0
  edited: boolean;      // DEFAULT false
  created_at: datetime;
  updated_at?: datetime;
}

// UNIQUE(user_id, post_id)
// INDEX(post_id), INDEX(user_id)
interface Likes {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  post_id?: int;        // FK -> Posts(id), ON DELETE CASCADE
  comment_id?: int;     // FK -> Comments(id), ON DELETE CASCADE
  created_at: datetime;
}

// @table: notifications
// @description: User notifications for various events
// INDEX(user_id), INDEX(read), INDEX(created_at)
interface Notifications {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id), ON DELETE CASCADE
  type: string(50);     // like, comment, follow, mention, etc.
  actor_id?: int;       // FK -> Users(id), User who triggered notification
  post_id?: int;        // FK -> Posts(id)
  comment_id?: int;     // FK -> Comments(id)
  read: boolean;        // DEFAULT false
  created_at: datetime;
}

// INDEX(name), INDEX(created_at)
interface Hashtags {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(100);    // UNIQUE
  post_count: int;      // DEFAULT 0, Denormalized
  created_at: datetime;
}

// UNIQUE(post_id, hashtag_id)
interface PostHashtags {
  post_id: int;         // FK -> Posts(id), ON DELETE CASCADE
  hashtag_id: int;      // FK -> Hashtags(id), ON DELETE CASCADE
}
```

---

## Content Management System

Schema for a flexible content management system with versioning.

```typescript
interface ContentTypes {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(100);    // UNIQUE
  slug: string(100);    // UNIQUE, INDEX
  description?: text;
  schema: json;         // JSON Schema definition for content
  created_at: datetime;
  updated_at?: datetime;
}

// INDEX(content_type_id), INDEX(status), INDEX(published_at)
interface Contents {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  content_type_id: int; // FK -> ContentTypes(id)
  title: string(500);
  slug: string(500);    // INDEX
  excerpt?: text;
  body?: text;
  metadata: json;       // Flexible metadata based on content_type schema
  status: string(20);   // CHECK IN ('draft', 'published', 'archived')
  author_id: int;       // FK -> Users(id)
  published_at?: datetime;
  created_at: datetime;
  updated_at?: datetime;
}

// @description: Content versioning for audit trail
// INDEX(content_id), INDEX(created_at)
interface ContentRevisions {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  content_id: int;      // FK -> Contents(id), ON DELETE CASCADE
  version: int;
  title: string(500);
  body?: text;
  metadata: json;
  changed_by: int;      // FK -> Users(id)
  change_summary?: string(500);
  created_at: datetime;
}

interface Categories {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(100);
  slug: string(100);    // UNIQUE, INDEX
  parent_id?: int;      // FK -> Categories(id), Self-referential
  sort_order: int;      // DEFAULT 0
}

interface Tags {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  name: string(100);    // UNIQUE
  slug: string(100);    // UNIQUE, INDEX
  usage_count: int;     // DEFAULT 0
}

// UNIQUE(content_id, category_id)
interface ContentCategories {
  content_id: int;      // FK -> Contents(id), ON DELETE CASCADE
  category_id: int;     // FK -> Categories(id), ON DELETE CASCADE
}

// UNIQUE(content_id, tag_id)
interface ContentTags {
  content_id: int;      // FK -> Contents(id), ON DELETE CASCADE
  tag_id: int;          // FK -> Tags(id), ON DELETE CASCADE
}

// @description: Media library for uploaded files
// INDEX(user_id), INDEX(mime_type), INDEX(created_at)
interface Media {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id)
  filename: string(255);
  path: string(500);
  mime_type: string(100);
  size: int;            // File size in bytes
  width?: int;          // For images
  height?: int;         // For images
  alt_text?: string(500);
  metadata: json;       // EXIF data, etc.
  created_at: datetime;
}
```

---

## Financial System

Schema for a financial system with accounts, transactions, and audit trails.

```typescript
// @schema: finance
// @compliance: SOC2, PCI-DSS
interface Accounts {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  account_number: string(20); // UNIQUE, INDEX
  account_type: string(50);   // CHECK IN ('checking', 'savings', 'credit', 'loan')
  customer_id: int;     // FK -> Customers(id)
  currency: string(3);  // ISO 4217
  balance: decimal;     // Current balance, denormalized
  status: string(20);   // CHECK IN ('active', 'frozen', 'closed')
  opened_at: datetime;
  closed_at?: datetime;
}

// @table: finance.transactions
// @description: All financial transactions with full audit trail
// INDEX(account_id), INDEX(created_at), INDEX(transaction_date)
interface Transactions {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  transaction_id: string(50); // UNIQUE, External transaction ID
  account_id: int;      // FK -> Accounts(id)
  type: string(50);     // debit, credit, transfer, fee, interest
  amount: decimal;      // Always positive, type determines direction
  balance_after: decimal; // Account balance after transaction
  description: string(500);
  reference?: string(100);
  metadata: json;       // Additional transaction details
  transaction_date: datetime;
  posted_at: datetime;  // When transaction was posted
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP
}

// @description: Transfers between accounts
// INDEX(from_account_id), INDEX(to_account_id)
interface Transfers {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  from_account_id: int; // FK -> Accounts(id)
  to_account_id: int;   // FK -> Accounts(id)
  amount: decimal;
  fee: decimal;         // Transfer fee
  exchange_rate?: decimal; // For currency conversion
  status: string(20);   // CHECK IN ('pending', 'completed', 'failed', 'cancelled')
  initiated_by: int;    // FK -> Users(id)
  initiated_at: datetime;
  completed_at?: datetime;
}

// @table: finance.audit_log
// @description: Immutable audit trail for compliance
// @retention: 7 years
// INDEX(entity_type), INDEX(entity_id), INDEX(created_at)
interface AuditLog {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  entity_type: string(50); // accounts, transactions, transfers
  entity_id: int;
  action: string(50);   // create, update, delete, approve, reject
  user_id: int;         // FK -> Users(id)
  ip_address: string(45); // IPv4 or IPv6
  user_agent?: string(500);
  changes: json;        // Before/after snapshot
  created_at: datetime; // DEFAULT CURRENT_TIMESTAMP, Immutable
}

// @description: Recurring payments and subscriptions
// INDEX(account_id), INDEX(next_billing_date)
interface RecurringPayments {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  account_id: int;      // FK -> Accounts(id)
  payee: string(200);
  amount: decimal;
  frequency: string(20); // daily, weekly, monthly, yearly
  start_date: date;
  end_date?: date;
  next_billing_date: date;
  status: string(20);   // CHECK IN ('active', 'paused', 'cancelled')
  created_at: datetime;
  updated_at?: datetime;
}
```

---

## Healthcare Records

Schema for healthcare records with HIPAA compliance considerations.

```typescript
// @schema: healthcare
// @compliance: HIPAA
// @encryption: at_rest, in_transit
interface Patients {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  mrn: string(50);      // UNIQUE, Medical Record Number
  first_name: string(100);
  last_name: string(100);
  date_of_birth: date;
  gender: string(20);
  ssn?: string(11);     // Encrypted at rest
  address?: string(500);
  phone?: string(20);
  email?: string(255);
  emergency_contact?: json;
  insurance_info?: json; // Encrypted
  created_at: datetime;
  updated_at?: datetime;
}

// INDEX(patient_id), INDEX(provider_id), INDEX(appointment_date)
interface Appointments {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  patient_id: int;      // FK -> Patients(id)
  provider_id: int;     // FK -> Providers(id)
  appointment_type: string(100);
  appointment_date: datetime;
  duration_minutes: int;
  status: string(20);   // CHECK IN ('scheduled', 'completed', 'cancelled', 'no_show')
  notes?: text;
  created_at: datetime;
  updated_at?: datetime;
}

// @description: Medical records with strict access controls
// @audit: all_access
// INDEX(patient_id), INDEX(provider_id), INDEX(visit_date)
interface MedicalRecords {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  patient_id: int;      // FK -> Patients(id)
  provider_id: int;     // FK -> Providers(id)
  visit_date: datetime;
  chief_complaint?: text;
  diagnosis?: text;
  treatment?: text;
  prescriptions?: json;
  vital_signs?: json;   // BP, temp, pulse, etc.
  lab_results?: json;
  notes?: text;
  created_at: datetime;
  updated_at?: datetime;
}

// INDEX(patient_id), INDEX(medication_name)
interface Prescriptions {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  patient_id: int;      // FK -> Patients(id)
  provider_id: int;     // FK -> Providers(id)
  medical_record_id?: int; // FK -> MedicalRecords(id)
  medication_name: string(200);
  dosage: string(100);
  frequency: string(100);
  quantity: int;
  refills: int;
  start_date: date;
  end_date?: date;
  status: string(20);   // CHECK IN ('active', 'completed', 'cancelled')
  pharmacy_info?: json;
  created_at: datetime;
}

// @table: healthcare.access_log
// @description: HIPAA-required access audit trail
// @retention: 6 years minimum
// INDEX(patient_id), INDEX(user_id), INDEX(accessed_at)
interface AccessLog {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  patient_id: int;      // FK -> Patients(id)
  user_id: int;         // FK -> Users(id)
  record_type: string(50); // patient, appointment, medical_record, prescription
  record_id: int;
  action: string(50);   // view, create, update, delete
  ip_address: string(45);
  user_agent?: string(500);
  reason?: string(500); // Required for some access types
  accessed_at: datetime; // Immutable
}
```

---

## Audit and Compliance

Schema patterns for audit trails and compliance requirements.

```typescript
// @pattern: audit_trail
// @description: Generic audit trail pattern for any entity
// INDEX(entity_type), INDEX(entity_id), INDEX(created_at)
interface AuditTrail {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  entity_type: string(100); // Table or entity type
  entity_id: int;
  operation: string(20); // INSERT, UPDATE, DELETE
  user_id?: int;        // FK -> Users(id)
  session_id?: string(255);
  ip_address?: string(45);
  old_values?: json;    // Before state
  new_values?: json;    // After state
  created_at: datetime; // Immutable timestamp
}

// @pattern: soft_delete
// @description: Soft delete pattern with deleted_at timestamp
interface SoftDeleteExample {
  id: int;
  name: string(200);
  status: string(20);
  deleted_at?: datetime; // NULL = active, NOT NULL = deleted
  deleted_by?: int;      // FK -> Users(id)
}

// @pattern: row_versioning
// @description: Optimistic locking with version numbers
interface VersionedRecord {
  id: int;              // PRIMARY KEY
  data: text;
  version: int;         // Incremented on each update
  updated_at: datetime;
}

// @pattern: data_retention
// @description: Automatic data expiration
interface ExpiringData {
  id: int;
  data: text;
  created_at: datetime;
  expires_at: datetime; // Auto-delete after this date
  retention_policy: string(50);
}
```

---

## Legacy System Migration

Patterns for migrating from legacy systems with compatibility layers.

```typescript
// @migration: from_legacy_users
// @description: New user table with legacy_id for migration tracking
interface Users {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  legacy_id?: int;      // UNIQUE, Reference to old system
  email: string(255);   // UNIQUE
  username: string(50); // UNIQUE
  migrated_at?: datetime;
  created_at: datetime;
}

// @migration: dual_write_phase
// @description: Temporary table during dual-write migration
interface UsersShadow {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;         // FK -> Users(id)
  legacy_data: json;    // Original data format
  sync_status: string(20); // synced, pending, failed
  last_synced_at?: datetime;
}

// @deprecated: replaced_by=Orders
// @description: Legacy orders table, read-only after 2024-12-31
interface LegacyOrders {
  order_id: int;        // PRIMARY KEY
  customer_code: string(20);
  total_amount: decimal;
  legacy_status: string(10);
  created_date: datetime;
}
```

---

## Time-Series Data

Schema for time-series data with partitioning hints.

```typescript
// @table: metrics.server_metrics
// @partition: by_range(created_at, monthly)
// @retention: 90 days
// INDEX(server_id), INDEX(created_at)
interface ServerMetrics {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  server_id: int;       // FK -> Servers(id)
  cpu_usage: decimal;
  memory_usage: decimal;
  disk_usage: decimal;
  network_in: int;      // bytes
  network_out: int;     // bytes
  created_at: datetime; // Partition key
}

// @table: logs.application_logs
// @partition: by_range(created_at, daily)
// @retention: 30 days
// INDEX(level), INDEX(service), INDEX(created_at)
interface ApplicationLogs {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  service: string(50);
  level: string(20);    // DEBUG, INFO, WARN, ERROR
  message: text;
  context: json;
  trace_id?: string(50);
  span_id?: string(50);
  created_at: datetime; // Partition key
}

// @table: analytics.events
// @partition: by_hash(user_id, 10)
// @description: High-volume event tracking
// INDEX(event_type), INDEX(created_at)
interface Events {
  id: int;              // PRIMARY KEY, AUTO_INCREMENT
  user_id: int;
  event_type: string(100);
  properties: json;
  session_id?: string(255);
  ip_address?: string(45);
  user_agent?: string(500);
  created_at: datetime;
}
```

---

## Notes

These examples demonstrate:
- Real-world schema patterns
- Proper constraint usage
- Denormalization strategies
- Compliance considerations
- Migration patterns
- Performance optimizations

For more examples, see the [TSSN Specification](TSSN-SPEC.md).
