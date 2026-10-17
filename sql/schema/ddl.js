'use strict';

/**
 * Manifest -> SQL text.
 *
 * Pure string generation, no database connection. The migrations in
 * sql/migrations/ call these functions and execute what comes back, which keeps
 * the DDL testable without a server and makes the generated SQL something you can
 * print and read before it runs anywhere.
 *
 * Statement ordering matters and is fixed here rather than left to the caller:
 *
 *   1. the `objectid` domain          (every table depends on it)
 *   2. schema
 *   3. tables, with primary keys and CHECK constraints inline
 *   4. foreign keys, as ALTER statements
 *   5. indexes
 *
 * Foreign keys come after every table rather than inline because the reference
 * graph has cycles -- `users.branch_id` -> branches and `branches.manager_id` ->
 * users -- and no single CREATE ordering satisfies both. Adding them afterwards
 * removes the ordering problem entirely instead of hand-sorting 194 constraints
 * and hoping the next added reference does not reintroduce it.
 */

const typeMap = require('./typeMap');

/* ── Literals ──────────────────────────────────────────────── */

/**
 * Identifiers are validated rather than escaped.
 *
 * Everything here is generated from schema files rather than user input, so
 * escaping would be defence against a threat that does not exist while quietly
 * accepting a name that is wrong. Refusing anything that is not a plain
 * identifier turns a generator bug into a loud failure at build time.
 */
function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`refusing to emit a non-identifier into DDL: ${JSON.stringify(name)}`);
  }
  return typeMap.isReserved(name) ? `"${name}"` : name;
}

const qualified = (schema, table) => `${ident(schema)}.${ident(table)}`;
const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

/* ── Shared objects ────────────────────────────────────────── */

const OBJECTID_SCHEMA = 'public';

/**
 * The `objectid` domain lives in `public` so that every schema can reach it
 * through the default search_path without being granted anything that holds
 * data -- `public` ends up containing exactly one type and no tables.
 *
 * `char(24)` with a hex CHECK rather than bare text. It is fixed-width, it
 * refuses a truncated or upper-cased id at write time, and it makes a
 * mis-mapped column visible immediately instead of at the first join.
 */
function createDomain() {
  return [
    `do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'objectid' and n.nspname = ${literal(OBJECTID_SCHEMA)}) then
    create domain ${ident(OBJECTID_SCHEMA)}.objectid as char(24)
      check (value ~ '^[0-9a-fA-F]{24}$');
  end if;
end $$;`,
  ];
}

function dropDomain() {
  return [`drop domain if exists ${ident(OBJECTID_SCHEMA)}.objectid;`];
}

const createSchema = (schema) => [`create schema if not exists ${ident(schema)};`];
const dropSchema = (schema) => [`drop schema if exists ${ident(schema)} cascade;`];

/* ── Columns ───────────────────────────────────────────────── */

function columnType(col) {
  if (col.type === typeMap.OBJECTID_DOMAIN) return `${ident(OBJECTID_SCHEMA)}.objectid`;
  return col.type;
}

function columnClause(col) {
  const parts = [ident(col.column), columnType(col)];
  if (col.notNull) parts.push('not null');
  if (col.default !== undefined && col.default !== null) parts.push(`default ${col.default}`);
  return parts.join(' ');
}

/**
 * Enum CHECKs always admit NULL explicitly.
 *
 * `col in ('a','b')` evaluates to NULL for a NULL column, and a CHECK passes on
 * NULL, so the constraint is already satisfied -- but only by accident of
 * three-valued logic. Writing it out means the intent survives someone later
 * reading the constraint and "simplifying" it.
 */
function checkConstraints(table, columns) {
  const out = [];
  for (const col of columns) {
    if (!col.enum || !col.enum.length) continue;
    const name = typeMap.fitIdentifier(`${table}_${col.column}_check`);
    const values = col.enum.map(literal).join(', ');
    out.push({ name, sql: `${ident(col.column)} is null or ${ident(col.column)} in (${values})` });
  }
  return out;
}

