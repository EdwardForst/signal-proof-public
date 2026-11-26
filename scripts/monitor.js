import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { checkArchiveHealth } from './archive-health.js';
import { actionMask, sourceClient } from './source.js';

async function readPages(path) {
  const url = new URL(path, process.env.PAGES_URL);
  for (let attempt = 0; attempt < 3; attempt++) {
    url.searchParams.set('check', Date.now());
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (response.ok) return await response.json();
    } catch {
      // Pages can briefly return a stale response just after a deployment.
    }
    if (attempt < 2) await setTimeout(5000);
  }
  throw Error('The deployed Pages artifact could not be read: ' + path);
}

try {
  const fetchSource = sourceClient(process.env.SOURCE_URL, { attempts: 2, mask: actionMask });
  const pages = await readPages('data/status.json');
  const archived = JSON.parse(readFileSync('data/commitments.json', 'utf8'));
  const result = await checkArchiveHealth({ pages, archived, fetchSource });
  const { seq, chain_hash } = pages.disclosures;
  if (seq > 0) {
    const disclosure = await readPages(`data/records/${seq}.json`);
    assert.equal(disclosure.record.seq, seq, 'Published disclosure sequence disagrees with Pages status');
    assert.equal(disclosure.chain_hash, chain_hash, 'Published disclosure hash disagrees with Pages status');
    console.log(JSON.stringify({ observed_on_pages_at: new Date().toISOString(), seq, chain_hash }));
  }
  for (const message of result.warnings) console.log(`::warning title=Signal proof archive::${message}`);
  if (result.failures.length) {
    for (const message of result.failures) console.error(`::error title=Signal proof archive::${message}`);
    process.exitCode = 1;
  } else {
    console.log(`Checked Pages commitments #${pages.commitments.seq} and disclosures #${pages.disclosures.seq}.`);
  }
} catch (error) {
  console.error(`::error title=Signal proof archive::${error.message.replace(/[\r\n]+/g, ' ')}`);
  process.exitCode = 1;
}
