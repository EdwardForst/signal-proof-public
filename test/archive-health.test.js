import assert from 'node:assert/strict';
import test from 'node:test';
import { checkArchiveHealth } from '../scripts/archive-health.js';

const now = Date.parse('2026-11-26T10:30:00Z');
const head = (seq) => ({ seq, chain_hash: seq.toString(16).padStart(64, '0') });
const syncedAt = new Date(now - 60_000).toISOString();
const utc = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

function commitment(seq, minutesAgo, status) {
  return { record: { seq, received_at: utc(minutesAgo) }, tsa: { status } };
}

function check({ page = {}, source = {}, archived = [] } = {}) {
  const pages = { schema_version: 1, last_successful_sync_at: syncedAt,
    commitments: head(1), disclosures: head(0), ...page };
  const responses = { '/commitments/head': head(1), '/head': head(0), ...source };
  return checkArchiveHealth({ pages, archived, now, async fetchSource(path) {
    assert.ok(Object.hasOwn(responses, path), `Unexpected source request ${path}`);
    return responses[path];
  } });
}

test('healthy Pages checkpoints agree with the Worker', async () => {
  const result = await check({ archived: [commitment(1, 30, 'verified')] });
  assert.deepEqual(result, { warnings: [], failures: [] });
});

test('fresh lag warns and overdue disclosure lag fails using release time', async () => {
  const result = await check({
    source: { '/commitments/head': head(2), '/head': head(1),
      '/commitments/2': commitment(2, 10, 'verified'), '/records/1': { release_at: utc(120) } },
    archived: [commitment(1, 240, 'verified')],
  });
  assert.deepEqual(result.warnings, ['Pages is behind the source for commitments (1 vs 2).']);
  assert.deepEqual(result.failures, ['Pages is behind the source for disclosures (0 vs 1).']);
});

test('stale sync and divergent hashes produce independent failures', async () => {
  const result = await check({
    page: { last_successful_sync_at: utc(120), commitments: { ...head(1), chain_hash: 'e'.repeat(64) } },
    archived: [commitment(1, 240, 'verified')],
  });
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[0], /last successful sync/);
  assert.match(result.failures[1], /checkpoint disagrees/);
});

test('checks the live TSA state and reports the oldest pending even before Pages sync', async () => {
  const archived = [commitment(1, 180, 'pending'), commitment(2, 120, 'pending')];
  const source = { '/commitments/head': head(3),
    '/commitments/1': commitment(1, 180, 'verified'),
    '/commitments/2': commitment(2, 120, 'pending'),
    '/commitments/3': commitment(3, 60, 'pending') };
  const result = await check({ page: { commitments: head(2) }, source, archived });
  assert.match(result.failures[0], /#2 still awaits TSA \(120 minutes/);
  assert.equal(result.failures.length, 1);
  source['/commitments/2'] = commitment(2, 120, 'verified');
  const next = await check({ page: { commitments: head(2) }, source, archived });
  assert.match(next.failures[0], /#3 still awaits TSA/);
});
