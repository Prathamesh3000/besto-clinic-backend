'use strict';

/**
 * SQL migration tooling configuration.
 *
 * Deliberately standalone — it does NOT require src/config/env.js.
 *
 * Reason: src/config/env.js validates the whole running application (SMTP,
 * Razorpay, Firebase, JWT secrets…) and calls process.exit(1) if any of it is
 * missing. Migration tooling must be runnable on a machine that has a database
 * and nothing else. Coupling the two would mean you cannot profile a database
 * without valid payment-gateway credentials.
 *
 * dotenv is loaded here rather than in src/config/env.js because this is a
 * separate entry point. dotenv never overwrites variables already present in
 * process.env, so loading it twice is harmless.
 */

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Atlas uses `mongodb+srv://`, which needs a DNS SRV lookup. This machine's
 * default resolver refuses SRV queries (`querySrv ECONNREFUSED`), so resolution
 * is pointed at public resolvers — the same workaround server.js applies at boot
 * (see server.js `dns.setServers`). Without this, every Mongo-reading tool here
 * fails on a machine where the application itself connects fine.
 *
 * Override with SQL_DNS_SERVERS (comma-separated) to use a different resolver.
 */
const dns = require('dns');
const dnsServers = (process.env.SQL_DNS_SERVERS || '8.8.8.8,8.8.4.4')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

/** Hosts we consider safe to create, drop and migrate schemas on. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * PostgreSQL target — the database we are migrating *to*.
 *
 * Defaults point at a local instance. Targeting anything else requires
 * SQL_ALLOW_REMOTE=true, so a stray hostname cannot silently send DDL
 * somewhere it should not go.
 */
const postgres = Object.freeze({
  host:     process.env.PG_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'bestoclinic_dev',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  allowRemote: String(process.env.SQL_ALLOW_REMOTE || '').toLowerCase() === 'true',
});

/**
 * MongoDB source — the database we are migrating *from*.
 *
 * Every tool in this directory treats Mongo as strictly read-only. None of them
 * opens a write path, so the source cannot be damaged by a migration bug. The
 * production guard below exists to control *load*, not to prevent corruption.
 */
const mongo = Object.freeze({
  uri: process.env.SQL_SOURCE_MONGO_URI || process.env.PLATFORM_DB_URI || '',
  /** Reads go to a replica by default so profiling never loads the primary. */
  readPreference: process.env.SQL_SOURCE_READ_PREFERENCE || 'secondaryPreferred',
  allowProductionRead:
    String(process.env.SQL_ALLOW_PRODUCTION_READ || '').toLowerCase() === 'true',
});

/** Extract a hostname from a Mongo or Postgres URI without pulling in a parser. */
function hostOf(uri) {
  const match = /^[a-z+]+:\/\/(?:[^@/]*@)?([^/:,?]+)/i.exec(uri || '');
  return match ? match[1].toLowerCase() : '';
}

/** True when a host is loopback — i.e. a developer's own machine. */
function isLocalHost(host) {
  return LOCAL_HOSTS.has(host);
}

/**
 * Heuristic: does this URI point at a live, shared database?
 *
 * Deliberately errs toward "yes". A false positive costs one environment
 * variable; a false negative costs load on a cluster serving 19 clinics.
 */
function looksLikeProduction(uri) {
  const host = hostOf(uri);
  if (!host) return false;
  if (isLocalHost(host)) return false;
  return true;
}

/** Redact credentials so a URI can be safely printed or logged. */
function redact(uri) {
  return String(uri || '').replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@');
}

/**
 * Secret used to derive per-tenant PostgreSQL role passwords.
 *
 * Read here rather than at the point of use so every configuration value the
 * migration tooling depends on is declared in one file -- the same reason
 * src/config/env.js exists for the application. This module is the tooling's
 * equivalent, and reading process.env directly from a script would defeat it.
 */
const tenantRoleSecret = process.env.SQL_TENANT_ROLE_SECRET || '';

module.exports = {
  postgres,
  tenantRoleSecret,
  mongo,
  hostOf,
  isLocalHost,
  looksLikeProduction,
  redact,
};