/* ── Tables ────────────────────────────────────────────────── */

function createTable(schema, table, columns, opts = {}) {
  const lines = columns.map((c) => `  ${columnClause(c)}`);

  const pk = opts.primaryKey || columns.filter((c) => c.primaryKey).map((c) => c.column);
  if (pk.length) {
    lines.push(`  constraint ${ident(typeMap.fitIdentifier(`${table}_pkey`))} primary key (${pk.map(ident).join(', ')})`);
  }

  for (const chk of checkConstraints(table, columns)) {
    lines.push(`  constraint ${ident(chk.name)} check (${chk.sql})`);
  }

  return `create table if not exists ${qualified(schema, table)} (\n${lines.join(',\n')}\n);`;
}

/* ── Foreign keys ──────────────────────────────────────────── */

/**
 * `NOT VALID` is the whole point of this function.
 *
 * Mongo never enforced the 194 references and the data contains violations, so a
 * plain foreign key would fail the load. The two obvious responses are both bad:
 * dropping the constraint leaves the database in exactly the unenforced state the
 * migration exists to end, and deleting the offending rows destroys data before
 * anyone has decided what it is.
 *
 * `NOT VALID` does neither. The constraint is enforced for every row written from
 * now on, the existing violations are tolerated, and `VALIDATE CONSTRAINT`
 * promotes it to fully enforced once the rows are cleaned -- taking only a
 * SHARE UPDATE EXCLUSIVE lock, so it does not rewrite the table or block reads.
 */
function addForeignKey(schema, table, fk, targetSchema) {
  if (!fk.referencesTable) return null;
  const name = typeMap.fitIdentifier(`${table}_${fk.column}_fkey`);
  const target = qualified(targetSchema || schema, fk.referencesTable);
  const onDelete = fk.onDelete === 'restrict' ? 'restrict' : 'set null';
  return `alter table ${qualified(schema, table)}
  add constraint ${ident(name)}
  foreign key (${ident(fk.column)}) references ${target} (id)
  on delete ${onDelete}${fk.notValid ? '\n  not valid' : ''};`;
}

const validateForeignKey = (schema, table, fkName) =>
  `alter table ${qualified(schema, table)} validate constraint ${ident(fkName)};`;

const dropForeignKey = (schema, table, fkName) =>
  `alter table ${qualified(schema, table)} drop constraint if exists ${ident(fkName)};`;

/** The constraint name the generator gives a foreign key. One definition, because
 *  the ETL drops by name what the migration created by name. */
const foreignKeyName = (table, column) => typeMap.fitIdentifier(`${table}_${column}_fkey`);

/* ── Indexes ───────────────────────────────────────────────── */

function createIndex(schema, table, index) {
  if (index.kind === 'unsupported') return null;

  // The index was declared on this table but its data now lives in a child or
  // junction table, so it is created there instead.
  const target = qualified(schema, index.relocatedTo || table);
  const name = ident(index.name);

  if (index.kind === 'gin') {
    return `create index if not exists ${name} on ${target} using gin (${index.expression});`;
  }

  const unique = index.kind === 'unique' ? 'unique ' : '';
  const where = index.where ? ` where ${index.where}` : '';

  // An expression index indexes a computed value rather than a column — used for
  // keys extracted out of a jsonb object. It is emitted verbatim because it is
  // generated SQL, not an identifier, so `ident()` would reject it.
  if (index.expression) {
    return `create ${unique}index if not exists ${name} on ${target} (${index.expression})${where};`;
  }

  const cols = (index.columns || []).map((c) => `${ident(c.column)}${c.desc ? ' desc' : ''}`).join(', ');
  return `create ${unique}index if not exists ${name} on ${target} (${cols})${where};`;
}

/* ── Per-tenant roles ──────────────────────────────────────── */

