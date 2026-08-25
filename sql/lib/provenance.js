'use strict';

/**
 * Markers for rows that were deliberately repaired rather than migrated.
 *
 * Two things need to agree on these strings and must not drift apart:
 *
 *   - the repair scripts, which write the marker
 *   - CP-4, which compares MongoDB and PostgreSQL row counts and would otherwise
 *     report a repair as a migration failure
 *
 * The distinction matters. CP-4 asks "did the ETL move the data faithfully?", and
 * a row that never existed in MongoDB is not an answer to that question — but
 * neither should it be quietly ignored. Marking it in the row itself means the
 * exclusion is precise (this row, for this stated reason) rather than a blanket
 * "skip this table", and anyone reading the database later can see which records
 * were reconstructed without consulting a script.
 */

/**
 * Written to `video_sessions.notes` by scripts/reconstruct-video-sessions.js.
 *
 * Kept as a full sentence rather than a code because it is stored in a free-text
 * clinical field that people read. A row that says only `RECONSTRUCTED_V1` tells
 * a clinician nothing.
 */
const RECONSTRUCTED_VIDEO_SESSION =
  'RECONSTRUCTED RECORD — the original VideoSession was deleted. Participants and timing were '
  + 'derived from the surviving chat messages and emergency session; no clinical content was '
  + 'recovered or invented. See sql/FINDINGS.md F-2.';

/**
 * Which table/column each marker lives in, so CP-4 can subtract them from a
 * count without knowing anything about the repair that created them.
 */
const REPAIRED_ROWS = [
  { table: 'video_sessions', column: 'notes', marker: RECONSTRUCTED_VIDEO_SESSION, finding: 'F-2' },
];

module.exports = { RECONSTRUCTED_VIDEO_SESSION, REPAIRED_ROWS };
