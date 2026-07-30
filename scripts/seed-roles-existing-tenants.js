'use strict';

/**
 * Role permission sync — reconciles each tenant's Role collection against the
 * ROLE_PERMISSIONS map in src/config/permissions.js.
 *
 * Why this is needed: role.service.getRolePermissions() reads permissions from the
 * tenant's Role documents and only falls back to the static map when no Role doc
 * exists. Tenants provisioned earlier therefore keep whatever permission list they
 * were seeded with, so permissions added to the code afterwards never reach them —
 * which surfaces to users as "Missing required permission(s): …".
 *
 * Usage:
 *   node scripts/seed-roles-existing-tenants.js --dry-run              # preview all tenants
 *   node scripts/seed-roles-existing-tenants.js <slug> --dry-run       # preview one tenant
 *   node scripts/seed-roles-existing-tenants.js <slug>                 # apply to one tenant
 *   node scripts/seed-roles-existing-tenants.js                        # apply to all tenants
 *
 * Safe to re-run. Permission changes are ADDITIVE ($addToSet) — the script never
 * revokes a permission, so customisations made in Role Master are preserved.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { ROLE_PERMISSIONS } = require('../src/config/permissions');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SLUG = args.find((a) => !a.startsWith('--')); // optional — omitted = all tenants

/** Snapshot of every role doc, captured before any write, for rollback. */
const backup = {};

// Every tenant-side role. Platform-only roles (product_owner) are excluded — they
// never live in a tenant DB. Keep this list in sync with ROLE_PERMISSIONS so that
// permissions added in code are pushed out to existing tenants on re-run.
// NOTE: `super_admin` and `owner` are deliberately NOT seeded. Staff Management
// lists every active role except group 'clinical' (staff.service.js _getStaffRoles),
// so creating Role docs for them would make the two highest-privilege roles
// assignable to any staff member from the Staff UI — a privilege-escalation path
// that does not exist while they resolve through the ROLE_PERMISSIONS fallback.
const DEFAULT_ROLES = [
  { slug: 'admin',              name: 'Clinic Admin',       group: 'admin',      displayOrder: 2 },
  { slug: 'manager',            name: 'Manager',            group: 'admin',      displayOrder: 3 },
  { slug: 'department_manager', name: 'Department Manager', group: 'admin',      displayOrder: 4 },
  { slug: 'doctor',             name: 'Doctor',             group: 'clinical',   displayOrder: 5 },
  { slug: 'receptionist',       name: 'Receptionist',       group: 'front_desk', displayOrder: 6 },
  { slug: 'support_staff',      name: 'Support Staff',      group: 'front_desk', displayOrder: 7 },
  { slug: 'billing_officer',    name: 'Billing Officer',    group: 'finance',    displayOrder: 8 },
  { slug: 'accountant',         name: 'Accountant',         group: 'finance',    displayOrder: 9 },
  { slug: 'hr_payroll_manager', name: 'HR / Payroll',       group: 'admin',      displayOrder: 10 },
  { slug: 'it_support',         name: 'IT Support',         group: 'admin',      displayOrder: 11 },
  // NOTE: `patient` and `guardian` are deliberately NOT seeded. They are not staff
  // roles, the Role.group enum has no bucket for them, and creating Role docs would
  // surface them in Role Master / staff role selectors. They resolve correctly via
  // the ROLE_PERMISSIONS fallback in role.service.getRolePermissions().
];

async function seedRolesForTenant(tenantConn, tenantName, { dryRun = false, slug = tenantName } = {}) {
  const Role = tenantConn.model('Role');
  let seeded = 0;
  let updated = 0;

  // Snapshot BEFORE any write so the change is reversible.
  backup[slug] = (await Role.find({}).lean()).map((r) => ({
    _id: String(r._id),
    slug: r.slug,
    name: r.name,
    group: r.group,
    isSystem: r.isSystem,
    isActive: r.isActive,
    permissions: r.permissions || [],
  }));

  for (const def of DEFAULT_ROLES) {
    const perms = ROLE_PERMISSIONS[def.slug] || [];
    const existing = await Role.findOne({ slug: def.slug }).lean();

    if (existing) {
      // ADDITIVE ONLY. $addToSet grants permissions that were added to the code
      // since this tenant was provisioned, without stripping any extra permissions
      // a clinic admin granted through Role Master. Never use $set here — that
      // silently revokes customisations.
      const missing = perms.filter((p) => !(existing.permissions || []).includes(p));
      if (missing.length === 0) continue;

      console.log(`     ${def.slug}: +${missing.length} → ${missing.join(', ')}`);
      if (!dryRun) {
        await Role.updateOne({ slug: def.slug }, { $addToSet: { permissions: { $each: perms } } });
      }
      updated++;
    } else {
      console.log(`     ${def.slug}: CREATE (${perms.length} permissions)`);
      if (!dryRun) {
        await Role.create({
          name: def.name,
          slug: def.slug,
          group: def.group,
          permissions: perms,
          isSystem: true,
          isActive: true,
          displayOrder: def.displayOrder,
        });
      }
      seeded++;
    }
  }

  const unchanged = DEFAULT_ROLES.length - seeded - updated;
  console.log(`  [${tenantName}] ${seeded} created, ${updated} updated, ${unchanged} already current${dryRun ? '  (DRY RUN — nothing written)' : ''}`);
  return seeded;
}

async function main() {
  const env = require('../src/config/env');

  // Connect to platform DB
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');

  // Find target clinics
  const query = SLUG ? { slug: SLUG } : { status: { $in: ['active', 'trialing'] } };
  const clinics = await Clinic.find(query).select('+dbUri slug name').lean();

  if (clinics.length === 0) {
    console.error(SLUG ? `Tenant "${SLUG}" not found` : 'No active tenants found');
    process.exit(1);
  }

  console.log(`Found ${clinics.length} tenant(s)${DRY_RUN ? '  —  DRY RUN, no writes will be made' : ''}\n`);

  const tenantModels = require('../src/models/tenant');
  let totalSeeded = 0;

  for (const clinic of clinics) {
    if (!clinic.dbUri) {
      console.log(`  [${clinic.name}] Skipped — no dbUri`);
      continue;
    }

    try {
      const tenantConn = await mongoose.createConnection(clinic.dbUri, { maxPoolSize: 2 }).asPromise();

      for (const [name, schema] of Object.entries(tenantModels)) {
        if (!tenantConn.models[name]) tenantConn.model(name, schema);
      }

      totalSeeded += await seedRolesForTenant(tenantConn, clinic.name, { dryRun: DRY_RUN, slug: clinic.slug });
      await tenantConn.close();
    } catch (err) {
      console.error(`  [${clinic.name}] Error: ${err.message}`);
    }
  }

  // Write the pre-change snapshot regardless of dry-run, so a preview also
  // leaves you with a restore point for the state you just inspected.
  const backupDir = path.resolve(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `roles-${stamp}${DRY_RUN ? '-dryrun' : ''}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nPre-change snapshot: ${backupFile}`);

  console.log(`Done. ${totalSeeded} role(s) created across ${clinics.length} tenant(s).${DRY_RUN ? '  (DRY RUN — nothing was written)' : ''}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