/**
 * Rule 4 of plan section 2.2: a role with `USAGE` on exactly one schema.
 *
 * This is what makes `select * from other_clinic.patients` fail with a
 * permission error rather than return rows -- server-side, regardless of what
 * the application believes about the current tenant. CP-3 asserts on the error
 * code, not on an empty result, because an empty result would mean the query was
 * allowed and merely found nothing.
 *
 * The revokes matter as much as the grants. Without them PUBLIC retains CREATE
 * and USAGE on `public` in older databases, which is enough for a tenant role to
 * create objects outside its own schema.
 */
function createTenantRole(schema, roleName, password) {
  const role = ident(roleName);
  return [
    `do $$
begin
  if not exists (select 1 from pg_roles where rolname = ${literal(roleName)}) then
    create role ${role} login password ${literal(password)};
  end if;
end $$;`,

    // Nothing outside its own schema, first and explicitly.
    `revoke all on schema public from ${role};`,
    `grant usage on schema public to ${role};`,   // for the objectid domain only
    `revoke create on schema public from ${role};`,

    `grant usage on schema ${ident(schema)} to ${role};`,
    `grant select, insert, update, delete on all tables in schema ${ident(schema)} to ${role};`,
    `grant usage, select on all sequences in schema ${ident(schema)} to ${role};`,

    // Tables created after this runs would otherwise be unreachable by the role,
    // and the failure would appear as a permission error on a brand-new feature
    // long after the migration that caused it.
    `alter default privileges in schema ${ident(schema)}
       grant select, insert, update, delete on tables to ${role};`,
  ];
}

function dropTenantRole(schema, roleName) {
  const role = ident(roleName);
  return [
    `alter default privileges in schema ${ident(schema)} revoke all on tables from ${role};`,
    `revoke all on all tables in schema ${ident(schema)} from ${role};`,
    `revoke all on schema ${ident(schema)} from ${role};`,
    `revoke all on schema public from ${role};`,
    `do $$ begin if exists (select 1 from pg_roles where rolname = ${literal(roleName)}) then drop role ${role}; end if; end $$;`,
  ];
}

/**
 * F-4 marked `clinics.dbUri` sensitive: it holds plaintext tenant database
 * credentials in all 27 clinics. Column-level revoke keeps it out of reach of
 * any role that does not specifically need it, so a compromised tenant role does
 * not yield every other tenant's credentials.
 */
function revokeSensitiveColumns(schema, table, columns, roleName) {
  const sensitive = columns.filter((c) => c.sensitive).map((c) => c.column);
  if (!sensitive.length) return [];
  return [`revoke select (${sensitive.map(ident).join(', ')}) on ${qualified(schema, table)} from ${ident(roleName)};`];
}

/**
 * Tables the application may only ever append to.
 *
 * Derived from the model hooks: `FinancialAuditLog` and `PatientLedger` each
 * register nine `pre()` guards blocking every Mongoose write path — updateOne,
 * updateMany, findOneAndUpdate, findOneAndReplace, replaceOne, deleteOne,
 * deleteMany, findOneAndDelete, and save-on-an-existing-document. Nine, because
 * that is how many ways Mongoose offers to write, and each has to be blocked
 * separately.
 *
 * `node scripts/sql/inventory-hooks.js` finds them, and will find any model that
 * adopts the same pattern later.
 */
const APPEND_ONLY_TABLES = ['financial_audit_logs', 'patient_ledgers'];

/**
 * Enforce append-only at the grant, not in the application.
 *
 * This is stronger than the hooks it replaces. A `pre('deleteOne')` guard is
 * bypassed by anything that reaches the driver directly - a migration script, a
 * console session, a library that builds its own query. A revoked privilege
 * cannot be bypassed by the application at all, because the permission is not
 * there to use.
 *
 * One of the few places where porting a behaviour improves it rather than merely
 * preserving it.
 */
function revokeAppendOnly(schema, roleName) {
  const role = ident(roleName);
  return APPEND_ONLY_TABLES.map(
    (t) => `revoke update, delete on ${qualified(schema, t)} from ${role};`,
  );
}

