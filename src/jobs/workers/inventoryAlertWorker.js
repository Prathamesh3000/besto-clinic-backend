'use strict';

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');

function createInventoryAlertWorker() {
  const worker = new Worker(
    'inventoryAlert',
    async () => {
      return _handleCheckAlerts();
    },
    { connection: getRedis(), concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error('InventoryAlert worker: job %s failed — %s', job?.id, err.message);
  });

  return worker;
}

async function _handleCheckAlerts() {
  logger.info('InventoryAlert: starting alert scan');

  const Clinic = mongoose.model('Clinic');
  const clinics = await Clinic.find({ status: 'active' }).select('slug').lean();
  let totalAlerts = 0;

  for (const clinic of clinics) {
    try {
      const conn = await getTenantConnection(clinic.slug);
      const InventoryItem = conn.model('InventoryItem');
      const User = conn.model('User');

      // Find low-stock items
      const lowStockItems = await InventoryItem.find({
        isActive: true,
        deletedAt: null,
        $expr: { $lte: ['$currentStock', '$minimumThreshold'] },
      }).select('name code category branch currentStock minimumThreshold').lean();

      // Find expiring items (within 30 days)
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const expiringItems = await InventoryItem.find({
        isActive: true,
        deletedAt: null,
        expiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() },
      }).select('name code expiryDate branch').lean();

      if (lowStockItems.length === 0 && expiringItems.length === 0) continue;

      // Notify admins and managers
      const admins = await User.find({
        role: { $in: ['super_admin', 'admin', 'manager'] },
        deletedAt: null,
      }).select('_id').lean();

      for (const admin of admins) {
        if (lowStockItems.length > 0) {
          await notifyAndEmit({
            recipient: admin._id,
            title: 'Low Stock Alert',
            message: `${lowStockItems.length} item(s) are below minimum threshold.`,
            type: 'alert',
            metadata: { type: 'low_stock', count: lowStockItems.length },
          }, clinic.slug);
          totalAlerts += 1;
        }

        if (expiringItems.length > 0) {
          await notifyAndEmit({
            recipient: admin._id,
            title: 'Expiry Alert',
            message: `${expiringItems.length} item(s) are expiring within 30 days.`,
            type: 'alert',
            metadata: { type: 'expiring', count: expiringItems.length },
          }, clinic.slug);
          totalAlerts += 1;
        }
      }
    } catch (err) {
      logger.error('InventoryAlert: error processing clinic %s — %s', clinic.slug, err.message);
    }
  }

  logger.info('InventoryAlert: scan complete — %d clinics, %d alerts sent', clinics.length, totalAlerts);
  return { clinicsScanned: clinics.length, alertsSent: totalAlerts };
}

module.exports = createInventoryAlertWorker;
