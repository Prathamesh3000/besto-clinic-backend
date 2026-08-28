'use strict';

/**
 * Clinic slug -> PostgreSQL schema and role names.
 *
 * One module because three things have to agree on these names -- the
 * provisioner that creates them, the repository seam that connects as them, and
 * CP-3 which asserts one cannot read another. Two of the three deriving the name
 * slightly differently is an isolation bug that presents as a confusing
 * missing-schema error, or worse, silently as a query against the wrong schema.
 *
 * Slugs are `jathar-dental`. Schemas cannot contain `-` unquoted, so it becomes
 * `jathar_dental`, and the role is `tenant_jathar_dental`.
 */

const crypto = require('crypto');

/** Reserved: a clinic must never be able to claim one of these. */
const RESERVED_SCHEMAS = new Set([
  'public', 'platform', 'information_schema', 'pg_catalog', 'pg_toast', 'pg_temp',
]);

/**
 * Slug -> schema name.
 *
 * Validated, not sanitised. A slug that does not map cleanly is refused rather
 * than quietly coerced, because two slugs coercing to the same schema name would
 * merge two clinics' data -- the single worst outcome available in a multi-tenant
 * migration, and one that would look like a successful provisioning run.
 */
function schemaFor(slug) {
  if (!slug || typeof slug !== 'string') {
    throw new Error(`invalid clinic slug: ${JSON.stringify(slug)}`);
  }

  const schema = slug.trim().toLowerCase().replace(/-/g, '_');

  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error(
      `clinic slug "${slug}" does not map to a valid PostgreSQL schema name. `
      + 'Expected letters, digits and hyphens, starting with a letter.'
    );
  }
  if (schema.length > 63) {
    throw new Error(`clinic slug "${slug}" exceeds the 63-character schema name limit.`);
  }
  if (RESERVED_SCHEMAS.has(schema)) {
    throw new Error(`clinic slug "${slug}" collides with the reserved schema "${schema}".`);
  }
  if (schema.startsWith('pg_')) {
    throw new Error(`clinic slug "${slug}" would create a schema in the reserved pg_ namespace.`);
  }
  return schema;
}

const roleFor = (slug) => `tenant_${schemaFor(slug)}`;

/**
 * A per-tenant password, generated rather than configured.
 *
 * These roles are reachable only from the application, so the password is an
 * implementation detail -- but it still must not be predictable, and it must not
 * be the same for every clinic, or one leaked tenant credential is all of them.
 *
 * Derived from a single secret plus the slug so it is reproducible across
 * processes without storing 27 more secrets. F-4 already found tenant credentials
 * stored in plaintext; this deliberately avoids adding another such store.
 */
function passwordFor(slug, secret) {
  if (!secret) {
    throw new Error(
      'A secret is required to derive tenant role passwords. Set SQL_TENANT_ROLE_SECRET.'
    );
  }
  return crypto.createHmac('sha256', secret)
    .update(`pgrole:${schemaFor(slug)}`)
    .digest('base64url')
    .slice(0, 32);
}

module.exports = { schemaFor, roleFor, passwordFor, RESERVED_SCHEMAS };
