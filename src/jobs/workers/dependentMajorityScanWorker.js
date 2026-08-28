'use strict';

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { NOTIFICATION_TYPE } = require('../../config/constants');
const { calculateAge, MINIMUM_SELF_REGISTRATION_AGE } = require('../../utils/age');

/**
 * Tell guardians when a dependent reaches 18.
 *
 * Detaching is guardian-initiated and nothing used to prompt it, so an adult
 * could stay under a guardian's full medical access indefinitely — they have no
 * login of their own to ask for it. This scan closes that loop; it only
 * notifies, it never detaches, because detaching needs an email and password
 * only the pair of them can choose.
 *
 * `guardianMajorityNotifiedAt` on the Patient stops the guardian being told
 * again on every run.
 */
function createDependentMajorityScanWorker() {
  const worker = new Worker(
    'dependentMajorityScan',
    async (job) => {
      logger.info('DependentMajority scan: starting (job %s)', job.id);

      const Clinic = mongoose.model('Clinic');
      const clinics = await Clinic.find({ status: 'active' }).select('slug').lean();

      let totalNotified = 0;

      for (const clinic of clinics) {
        try {
          const conn = await getTenantConnection(clinic.slug);
          const Patient = conn.model('Patient');

          // Candidates: still attached to a guardian, have a date of birth, and
          // have not been flagged yet. Age is computed in JS so the calendar
          // rules match detachDependent exactly.
          const candidates = await Patient.find({
            guardian: { $ne: null },
            dateOfBirth: { $ne: null },
            guardianMajorityNotifiedAt: null,
            deletedAt: null,
          }).select('_id name guardian dateOfBirth').lean();

          for (const dep of candidates) {
            if (calculateAge(dep.dateOfBirth) < MINIMUM_SELF_REGISTRATION_AGE) continue;

            try {
              await notifyAndEmit({
                recipient: dep.guardian,
                title: `${dep.name} is now ${MINIMUM_SELF_REGISTRATION_AGE}`,
                message:
                  `${dep.name} has reached ${MINIMUM_SELF_REGISTRATION_AGE} and can now have their own account. `
                  + 'Detach them to transfer their records, or they will stay under your profile.',
                type: NOTIFICATION_TYPE.SYSTEM,
                metadata: { dependentId: String(dep._id), action: 'detach_dependent' },
              }, clinic.slug);

              // Only flag once the guardian has actually been told, so a failed
              // notification is retried on the next run instead of being lost.
              await Patient.updateOne(
                { _id: dep._id },
                { $set: { guardianMajorityNotifiedAt: new Date() } },
              );
              totalNotified++;
            } catch (notifyErr) {
              logger.warn(
                'DependentMajority scan: notify failed for dependent %s in %s — %s',
                dep._id, clinic.slug, notifyErr.message,
              );
            }
          }
        } catch (err) {
          logger.error(
            'DependentMajority scan: error processing clinic %s — %s',
            clinic.slug, err.message,
          );
        }
      }

      logger.info(
        'DependentMajority scan: complete — %d clinics, %d guardians notified',
        clinics.length, totalNotified,
      );
      return { clinicsScanned: clinics.length, guardiansNotified: totalNotified };
    },
    { connection: getRedis(), concurrency: 1, drainDelay: 30_000 },
  );

  worker.on('failed', (job, err) => {
    logger.error('DependentMajority scan: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

module.exports = createDependentMajorityScanWorker;
