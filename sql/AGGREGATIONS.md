# Aggregation port — Phase 5

The plan calls this the highest defect risk in the programme:

> **Aggregation port** — 95 pipelines rewritten as SQL, output reconciled
> row-for-row against the Mongo originals. **Highest defect risk**

Measured rather than estimated:

```
node scripts/sql/inventory-aggregations.js          # summary
node scripts/sql/inventory-aggregations.js --full   # every pipeline
node scripts/sql/verify-aggregations.js             # CP-8, row-for-row parity
```

| | Count | |
|---|---:|---|
| Total pipelines | 97 | plan estimated 95 — close |
| `direct` | 91 | `$match`/`$group`/`$sum`/`$sort` → `WHERE`/`GROUP BY`/`SUM()`/`ORDER BY` |
| `moderate` | 6 | needs a join or a subquery |
| `hard` | 0 | none, once the single-branch `$facet` was read properly |

**The count was right; the difficulty was overstated.** Ninety-four per cent are
translations anyone can check by reading. Six need judgement.

---

## The rule that decides two of them

`$lookup` followed by `$unwind` is **not** always a LEFT JOIN. It depends on one
option, and getting it backwards changes the numbers without failing:

| Idiom | SQL | Why |
|---|---|---|
| `$lookup` alone | `LEFT JOIN` | keeps the left document when nothing matches |
| `$lookup` + `$unwind` *without* `preserveNullAndEmptyArrays` | **`INNER JOIN`** | that `$unwind` discards rows whose lookup came back empty |
| `$lookup` + `$unwind: { preserveNullAndEmptyArrays: true }` | `LEFT JOIN` | explicitly keeps them |

Both idioms appear in this codebase, in two pipelines that otherwise look
identical:

- `inventory.service.js:218` — bare `$unwind` → **INNER**
- `billing.service.js:637` — `preserveNullAndEmptyArrays: true` → **LEFT**

Proven rather than asserted: three inventory transactions were seeded, one
referencing an item that does not exist. Both databases returned `totalQuantity:
10` and both excluded the orphan. Read as a LEFT JOIN, the SQL would have
reported **109** — a wastage figure wrong by an order of magnitude, with nothing
raising an error.

---

## Blocked: HSN-wise GST summary

`src/modules/billing/billing.service.js:1094`

**This is a live bug in the Mongo application, not a migration problem.** The
port surfaced it because translating a pipeline forces you to name every field it
reads.

The pipeline sums three fields per line item:

```js
cgst: { $sum: '$items.cgst' },
sgst: { $sum: '$items.sgst' },
igst: { $sum: '$items.igst' },
```

None of them exist. `Invoice.items` declares `description`, `quantity`,
`unitPrice`, `discount`, `tax`, `total`, `itemType`, `serviceItem`, `hsnCode`
and `taxRate` — and nothing else. Mongoose is strict by default, so those keys
are stripped on write even if the application sets them, and `$sum` over a
missing field returns `0`.

**The GST report has been showing ₹0 CGST, ₹0 SGST and ₹0 IGST on every HSN
line.** `totalTax` beside them is correct, because it sums `items.tax`, which
does exist — so the report looks populated and only the split is wrong.

That is a tax filing figure.

### Why the port is stopped rather than finished

Porting it faithfully reproduces three columns of zeros. Porting it "correctly"
means inventing a tax split nobody specified. Neither is a decision to take
silently.

Two questions decide it, and both belong to whoever specified the report:

1. **Should there be a per-HSN CGST/SGST/IGST split at all?** The parent invoice
   already carries `gstDetails.cgst/sgst/igst`, so the per-line breakdown may
   have been aspirational.
2. **Have returns been filed from this report?** If so the zeros matter beyond
   the code.

The child table is ready either way: `invoice_items` was promoted from JSONB
specifically for this aggregation — see `sql/schema/overrides.js`, which records
the reason as *"Statutory… that is a tax filing figure"*. It has `tax`,
`hsn_code` and `tax_rate`, and would need three columns adding if the split is
wanted.

---

## Adding a case to CP-8

Write the SQL beside the pipeline it replaces, register it in
`scripts/sql/verify-aggregations.js`, and run it. The SQL is not trusted until
its output has been shown to match, row for row and in order.

A case where both sides return nothing is reported **uncompared, not passed**. A
harness that goes green on empty data has told you only that both queries ran.
