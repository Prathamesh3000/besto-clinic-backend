'use strict';

const creditService = require('../../services/credit.service');
const Clinic = require('../../models/platform/Clinic');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { CREDIT_PACKS } = require('../../config/constants');

exports.getBalance = async (req, res) => {
  const clinic = await Clinic.findOne({ slug: req.tenantSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const balance = await creditService.getBalance(clinic._id);
  res.json(ApiResponse.success('Credit balance retrieved', balance));
};

exports.getTransactions = async (req, res) => {
  const clinic = await Clinic.findOne({ slug: req.tenantSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const { items, total, page, limit } = await creditService.getTransactionHistory(clinic._id, req.query);
  res.json(ApiResponse.paginated('Transactions retrieved', items, { page, limit, total }));
};

exports.getPacks = async (_req, res) => {
  res.json(ApiResponse.success('Credit packs retrieved', CREDIT_PACKS));
};

exports.purchaseCredits = async (req, res) => {
  const clinic = await Clinic.findOne({ slug: req.tenantSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const pack = creditService.getCreditPack(req.body.packId);

  // Create Razorpay order for the pack
  const Razorpay = require('razorpay');
  const env = require('../../config/env');
  const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  const order = await razorpay.orders.create({
    amount: pack.price * 100, // Razorpay uses paise
    currency: pack.currency,
    receipt: `credit_${clinic.slug}_${pack.id}_${Date.now()}`,
    notes: {
      clinicId: clinic._id.toString(),
      clinicSlug: clinic.slug,
      packId: pack.id,
      credits: pack.credits,
    },
  });

  res.status(201).json(ApiResponse.created('Credit purchase order created', {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    pack,
  }));
};

exports.verifyPurchase = async (req, res) => {
  const clinic = await Clinic.findOne({ slug: req.tenantSlug });
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const { packId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

  // Verify Razorpay signature
  const crypto = require('crypto');
  const env = require('../../config/env');
  const expectedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    throw ApiError.badRequest('Invalid payment signature');
  }

  const transaction = await creditService.purchaseCredits(
    clinic._id,
    packId,
    razorpayPaymentId,
    razorpayOrderId,
  );

  res.json(ApiResponse.success('Credits purchased successfully', transaction));
};
