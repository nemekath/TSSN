/**
 * End-to-end smoke test for the canonical "Complete Example" in
 * EXAMPLES.md Section 16. This exercises every v0.8 feature in one
 * schema and is the closest thing the unit suite has to a real-world
 * integration test. If this file fails, something broad broke.
 *
 * The schema here is a verbatim copy of EXAMPLES.md Section 16
 * (lines 403–466 as of commit 4b22d4e). When EXAMPLES.md is revised,
 * this fixture must be updated in lockstep — drift between the
 * documented example and this test is itself a finding.
 */

import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import {
  tables,
  views,
  typeAliases,
  type AliasType,
  type ArrayType,
  type BaseType,
  type ComputedConstraint,
  type ForeignKeyConstraint,
} from '../src/ast.js';

const CANONICAL = `
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
`;

describe('EXAMPLES.md Section 16 — Complete Example', () => {
  const schema = parse(CANONICAL);

  it('parses without errors or validator failures', () => {
    expect(() => parse(CANONICAL)).not.toThrow();
  });

  it('collects exactly three type aliases', () => {
    const names = typeAliases(schema).map((a) => a.name);
    expect(names).toEqual(['UserRole', 'ProjectStatus', 'Permission']);
  });

  it('collects four tables in source order', () => {
    expect(tables(schema).map((t) => t.name)).toEqual([
      'Organizations',
      'Users',
      'ProjectMembers',
      'Projects',
    ]);
  });

  it('collects two views in source order', () => {
    expect(views(schema).map((v) => v.name)).toEqual([
      'ActiveProjects',
      'OrganizationStats',
    ]);
  });

  it('marks OrganizationStats as materialized', () => {
    const stats = views(schema).find((v) => v.name === 'OrganizationStats')!;
    expect(stats.materialized).toBe(true);
    expect(stats.readonly).toBe(true);
  });

  it('marks ActiveProjects as a plain, read-only view', () => {
    const ap = views(schema).find((v) => v.name === 'ActiveProjects')!;
    expect(ap.materialized).toBe(false);
    expect(ap.readonly).toBe(true);
    expect(ap.readonlyAnnotated).toBe(false);
  });

  it('resolves UserRole alias on the role column', () => {
    const users = tables(schema).find((t) => t.name === 'Users')!;
    const role = users.columns.find((c) => c.name === 'role')!;
    expect(role.type.kind).toBe('alias');
    const alias = role.type as AliasType;
    expect(alias.name).toBe('UserRole');
    expect(alias.resolved.kind).toBe('union');
  });

  it('resolves ProjectStatus alias on both Projects and ActiveProjects', () => {
    const projects = tables(schema).find((t) => t.name === 'Projects')!;
    const ap = views(schema).find((v) => v.name === 'ActiveProjects')!;
    const pStatus = projects.columns.find((c) => c.name === 'status')!;
    const apStatus = ap.columns.find((c) => c.name === 'status')!;
    expect(pStatus.type.kind).toBe('alias');
    expect(apStatus.type.kind).toBe('alias');
    expect((pStatus.type as AliasType).name).toBe('ProjectStatus');
    expect((apStatus.type as AliasType).name).toBe('ProjectStatus');
  });

  it('resolves Permission alias on ProjectMembers.permission', () => {
    const pm = tables(schema).find((t) => t.name === 'ProjectMembers')!;
    const perm = pm.columns.find((c) => c.name === 'permission')!;
    expect(perm.type.kind).toBe('alias');
    expect((perm.type as AliasType).name).toBe('Permission');
  });

  it('captures the composite primary key on ProjectMembers', () => {
    const pm = tables(schema).find((t) => t.name === 'ProjectMembers')!;
    const pk = pm.tableConstraints.find(
      (c) => c.kind === 'composite_primary_key'
    );
    expect(pk).toBeDefined();
    expect((pk as { columns: string[] }).columns).toEqual([
      'user_id',
      'project_id',
    ]);
  });

  it('captures the INDEX(organization_id, role) on Users', () => {
    const users = tables(schema).find((t) => t.name === 'Users')!;
    const idx = users.tableConstraints.find((c) => c.kind === 'index');
    expect(idx).toBeDefined();
    expect((idx as { columns?: string[] }).columns).toEqual([
      'organization_id',
      'role',
    ]);
  });

  it('parses tags as an array of strings', () => {
    const projects = tables(schema).find((t) => t.name === 'Projects')!;
    const tags = projects.columns.find((c) => c.name === 'tags')!;
    expect(tags.type.kind).toBe('array');
    const arr = tags.type as ArrayType;
    expect((arr.element as BaseType).base).toBe('string');
  });

  it('captures @computed on full_name with the SQL expression', () => {
    const users = tables(schema).find((t) => t.name === 'Users')!;
    const fullName = users.columns.find((c) => c.name === 'full_name')!;
    const computed = fullName.constraints.find(
      (c) => c.kind === 'computed'
    ) as ComputedConstraint;
    expect(computed).toBeDefined();
    expect(computed.expression).toBe("first_name || ' ' || last_name");
  });

  it('captures the ON DELETE CASCADE tail on cross-table FKs', () => {
    const users = tables(schema).find((t) => t.name === 'Users')!;
    const orgFk = users.columns
      .find((c) => c.name === 'organization_id')!
      .constraints.find((c) => c.kind === 'foreign_key') as ForeignKeyConstraint;
    expect(orgFk.table).toBe('Organizations');
    expect(orgFk.column).toBe('id');
    expect(orgFk.tail).toBe('ON DELETE CASCADE');
  });

  it('propagates @schema: app from the top of the file across type aliases', () => {
    // Per Spec 2.7.2 (added as Charter Q13 resolution), a top-of-file
    // @schema annotation that is separated from the first interface by
    // intervening type aliases becomes the parse-unit default and
    // applies to every subsequent declaration that does not carry its
    // own @schema. In the canonical schema, every table and every view
    // inherits @schema: app.
    const orgs = tables(schema).find((t) => t.name === 'Organizations')!;
    const users = tables(schema).find((t) => t.name === 'Users')!;
    const projects = tables(schema).find((t) => t.name === 'Projects')!;
    const ap = views(schema).find((v) => v.name === 'ActiveProjects')!;
    expect(orgs.schema).toBe('app');
    expect(users.schema).toBe('app');
    expect(projects.schema).toBe('app');
    expect(ap.schema).toBe('app');
  });

  it('preserves declaration order in schema.declarations', () => {
    const kinds = schema.declarations.map((d) => d.kind);
    expect(kinds).toEqual([
      'type_alias',
      'type_alias',
      'type_alias',
      'table',
      'table',
      'table',
      'table',
      'view',
      'view',
    ]);
  });
});
