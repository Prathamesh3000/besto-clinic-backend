'use strict';

const logger = require('../utils/logger');
const { ROLE_PERMISSIONS } = require('../config/permissions');

/**
 * Default roles seeded into every new tenant database.
 * Permissions are pulled from the static ROLE_PERMISSIONS map at seed time.
 */
const DEFAULT_ROLES = [
  { slug: 'admin',           name: 'Clinic Owner',    group: 'admin',      displayOrder: 1 },
  { slug: 'doctor',          name: 'Doctor',          group: 'clinical',   displayOrder: 2 },
  { slug: 'receptionist',    name: 'Receptionist',    group: 'front_desk', displayOrder: 3 },
  { slug: 'support_staff',   name: 'Support Staff',   group: 'front_desk', displayOrder: 4 },
  { slug: 'billing_officer', name: 'Billing Officer', group: 'finance',    displayOrder: 5 },
];

/**
 * Required collections that must exist in every tenant database.
 * Maps collection names to their corresponding model names.
 * This ensures all 7 SRS-required collections are created:
 *   users, patients, appointments, treatmentrecords (doctors), invoices (payments),
 *   integrationcredentials, synclogs
 */
const REQUIRED_COLLECTIONS = [
  'User',
  'Patient',
  'Appointment',
  'TreatmentRecord',
  'Invoice',
  'IntegrationCredential',
  'SyncLog',
];

/**
 * Seed default data into a freshly provisioned tenant database.
 *
 * Steps:
 *  1. Explicitly create all required collections (ensures they exist even if empty)
 *  2. Create indexes on all registered models
 *  3. Verify collection creation
 *
 * @param {import('mongoose').Connection} conn - tenant DB connection
 * @param {object} options - { clinicName, clinicSlug, planSlug }
 * @returns {object} - { seededCollections, indexesCreated, verifiedCollections }
 */
async function seedDefaultData(conn, options = {}) {
  const seeded = [];
  const indexesCreated = [];
  const modelNames = Object.keys(conn.models);

  logger.info('Seed [%s]: %d models registered, eagerly creating %d required collections',
    options.clinicSlug || '?', modelNames.length, REQUIRED_COLLECTIONS.length + 1);

  // Step 1: Create ONLY the collections a tenant must have from day one.
  //
  // This used to loop over all ~50 registered models, which cost every tenant
  // ~50 collections and ~310 indexes at provisioning time whether or not the
  // clinic ever used those features. On a shared MongoDB Atlas tier (500
  // collection limit) that caps the platform at ~9 tenants and eventually makes
  // provisioning fail outright.
  //
  // MongoDB creates a collection on first write, and Mongoose builds a model's
  // indexes on first use (autoIndex defaults to true), so everything else is
  // created on demand at no loss of correctness. Feature collections
  // (telemedicine, job portal, dental scans, inventory, …) now appear only for
  // clinics that actually use them.
  const eager = [...REQUIRED_COLLECTIONS, 'Role'];
  for (const modelName of eager) {
    if (!conn.models[modelName]) continue;
    try {
      const Model = conn.model(modelName);
      const collectionName = Model.collection.collectionName;
      // createCollection is idempotent — no-op if it already exists
      await conn.db.createCollection(collectionName);
      seeded.push(collectionName);
    } catch (err) {
      // Code 48 = NamespaceExists — collection already exists, which is fine
      if (err.code !== 48) {
        logger.warn('Seed [%s]: failed to create collection for %s — %s',
          options.clinicSlug || '?', modelName, err.message);
      } else {
        seeded.push(conn.model(modelName).collection.collectionName);
      }
    }
  }

  // Step 2: Build indexes for those same collections only. The rest are built
  // by Mongoose the first time each model is used.
  for (const modelName of eager) {
    if (!conn.models[modelName]) continue;
    try {
      await conn.model(modelName).createIndexes();
      indexesCreated.push(modelName);
    } catch (err) {
      logger.warn('Seed [%s]: failed to create indexes for %s — %s',
        options.clinicSlug || '?', modelName, err.message);
    }
  }

  // Step 3: Seed default roles (idempotent upsert)
  if (conn.models.Role) {
    const Role = conn.model('Role');
    let rolesSeeded = 0;
    for (const def of DEFAULT_ROLES) {
      try {
        await Role.updateOne(
          { slug: def.slug },
          {
            $setOnInsert: {
              name: def.name,
              slug: def.slug,
              group: def.group,
              permissions: ROLE_PERMISSIONS[def.slug] || [],
              isSystem: true,
              isActive: true,
              displayOrder: def.displayOrder,
            },
          },
          { upsert: true },
        );
        rolesSeeded++;
      } catch (err) {
        logger.warn('Seed [%s]: failed to seed role "%s" — %s',
          options.clinicSlug || '?', def.slug, err.message);
      }
    }
    logger.info('Seed [%s]: %d default roles seeded', options.clinicSlug || '?', rolesSeeded);
  }

  // Step 4: Verify all required collections exist
  const existingCollections = await conn.db.listCollections().toArray();
  const existingNames = existingCollections.map((c) => c.name);
  const missingModels = REQUIRED_COLLECTIONS.filter((name) => {
    if (!conn.models[name]) return false; // model not registered, skip check
    const collName = conn.model(name).collection.collectionName;
    return !existingNames.includes(collName);
  });

  if (missingModels.length > 0) {
    logger.warn('Seed [%s]: missing collections after seeding: %s',
      options.clinicSlug || '?', missingModels.join(', '));
  }

  logger.info('Seed [%s]: completed — %d collections created, %d indexes built',
    options.clinicSlug || '?', seeded.length, indexesCreated.length);

  return {
    seededCollections: seeded,
    indexesCreated,
    verifiedCollections: existingNames,
    missingModels,
  };
}

module.exports = { seedDefaultData };
