'use strict';

const RioViewAdapter = require('./rioView.adapter');
const RomexisAdapter = require('./romexis.adapter');

const ADAPTER_MAP = {
  rioview: RioViewAdapter,
  romexis: RomexisAdapter,
};

/**
 * Get the adapter class for a given integration type.
 * @param {string} integrationType - 'rioview' or 'romexis'
 * @returns {typeof RioViewAdapter | typeof RomexisAdapter}
 */
function getAdapter(integrationType) {
  const Adapter = ADAPTER_MAP[integrationType];
  if (!Adapter) throw new Error(`Unknown integration type: ${integrationType}`);
  return Adapter;
}

module.exports = { getAdapter, RioViewAdapter, RomexisAdapter };
