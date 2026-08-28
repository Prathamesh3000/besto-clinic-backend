'use strict';

/**
 * Seed script — populates inventory items & procedure templates for a tenant.
 *
 * Usage:
 *   node scripts/seed-inventory.js <tenant-slug>
 *   e.g.  node scripts/seed-inventory.js jathar-clinic
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

const SLUG = process.argv[2];
if (!SLUG) {
  console.error('Usage: node scripts/seed-inventory.js <tenant-slug>');
  process.exit(1);
}

async function seed() {
  const env = require('../src/config/env');

  // ── 1. Connect to platform DB & find tenant ───────────────
  await mongoose.connect(env.PLATFORM_DB_URI);
  require('../src/models/platform/Clinic');
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: SLUG }).select('+dbUri').lean();
  if (!clinic || !clinic.dbUri) {
    console.error(`❌ Tenant "${SLUG}" not found`);
    process.exit(1);
  }
  console.log(`✅ Found tenant: ${clinic.name} (${SLUG})`);

  // ── 2. Connect to tenant DB & register models ─────────────
  const tenantConn = await mongoose.createConnection(clinic.dbUri, {
    maxPoolSize: 2,
  }).asPromise();

  const tenantModels = require('../src/models/tenant');
  for (const [name, schema] of Object.entries(tenantModels)) {
    if (!tenantConn.models[name]) tenantConn.model(name, schema);
  }
  console.log(`✅ Connected to tenant DB — ${Object.keys(tenantConn.models).length} models`);

  const InventoryItem = tenantConn.model('InventoryItem');
  const InventoryTransaction = tenantConn.model('InventoryTransaction');
  const ProcedureTemplate = tenantConn.model('ProcedureTemplate');
  const Branch = tenantConn.model('Branch');
  const User = tenantConn.model('User');

  // ── 3. Resolve branch & admin user ─────────────────────────
  const branch = await Branch.findOne({ deletedAt: null }).lean();
  if (!branch) {
    console.error('❌ No branch found — create at least one branch first');
    await tenantConn.close();
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Using branch: ${branch.name} (${branch._id})`);

  const adminUser = await User.findOne({
    role: { $in: ['super_admin', 'admin'] },
    deletedAt: null,
  }).lean();
  if (!adminUser) {
    console.error('❌ No admin user found');
    await tenantConn.close();
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Using admin: ${adminUser.name} (${adminUser.role})`);

  // ── 4. Clear existing seed data (by code prefix SEED-) ────
  await InventoryItem.deleteMany({ code: /^SEED-/ });
  await ProcedureTemplate.deleteMany({ code: /^PROC-/ });
  console.log('🧹 Cleared previous seed data');

  // ── 5. Seed Inventory Items ────────────────────────────────
  const now = new Date();
  const days = (n) => new Date(now.getTime() + n * 86400000);

  const ITEMS = [
    // ─── Consumables ───
    { name: 'Dental Composite Resin (A2)', code: 'SEED-DC-001', category: 'consumables', unit: 'syringe', currentStock: 45, minimumThreshold: 10, costPerUnit: 850, expiryDate: days(180), supplier: { name: 'DentalMax Supplies', contactPhone: '+91 98765 43210', contactEmail: 'orders@dentalmax.in', leadTimeDays: 5 } },
    { name: 'Alginate Impression Material', code: 'SEED-DC-002', category: 'consumables', unit: 'pack', currentStock: 30, minimumThreshold: 8, costPerUnit: 420, expiryDate: days(120), supplier: { name: 'DentalMax Supplies', contactPhone: '+91 98765 43210', contactEmail: 'orders@dentalmax.in', leadTimeDays: 5 } },
    { name: 'Disposable Gloves (Latex)', code: 'SEED-DC-003', category: 'consumables', unit: 'box', currentStock: 120, minimumThreshold: 20, costPerUnit: 350, expiryDate: days(365) },
    { name: 'Dental Cement (Glass Ionomer)', code: 'SEED-DC-004', category: 'consumables', unit: 'kit', currentStock: 18, minimumThreshold: 5, costPerUnit: 1200, expiryDate: days(240), supplier: { name: 'GC India', contactPhone: '+91 22 2812 5678', contactEmail: 'sales@gcindia.com', leadTimeDays: 7 } },
    { name: 'Suture Kit (Silk 3-0)', code: 'SEED-DC-005', category: 'consumables', unit: 'pack', currentStock: 25, minimumThreshold: 8, costPerUnit: 180, expiryDate: days(300) },
    { name: 'Temporary Filling Material', code: 'SEED-DC-006', category: 'consumables', unit: 'tube', currentStock: 15, minimumThreshold: 5, costPerUnit: 320, expiryDate: days(200) },
    { name: 'Dental Anesthetic (Lidocaine 2%)', code: 'SEED-DC-007', category: 'consumables', unit: 'cartridge', currentStock: 80, minimumThreshold: 20, costPerUnit: 45, expiryDate: days(150) },
    { name: 'Cotton Rolls (Non-sterile)', code: 'SEED-DC-008', category: 'consumables', unit: 'pack', currentStock: 200, minimumThreshold: 30, costPerUnit: 90, expiryDate: days(400) },

    // ─── Instruments ───
    { name: 'Dental Mirror (Rhodium)', code: 'SEED-IN-001', category: 'instruments', unit: 'piece', currentStock: 20, minimumThreshold: 5, costPerUnit: 280 },
    { name: 'Explorer Probe', code: 'SEED-IN-002', category: 'instruments', unit: 'piece', currentStock: 15, minimumThreshold: 5, costPerUnit: 250 },
    { name: 'Extraction Forceps (Upper Premolar)', code: 'SEED-IN-003', category: 'instruments', unit: 'piece', currentStock: 6, minimumThreshold: 2, costPerUnit: 3200 },
    { name: 'Extraction Forceps (Lower Molar)', code: 'SEED-IN-004', category: 'instruments', unit: 'piece', currentStock: 5, minimumThreshold: 2, costPerUnit: 3500 },
    { name: 'Elevators Set (3-Piece)', code: 'SEED-IN-005', category: 'instruments', unit: 'set', currentStock: 4, minimumThreshold: 2, costPerUnit: 4500 },
    { name: 'Scalpel Handle #3', code: 'SEED-IN-006', category: 'instruments', unit: 'piece', currentStock: 8, minimumThreshold: 3, costPerUnit: 450 },
    { name: 'Surgical Curette', code: 'SEED-IN-007', category: 'instruments', unit: 'piece', currentStock: 10, minimumThreshold: 3, costPerUnit: 800 },

    // ─── Braces & Orthodontic ───
    { name: 'Metal Brackets (Roth 022)', code: 'SEED-BR-001', category: 'braces', unit: 'set', currentStock: 12, minimumThreshold: 4, costPerUnit: 4500, supplier: { name: 'OrthoKing India', contactPhone: '+91 88001 12233', contactEmail: 'info@orthoking.in', leadTimeDays: 10 } },
    { name: 'Ceramic Brackets (Clear)', code: 'SEED-BR-002', category: 'braces', unit: 'set', currentStock: 8, minimumThreshold: 3, costPerUnit: 8500, supplier: { name: 'OrthoKing India', contactPhone: '+91 88001 12233', contactEmail: 'info@orthoking.in', leadTimeDays: 10 } },
    { name: 'Orthodontic Archwires (NiTi)', code: 'SEED-BR-003', category: 'orthodontic', unit: 'pack', currentStock: 20, minimumThreshold: 6, costPerUnit: 650 },
    { name: 'Orthodontic Elastics (Mixed)', code: 'SEED-BR-004', category: 'orthodontic', unit: 'pack', currentStock: 50, minimumThreshold: 10, costPerUnit: 120, expiryDate: days(365) },
    { name: 'Self-Ligating Brackets (Damon)', code: 'SEED-BR-005', category: 'braces', unit: 'set', currentStock: 5, minimumThreshold: 2, costPerUnit: 15000, supplier: { name: 'OrthoKing India', contactPhone: '+91 88001 12233', contactEmail: 'info@orthoking.in', leadTimeDays: 14 } },

    // ─── Implants ───
    { name: 'Dental Implant (Titanium, 4x10mm)', code: 'SEED-IM-001', category: 'implants', unit: 'piece', currentStock: 10, minimumThreshold: 3, costPerUnit: 12000, supplier: { name: 'Nobel Biocare India', contactPhone: '+91 80 4900 5600', contactEmail: 'orders@nobelbiocare.in', leadTimeDays: 14 } },
    { name: 'Dental Implant (Titanium, 5x12mm)', code: 'SEED-IM-002', category: 'implants', unit: 'piece', currentStock: 8, minimumThreshold: 3, costPerUnit: 14000, supplier: { name: 'Nobel Biocare India', contactPhone: '+91 80 4900 5600', contactEmail: 'orders@nobelbiocare.in', leadTimeDays: 14 } },
    { name: 'Implant Abutment (Standard)', code: 'SEED-IM-003', category: 'implants', unit: 'piece', currentStock: 12, minimumThreshold: 4, costPerUnit: 5500 },
    { name: 'Healing Cap (Cover Screw)', code: 'SEED-IM-004', category: 'implants', unit: 'piece', currentStock: 15, minimumThreshold: 5, costPerUnit: 1800 },

    // ─── Prosthetics ───
    { name: 'PFM Crown (Porcelain Fused Metal)', code: 'SEED-PR-001', category: 'prosthetics', unit: 'piece', currentStock: 10, minimumThreshold: 4, costPerUnit: 3500, supplier: { name: 'DentLab Pro', contactPhone: '+91 22 2654 7890', contactEmail: 'orders@dentlabpro.in', leadTimeDays: 7 } },
    { name: 'Zirconia Crown (Full)', code: 'SEED-PR-002', category: 'prosthetics', unit: 'piece', currentStock: 8, minimumThreshold: 3, costPerUnit: 7500, supplier: { name: 'DentLab Pro', contactPhone: '+91 22 2654 7890', contactEmail: 'orders@dentlabpro.in', leadTimeDays: 7 } },
    { name: 'Complete Denture Set', code: 'SEED-PR-003', category: 'prosthetics', unit: 'set', currentStock: 5, minimumThreshold: 2, costPerUnit: 8000 },
    { name: 'Acrylic Teeth Set (Anterior)', code: 'SEED-PR-004', category: 'prosthetics', unit: 'set', currentStock: 12, minimumThreshold: 4, costPerUnit: 1500 },

    // ─── Surgical Kits ───
    { name: 'Implant Surgery Kit (Basic)', code: 'SEED-SK-001', category: 'surgical_kits', unit: 'kit', currentStock: 3, minimumThreshold: 1, costPerUnit: 45000, supplier: { name: 'Nobel Biocare India', contactPhone: '+91 80 4900 5600', contactEmail: 'orders@nobelbiocare.in', leadTimeDays: 21 } },
    { name: 'Oral Surgery Kit (General)', code: 'SEED-SK-002', category: 'surgical_kits', unit: 'kit', currentStock: 4, minimumThreshold: 2, costPerUnit: 28000 },
    { name: 'Bone Graft Material (Bio-Oss)', code: 'SEED-SK-003', category: 'surgical_kits', unit: 'vial', currentStock: 6, minimumThreshold: 2, costPerUnit: 9500, expiryDate: days(270) },

    // ─── Endodontic ───
    { name: 'Rotary Endo Files (ProTaper)', code: 'SEED-EN-001', category: 'endodontic', unit: 'set', currentStock: 15, minimumThreshold: 5, costPerUnit: 3800 },
    { name: 'Gutta Percha Points (Assorted)', code: 'SEED-EN-002', category: 'endodontic', unit: 'pack', currentStock: 20, minimumThreshold: 5, costPerUnit: 650, expiryDate: days(365) },
    { name: 'Root Canal Sealer (AH Plus)', code: 'SEED-EN-003', category: 'endodontic', unit: 'tube', currentStock: 8, minimumThreshold: 3, costPerUnit: 2200, expiryDate: days(300) },
    { name: 'EDTA Solution (17%)', code: 'SEED-EN-004', category: 'endodontic', unit: 'bottle', currentStock: 10, minimumThreshold: 3, costPerUnit: 480, expiryDate: days(180) },
    { name: 'Sodium Hypochlorite (5.25%)', code: 'SEED-EN-005', category: 'endodontic', unit: 'bottle', currentStock: 12, minimumThreshold: 4, costPerUnit: 250, expiryDate: days(120) },

    // ─── Sterilization ───
    { name: 'Sterilization Pouches (Medium)', code: 'SEED-ST-001', category: 'sterilization', unit: 'roll', currentStock: 25, minimumThreshold: 8, costPerUnit: 750 },
    { name: 'Autoclave Indicator Tape', code: 'SEED-ST-002', category: 'sterilization', unit: 'roll', currentStock: 15, minimumThreshold: 5, costPerUnit: 320 },
    { name: 'Biological Indicator (Spore Test)', code: 'SEED-ST-003', category: 'sterilization', unit: 'pack', currentStock: 10, minimumThreshold: 3, costPerUnit: 1200, expiryDate: days(240) },

    // ─── Imaging ───
    { name: 'X-Ray Film (Periapical)', code: 'SEED-IG-001', category: 'imaging', unit: 'box', currentStock: 8, minimumThreshold: 3, costPerUnit: 2800, expiryDate: days(365) },
    { name: 'Phosphor Plate (Size 2)', code: 'SEED-IG-002', category: 'imaging', unit: 'piece', currentStock: 6, minimumThreshold: 2, costPerUnit: 4500 },

    // ─── Low Stock Items (for testing Low Stock tab) ───
    { name: 'Dental Floss (Waxed)', code: 'SEED-LOW-001', category: 'consumables', unit: 'spool', currentStock: 3, minimumThreshold: 10, costPerUnit: 80 },
    { name: 'Polishing Discs (Fine)', code: 'SEED-LOW-002', category: 'instruments', unit: 'pack', currentStock: 1, minimumThreshold: 5, costPerUnit: 950 },

    // ─── Expiring Soon Items (for testing Expiring tab) ───
    { name: 'Hydrogen Peroxide Gel (35%)', code: 'SEED-EXP-001', category: 'consumables', unit: 'syringe', currentStock: 10, minimumThreshold: 3, costPerUnit: 1600, expiryDate: days(15) },
    { name: 'Bonding Agent (Light Cure)', code: 'SEED-EXP-002', category: 'consumables', unit: 'bottle', currentStock: 5, minimumThreshold: 2, costPerUnit: 2100, expiryDate: days(20) },
  ];

  const createdItems = [];
  for (const itemData of ITEMS) {
    const item = await InventoryItem.create({
      ...itemData,
      currency: 'INR',
      branch: branch._id,
      createdBy: adminUser._id,
      lastRestockedAt: now,
      lastRestockedBy: adminUser._id,
    });

    // Create initial stock_in transaction (bypass the immutable block by using insertOne)
    await tenantConn.db.collection('inventorytransactions').insertOne({
      item: item._id,
      type: 'stock_in',
      quantity: item.currentStock,
      previousStock: 0,
      newStock: item.currentStock,
      previousReserved: 0,
      newReserved: 0,
      reason: 'Initial seed stock',
      branch: branch._id,
      performedBy: adminUser._id,
      createdAt: now,
    });

    createdItems.push(item);
  }
  console.log(`✅ Seeded ${createdItems.length} inventory items`);

  // ── 6. Seed Procedure Templates ────────────────────────────
  // Helper to find seeded items by code
  const findItem = (code) => {
    const item = createdItems.find((i) => i.code === code);
    if (!item) throw new Error(`Seed item ${code} not found`);
    return { item: item._id, itemName: item.name, quantity: 1, isOptional: false };
  };
  const mat = (code, qty, optional = false) => ({
    ...findItem(code),
    quantity: qty,
    isOptional: optional,
  });

  const PROCEDURES = [
    {
      name: 'Dental Implant Placement (Single)',
      code: 'PROC-IMP-001',
      category: 'surgery',
      description: 'Single unit titanium implant placement with guided surgery protocol. Includes local anesthesia, flap elevation, osteotomy, implant insertion, and suturing.',
      estimatedDuration: 90,
      estimatedCost: 35000,
      requiredMaterials: [
        mat('SEED-IM-001', 1),                    // Implant
        mat('SEED-IM-004', 1),                     // Healing cap
        mat('SEED-SK-001', 1),                     // Surgery kit (reusable)
        mat('SEED-DC-007', 3),                     // Anesthetic cartridges
        mat('SEED-DC-005', 1),                     // Suture kit
        mat('SEED-DC-003', 2),                     // Gloves
        mat('SEED-SK-003', 1, true),               // Bone graft (optional)
      ],
    },
    {
      name: 'Dental Implant with Crown',
      code: 'PROC-IMP-002',
      category: 'prosthetic',
      description: 'Complete implant restoration — implant placement + abutment + zirconia crown. Two-stage procedure.',
      estimatedDuration: 120,
      estimatedCost: 55000,
      requiredMaterials: [
        mat('SEED-IM-002', 1),                     // Implant (larger)
        mat('SEED-IM-003', 1),                     // Abutment
        mat('SEED-IM-004', 1),                     // Healing cap
        mat('SEED-PR-002', 1),                     // Zirconia crown
        mat('SEED-SK-001', 1),                     // Surgery kit
        mat('SEED-DC-007', 3),                     // Anesthetic
        mat('SEED-DC-005', 1),                     // Sutures
        mat('SEED-DC-003', 2),                     // Gloves
      ],
    },
    {
      name: 'Metal Braces Installation (Full)',
      code: 'PROC-ORT-001',
      category: 'orthodontic',
      description: 'Full-mouth metal braces installation including brackets, archwires, and initial adjustment.',
      estimatedDuration: 75,
      estimatedCost: 28000,
      requiredMaterials: [
        mat('SEED-BR-001', 1),                     // Metal brackets
        mat('SEED-BR-003', 2),                     // Archwires
        mat('SEED-BR-004', 1),                     // Elastics
        mat('SEED-DC-004', 1),                     // Dental cement
        mat('SEED-DC-003', 1),                     // Gloves
      ],
    },
    {
      name: 'Ceramic Braces Installation (Full)',
      code: 'PROC-ORT-002',
      category: 'orthodontic',
      description: 'Full-mouth ceramic (clear) braces installation for aesthetic orthodontic treatment.',
      estimatedDuration: 90,
      estimatedCost: 45000,
      requiredMaterials: [
        mat('SEED-BR-002', 1),                     // Ceramic brackets
        mat('SEED-BR-003', 2),                     // Archwires
        mat('SEED-BR-004', 1),                     // Elastics
        mat('SEED-DC-004', 1),                     // Dental cement
        mat('SEED-DC-003', 1),                     // Gloves
      ],
    },
    {
      name: 'Root Canal Treatment (Single Canal)',
      code: 'PROC-END-001',
      category: 'endodontic',
      description: 'Complete root canal therapy for single-canal tooth. Includes access, shaping, cleaning, obturation, and temporary restoration.',
      estimatedDuration: 60,
      estimatedCost: 8000,
      requiredMaterials: [
        mat('SEED-EN-001', 1),                     // Rotary files
        mat('SEED-EN-002', 1),                     // Gutta percha
        mat('SEED-EN-003', 1),                     // Sealer
        mat('SEED-EN-004', 1),                     // EDTA
        mat('SEED-EN-005', 1),                     // NaOCl
        mat('SEED-DC-007', 2),                     // Anesthetic
        mat('SEED-DC-006', 1),                     // Temporary filling
        mat('SEED-DC-003', 1),                     // Gloves
        mat('SEED-IG-001', 1, true),               // X-ray film (optional)
      ],
    },
    {
      name: 'Root Canal Treatment (Multi-Canal)',
      code: 'PROC-END-002',
      category: 'endodontic',
      description: 'Root canal therapy for multi-canal molar. Extended procedure with multiple canal preparation and obturation.',
      estimatedDuration: 90,
      estimatedCost: 12000,
      requiredMaterials: [
        mat('SEED-EN-001', 2),                     // Rotary files (more)
        mat('SEED-EN-002', 2),                     // Gutta percha (more)
        mat('SEED-EN-003', 1),                     // Sealer
        mat('SEED-EN-004', 1),                     // EDTA
        mat('SEED-EN-005', 1),                     // NaOCl
        mat('SEED-DC-007', 3),                     // Anesthetic
        mat('SEED-DC-006', 1),                     // Temporary filling
        mat('SEED-DC-003', 2),                     // Gloves
        mat('SEED-IG-001', 1),                     // X-ray film
      ],
    },
    {
      name: 'PFM Crown Placement',
      code: 'PROC-PRO-001',
      category: 'prosthetic',
      description: 'Porcelain-fused-to-metal crown cementation including tooth preparation, impression, and final placement.',
      estimatedDuration: 45,
      estimatedCost: 8000,
      requiredMaterials: [
        mat('SEED-PR-001', 1),                     // PFM Crown
        mat('SEED-DC-004', 1),                     // Dental cement
        mat('SEED-DC-002', 1),                     // Alginate impression
        mat('SEED-DC-007', 2),                     // Anesthetic
        mat('SEED-DC-003', 1),                     // Gloves
      ],
    },
    {
      name: 'Zirconia Crown Placement',
      code: 'PROC-PRO-002',
      category: 'prosthetic',
      description: 'Full zirconia crown — premium aesthetic restoration with superior strength and natural appearance.',
      estimatedDuration: 45,
      estimatedCost: 15000,
      requiredMaterials: [
        mat('SEED-PR-002', 1),                     // Zirconia crown
        mat('SEED-DC-004', 1),                     // Dental cement
        mat('SEED-DC-002', 1),                     // Impression material
        mat('SEED-DC-007', 2),                     // Anesthetic
        mat('SEED-DC-003', 1),                     // Gloves
      ],
    },
    {
      name: 'Composite Filling (Direct)',
      code: 'PROC-COS-001',
      category: 'cosmetic',
      description: 'Direct composite resin restoration for anterior or posterior teeth.',
      estimatedDuration: 30,
      estimatedCost: 3000,
      requiredMaterials: [
        mat('SEED-DC-001', 1),                     // Composite resin
        mat('SEED-EXP-002', 1),                    // Bonding agent
        mat('SEED-DC-007', 1),                     // Anesthetic
        mat('SEED-DC-003', 1),                     // Gloves
        mat('SEED-DC-008', 1),                     // Cotton rolls
      ],
    },
    {
      name: 'Tooth Extraction (Simple)',
      code: 'PROC-SUR-001',
      category: 'surgery',
      description: 'Simple tooth extraction under local anesthesia. Includes post-operative instructions.',
      estimatedDuration: 20,
      estimatedCost: 2000,
      requiredMaterials: [
        mat('SEED-IN-003', 1),                     // Upper forceps
        mat('SEED-IN-005', 1),                     // Elevators
        mat('SEED-DC-007', 2),                     // Anesthetic
        mat('SEED-DC-003', 1),                     // Gloves
        mat('SEED-DC-008', 1),                     // Cotton rolls
      ],
    },
    {
      name: 'Surgical Extraction (Impacted)',
      code: 'PROC-SUR-002',
      category: 'surgery',
      description: 'Surgical extraction of impacted or broken-down tooth with flap raising and bone removal if needed.',
      estimatedDuration: 60,
      estimatedCost: 6000,
      requiredMaterials: [
        mat('SEED-IN-004', 1),                     // Lower forceps
        mat('SEED-IN-005', 1),                     // Elevators
        mat('SEED-IN-006', 1),                     // Scalpel handle
        mat('SEED-IN-007', 1),                     // Curette
        mat('SEED-SK-002', 1),                     // Oral surgery kit
        mat('SEED-DC-005', 1),                     // Sutures
        mat('SEED-DC-007', 3),                     // Anesthetic
        mat('SEED-DC-003', 2),                     // Gloves
      ],
    },
    {
      name: 'Complete Denture Fabrication',
      code: 'PROC-PRO-003',
      category: 'prosthetic',
      description: 'Full upper and lower complete denture fabrication — from impressions through final delivery.',
      estimatedDuration: 60,
      estimatedCost: 20000,
      requiredMaterials: [
        mat('SEED-PR-003', 1),                     // Complete denture set
        mat('SEED-PR-004', 1),                     // Acrylic teeth
        mat('SEED-DC-002', 2),                     // Alginate (multiple impressions)
        mat('SEED-DC-003', 2),                     // Gloves
      ],
    },
    {
      name: 'Teeth Whitening (In-Office)',
      code: 'PROC-COS-002',
      category: 'cosmetic',
      description: 'Professional in-office teeth whitening with hydrogen peroxide gel and LED activation.',
      estimatedDuration: 60,
      estimatedCost: 12000,
      requiredMaterials: [
        mat('SEED-EXP-001', 2),                    // Hydrogen peroxide gel
        mat('SEED-DC-003', 1),                     // Gloves
        mat('SEED-DC-008', 1),                     // Cotton rolls
      ],
    },
    {
      name: 'Scaling & Root Planing',
      code: 'PROC-PER-001',
      category: 'periodontal',
      description: 'Deep cleaning procedure for treatment of periodontitis including ultrasonic scaling and manual root planing.',
      estimatedDuration: 45,
      estimatedCost: 4000,
      requiredMaterials: [
        mat('SEED-IN-007', 1),                     // Curette
        mat('SEED-DC-007', 2),                     // Anesthetic
        mat('SEED-DC-003', 1),                     // Gloves
        mat('SEED-DC-008', 2),                     // Cotton rolls
        mat('SEED-EN-005', 1, true),               // NaOCl irrigation (optional)
      ],
    },
  ];

  const createdProcedures = [];
  for (const procData of PROCEDURES) {
    const proc = await ProcedureTemplate.create({
      ...procData,
      createdBy: adminUser._id,
    });
    createdProcedures.push(proc);
  }
  console.log(`✅ Seeded ${createdProcedures.length} procedure templates`);

  // ── 7. Link ConsultationTemplates → ProcedureTemplates ─────
  // If consultation templates already exist, link them to the matching procedures
  const CONSULT_TO_PROC = {
    RCT:     'PROC-END-001',
    SEXT:    'PROC-SUR-001',
    SUREXT:  'PROC-SUR-002',
    CFILL:   'PROC-COS-001',
    SCALE:   'PROC-PER-001',
    CRPREP:  'PROC-PRO-001',
    ORTHCON: 'PROC-ORT-001',
    IMPCON:  'PROC-IMP-001',
    WHITE:   'PROC-COS-002',
  };

  const ConsultationTemplate = tenantConn.model('ConsultationTemplate');
  const procByCode = {};
  for (const p of createdProcedures) {
    procByCode[p.code] = p._id;
  }

  let linkedCount = 0;
  for (const [consultCode, procCode] of Object.entries(CONSULT_TO_PROC)) {
    const procId = procByCode[procCode];
    if (!procId) continue;
    const result = await ConsultationTemplate.findOneAndUpdate(
      { code: consultCode, deletedAt: null },
      { procedureTemplate: procId },
    );
    if (result) linkedCount++;
  }
  if (linkedCount > 0) {
    console.log(`✅ Linked ${linkedCount} consultation templates → procedure templates`);
  } else {
    console.log(`ℹ️  No consultation templates found to link (run seed-consultation-templates.js first)`);
  }

  // ── 8. Summary ─────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log(`  Inventory Items:      ${createdItems.length}`);
  console.log(`  Procedure Templates:  ${createdProcedures.length}`);
  console.log(`  Linked Templates:     ${linkedCount}`);
  console.log(`  Branch:               ${branch.name}`);
  console.log(`  Admin:                ${adminUser.name}`);
  console.log(`  Low Stock Items:      2 (SEED-LOW-001, SEED-LOW-002)`);
  console.log(`  Expiring Soon Items:  2 (SEED-EXP-001, SEED-EXP-002)`);
  console.log('══════════════════════════════════════════════\n');
  console.log('🎉 Seed complete! Refresh your inventory page to see the data.');

  await tenantConn.close();
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message || err);
  process.exit(1);
});
