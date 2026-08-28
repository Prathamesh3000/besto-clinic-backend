'use strict';

/**
 * Extend soft-delete filtering to the query methods Mongoose does NOT treat as
 * "find".
 *
 * Every soft-deleting model registers `pre(/^find/)` to append
 * `{ deletedAt: null }`. That regex matches find / findOne / findOneAndUpdate
 * and friends — but **not** `countDocuments` or `distinct`, whose hook names
 * don't begin with "find". The result was a list whose rows excluded deleted
 * records while its total counted them:
 *
 *     JobPosting.find({})        -> 26
 *     JobPosting.countDocuments  -> 36     (10 soft-deleted rows)
 *
 * That skew reached pagination totals, "Total Patients" on the dashboard, and
 * the no-show-rate denominator. Applied centrally so the fix can't drift out of
 * sync with the per-model find hooks.
 *
 * Honours the same escape hatches as those hooks: an explicit `deletedAt` in
 * the query, and `.setOptions({ skipSoftDelete: true })`.
 */
function softDeleteCountPlugin(schema) {
  // Only meaningful for schemas that actually soft-delete.
  if (!schema.path('deletedAt')) return;

  schema.pre(['countDocuments', 'distinct'], function () {
    if (this.getOptions?.().skipSoftDelete) return;
    if (this.getQuery().deletedAt !== undefined) return;
    this.where({ deletedAt: null });
  });
}

/**
 * Apply the plugin to every schema in a registry map ({ Name: schema }).
 * @returns {string[]} names of the schemas that received it
 */
function applyToRegistry(registry) {
  const applied = [];
  for (const [name, schema] of Object.entries(registry)) {
    if (schema && typeof schema.path === 'function' && schema.path('deletedAt')) {
      schema.plugin(softDeleteCountPlugin);
      applied.push(name);
    }
  }
  return applied;
}

module.exports = softDeleteCountPlugin;
module.exports.softDeleteCountPlugin = softDeleteCountPlugin;
module.exports.applyToRegistry = applyToRegistry;
