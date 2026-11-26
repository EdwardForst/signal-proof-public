# Signal Proof

[Website](https://edwardforst.github.io/signal-proof-public/) · [Publisher](https://x.com/EdwardForst379)

This repository begins at genesis. No earlier signals are included or claimed.

Signals disclose their hourly UTC interval, buy/sell direction and transaction quantity for the neutral market identifier `BTC-USDT-PERP`. Quantity is order size, not the resulting position; reversals include the closing leg. Exact source times, prices, account positions and producer identifiers are excluded.

After an hour closes, each signal receives a random nonce, SHA-256 commitment, hash-chain link, Ed25519 signature and RFC 3161 timestamp. Contents become eligible for release 168 hours after verified timestamp issuance. The website publishes them after archive synchronization and deployment. `record.received_at` is the hour-end boundary, not an exact event or reception time. TSA issuance establishes the latest independently witnessed commitment time.

The protocol is producer-independent. Public records do not identify a platform, script, language or strategy version, and the producer may change without invalidating later signals. The archive proves the integrity, order and independently witnessed existence time of records that entered this chain.

## Verify

Use **Verify all records** on the website, or Node.js 22+:

```sh
npm ci
npm run verify
```

Download [records](https://edwardforst.github.io/signal-proof-public/data/records.json), [commitments](https://edwardforst.github.io/signal-proof-public/data/commitments.json) and the [checkpoint](https://edwardforst.github.io/signal-proof-public/data/manifest.json). Public key and TSA root are in `trust/`; pin trusted fingerprints independently. Compare the final sequence and hash with a previously saved checkpoint.

For downloaded records:

```sh
node scripts/verify.js downloaded-records.json trusted-public-key.txt trusted-root.pem
```

`lib/` verifies proofs, `site/` displays them, and the publication workflow synchronizes the public archive. Build the website with `npm run build`.

## LLM audit and scenario replay

An LLM can clone this repository, run the verifier, read the verified signals and build a mathematical equity curve. The replay must state its assumptions.

Choose a replay mode and label it in the results.

1. Use only records accepted by `npm run verify`.
2. **Historical existence scenario.** Use the verified RFC 3161 `tsa.gen_time` as the reference time. This tests a hypothetical entry after the signal already existed, while its contents could still be private.
3. **Publicly reproducible scenario.** Choose a public distribution channel and use the first documented time at which the complete disclosure was observed there. Retain a timestamped archive observation or publication record tied to the verified disclosure (sequence and chain hash). `release_at` is the earliest eligibility time, and `last_successful_sync_at` describes archive freshness. If public availability cannot be established for a record, report that gap and exclude it from this scenario. In either mode, use the first market-data bar strictly after the chosen reference time. Identify the public price source and bar interval.
4. Declare initial equity and initial position. Apply `buy` quantities as positive changes and `sell` quantities as negative changes.
5. Charge a declared fee on traded notional; the reference fee is `0.001` per fill. State assumptions for slippage and funding.
6. Mark the position with the same declared price source. Report returns, drawdown and exposure as a scenario-based replay.

To assess signal coverage, reconcile the sequence against TradingView alert logs. Use exchange execution records to assess actual fills and trading performance.

## Publication monitoring and TSA recovery

The site shows the UTC completion time of the last verified sync. The public `data/status.json` reports the commitment and disclosure checkpoints in the deployed snapshot. The [monitor workflow](https://github.com/EdwardForst/signal-proof-public/actions/workflows/monitor.yml) runs after deployment and has a separate hourly schedule. It logs the observation time, sequence and chain hash after fetching the latest disclosure from Pages. A sequence lag produces an Actions warning. A lag or stale sync of at least 120 minutes, a checkpoint mismatch, or a source commitment still awaiting TSA at least 30 minutes after its hour ended fails the check. GitHub schedules can run late.

On a TSA alert, check the oldest pending record and Worker alarm status, then check FreeTSA and its CRL endpoint. The Worker retries automatically. If the alarm stops progressing after service recovers, an authorized operator can schedule a retry through the existing Worker recovery endpoint. Confirm that the timestamp verifies, the signed commitment remains unchanged, and the website catches up once the disclosure sequence is eligible. Run the isolated drill from the Worker directory with `node --test test/tsa-recovery.test.js`.