/* ── Whole-schema emission ─────────────────────────────────── */

/**
 * Every statement for one scope, in dependency order.
 *
 * `resolveSchema` maps a referenced table's scope to the schema it lives in, so a
 * tenant table pointing at a platform table produces a cross-schema foreign key
 * rather than one that silently targets a table of the same name in the wrong
 * schema.
 */
function emitScope(manifest, scope, schema, { resolveSchema } = {}) {
  const tables = manifest.tables.filter((t) => t.scope === scope);
  const create = [];
  const constraints = [];
  const indexes = [];

  for (const t of tables) {
    create.push(createTable(schema, t.table, t.columns));

    for (const child of t.childTables) {
      create.push(createTable(schema, child.table, child.columns, {
        primaryKey: [child.columns[0].column, child.columns.find((c) => /^(line_no)$/.test(c.column)).column],
      }));
      for (const idx of child.indexes) {
        const sql = createIndex(schema, child.table, idx);
        if (sql) indexes.push(sql);
      }
      for (const fk of child.foreignKeys) {
        const targetSchema = resolveSchema ? resolveSchema(fk.referencesScope) : schema;
        const sql = addForeignKey(schema, child.table, fk, targetSchema);
        if (sql) constraints.push(sql);
      }
      // The child's link back to its parent. ON DELETE CASCADE because a line
      // item has no meaning without its invoice -- unlike the entity references
      // above, where the row survives the thing it points at.
      constraints.push(`alter table ${qualified(schema, child.table)}
  add constraint ${ident(typeMap.fitIdentifier(`${child.table}_parent_fkey`))}
  foreign key (${ident(child.columns[0].column)}) references ${qualified(schema, t.table)} (id)
  on delete cascade;`);
    }

    for (const j of t.junctionTables) {
      const cols = [
        { column: j.parentColumn, type: typeMap.OBJECTID_DOMAIN, notNull: true },
        { column: j.targetColumn, type: typeMap.OBJECTID_DOMAIN, notNull: true },
      ];
      if (scope === 'tenant') cols.push({ column: 'clinic_id', type: typeMap.OBJECTID_DOMAIN, notNull: true });
      create.push(createTable(schema, j.table, cols, { primaryKey: [j.parentColumn, j.targetColumn] }));

      constraints.push(`alter table ${qualified(schema, j.table)}
  add constraint ${ident(typeMap.fitIdentifier(`${j.table}_parent_fkey`))}
  foreign key (${ident(j.parentColumn)}) references ${qualified(schema, t.table)} (id)
  on delete cascade;`);

      if (j.targetTable) {
        const targetSchema = resolveSchema ? resolveSchema(j.targetScope) : schema;
        constraints.push(`alter table ${qualified(schema, j.table)}
  add constraint ${ident(typeMap.fitIdentifier(`${j.table}_target_fkey`))}
  foreign key (${ident(j.targetColumn)}) references ${qualified(targetSchema, j.targetTable)} (id)
  on delete cascade
  not valid;`);
      }
    }

    for (const fk of t.foreignKeys) {
      const targetSchema = resolveSchema ? resolveSchema(fk.referencesScope) : schema;
      const sql = addForeignKey(schema, t.table, fk, targetSchema);
      if (sql) constraints.push(sql);
    }

    for (const idx of t.indexes) {
      const sql = createIndex(schema, t.table, idx);
      if (sql) indexes.push(sql);
    }
  }

  return { create, constraints, indexes };
}

module.exports = {
  ident,
  literal,
  qualified,
  columnClause,
  columnType,
  checkConstraints,
  createDomain,
  dropDomain,
  createSchema,
  dropSchema,
  createTable,
  addForeignKey,
  validateForeignKey,
  dropForeignKey,
  foreignKeyName,
  createIndex,
  createTenantRole,
  dropTenantRole,
  revokeSensitiveColumns,
  revokeAppendOnly,
  APPEND_ONLY_TABLES,
  emitScope,
  OBJECTID_SCHEMA,
};
