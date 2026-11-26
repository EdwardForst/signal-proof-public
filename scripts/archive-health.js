import assert from 'node:assert/strict';

const MINUTE = 60_000;
const MAX_SYNC_AGE = 120 * MINUTE;
const MAX_PAGE_LAG = 120 * MINUTE;
const MAX_PENDING_AGE = 30 * MINUTE;
const SCAN_LIMIT = 100;
const BATCH_SIZE = 10;

function validHead(head) {
  assert.ok(Number.isSafeInteger(head?.seq) && head.seq >= 0, 'Invalid ledger sequence');
  assert.match(head.chain_hash, /^[0-9a-f]{64}$/, 'Invalid ledger hash');
  return head;
}

function age(timestamp, now) {
  const time = Date.parse(timestamp);
  assert.ok(Number.isFinite(time) && time <= now + 5 * MINUTE, 'Invalid ledger timestamp');
  return now - time;
}

export async function checkArchiveHealth({ pages, archived, fetchSource, now = Date.now() }) {
  assert.equal(pages.schema_version, 1, 'Unsupported Pages status format');
  const [sourceCommitments, sourceDisclosures] = (await Promise.all([
    fetchSource('/commitments/head'), fetchSource('/head'),
  ])).map(validHead);
  const warnings = [];
  const failures = [];
  const commitments = new Map();

  function getCommitment(seq) {
    if (!commitments.has(seq)) {
      commitments.set(seq, fetchSource('/commitments/' + seq).then((commitment) => {
        assert.equal(commitment.record.seq, seq, 'Unexpected source commitment sequence');
        assert.ok(['pending', 'verified'].includes(commitment.tsa?.status), 'Invalid TSA state');
        return commitment;
      }));
    }
    return commitments.get(seq);
  }

  if (pages.last_successful_sync_at === null) {
    failures.push('Pages has no recorded successful sync time.');
  } else if (age(pages.last_successful_sync_at, now) >= MAX_SYNC_AGE) {
    failures.push('The last successful sync deployed to Pages is at least 120 minutes old.');
  }

  for (const [name, pageHead, sourceHead, firstMissingTime] of [
    ['commitments', validHead(pages.commitments), sourceCommitments,
      async (seq) => (await getCommitment(seq)).record.received_at],
    ['disclosures', validHead(pages.disclosures), sourceDisclosures,
      async (seq) => (await fetchSource('/records/' + seq)).release_at],
  ]) {
    if (pageHead.seq > sourceHead.seq ||
      (pageHead.seq === sourceHead.seq && pageHead.chain_hash !== sourceHead.chain_hash)) {
      failures.push(`Pages ${name} checkpoint disagrees with the source.`);
    } else if (pageHead.seq < sourceHead.seq) {
      const message = `Pages is behind the source for ${name} (${pageHead.seq} vs ${sourceHead.seq}).`;
      const missingAge = age(await firstMissingTime(pageHead.seq + 1), now);
      if (missingAge >= MAX_PAGE_LAG) failures.push(message);
      else warnings.push(message);
    }
  }

  const overdue = archived.filter((entry) => entry.tsa.status === 'pending' &&
    age(entry.record.received_at, now) >= MAX_PENDING_AGE);
  overdue.sort((a, b) => Date.parse(a.record.received_at) - Date.parse(b.record.received_at));
  if (archived.length > sourceCommitments.seq) failures.push('Source commitment sequence regressed.');
  const unseen = Math.max(0, sourceCommitments.seq - archived.length);
  const candidates = overdue.slice(0, SCAN_LIMIT).map((entry) => entry.record.seq);
  const newCount = Math.min(unseen, SCAN_LIMIT - candidates.length);
  for (let i = 1; i <= newCount; i++) candidates.push(archived.length + i);

  let oldestPending = null;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = await Promise.all(candidates.slice(i, i + BATCH_SIZE).map(getCommitment));
    for (const entry of batch) {
      if (entry.tsa.status !== 'pending') continue;
      const pendingAge = age(entry.record.received_at, now);
      if (!oldestPending || pendingAge > oldestPending.age) {
        oldestPending = { seq: entry.record.seq, age: pendingAge };
      }
    }
  }
  if (oldestPending?.age >= MAX_PENDING_AGE) {
    const minutes = Math.floor(oldestPending.age / MINUTE);
    failures.push(`Commitment #${oldestPending.seq} still awaits TSA (${minutes} minutes since its hour ended).`);
  }
  if (overdue.length + unseen > SCAN_LIMIT) {
    failures.push('The TSA monitoring backlog exceeded the 100-commitment scan limit.');
  }

  return { warnings, failures };
}
