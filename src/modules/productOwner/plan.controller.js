'use strict';

/**
 * Plan Controller — handles plan CRUD and custom plan creation.
 */

const service = require('./productOwner.service');
const pricingService = require('../../services/pricing.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.listPlans = async (req, res) => {
  const { items, total, page, limit } = await service.listPlans(req.query);
  res.json(ApiResponse.paginated('Plans retrieved', items, { page, limit, total }));
};

exports.getPlan = async (req, res) => {
  const plan = await service.getPlanById(req.params.id);
  res.json(ApiResponse.success('Plan retrieved', plan));
};

exports.createPlan = async (req, res) => {
  const plan = await service.createPlan(req.body, req.user.userId);
  res.status(201).json(ApiResponse.created('Plan created', plan));
};

exports.updatePlan = async (req, res) => {
  const plan = await service.updatePlan(req.params.id, req.body);
  res.json(ApiResponse.success('Plan updated', plan));
};

exports.deletePlan = async (req, res) => {
  await service.deletePlan(req.params.id);
  res.json(ApiResponse.deleted('Plan deactivated'));
};

exports.createCustomPlan = async (req, res) => {
  const plan = await service.createCustomPlan(req.params.slug, req.body, req.user.userId);
  res.status(201).json(ApiResponse.created('Custom plan created', plan));
};

exports.calculatePrice = async (req, res) => {
  const result = await pricingService.calculatePrice(req.body);
  res.json(ApiResponse.success('Price calculated', result));
};

exports.calculateProration = async (req, res) => {
  const result = await pricingService.calculateProration(
    req.params.subscriptionId,
    req.body.newPlanId,
    req.body.newBillingCycle,
    {
      extraDoctors: req.body.extraDoctors,
      extraStorageUnits: req.body.extraStorageUnits,
      enabledFeatures: req.body.enabledFeatures,
      enabledModules: req.body.enabledModules,
    },
  );
  res.json(ApiResponse.success('Proration calculated', result));
};

exports.comparePlans = async (req, res) => {
  const result = await service.comparePlans(
    req.body.planIdA,
    req.body.planIdB,
    req.body.billingCycle,
    {
      extraDoctors: req.body.extraDoctors,
      extraStorageUnits: req.body.extraStorageUnits,
      enabledFeatures: req.body.enabledFeatures,
      enabledModules: req.body.enabledModules,
    },
  );
  res.json(ApiResponse.success('Plan comparison generated', result));
};
