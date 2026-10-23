# Signal Proof

[Website](https://edwardforst.github.io/signal-proof-public/) · [Publisher](https://x.com/EdwardForst379)

This repository begins at the genesis of proof epoch 2. No earlier signals are included or claimed.

Signals disclose their hourly UTC interval, buy/sell direction and transaction quantity for the neutral market identifier `BTC-USDT-PERP`. Quantity is order size, not the resulting position; reversals include the closing leg. Exact source times, prices, account positions and producer identifiers are excluded.

After an hour closes, each signal receives a random nonce, SHA-256 commitment, hash-chain link, Ed25519 signature and RFC 3161 timestamp. Contents are disclosed 168 hours after verified timestamp issuance. `record.received_at` is the hour-end boundary, not an exact event or reception time. TSA issuance establishes the latest independently witnessed commitment time.

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

For a conservative, reproducible replay:

1. Use only records accepted by `npm run verify`.
2. Treat the verified RFC 3161 `tsa.gen_time` as the earliest publicly defensible information time.
3. Use the first market-data bar strictly after `tsa.gen_time`, and identify the public price source and bar interval.
4. Declare initial equity and initial position. Apply `buy` quantities as positive changes and `sell` quantities as negative changes.
5. Charge a declared fee on traded notional; the reference fee is `0.001` per fill. State assumptions for slippage and funding.
6. Mark the position with the same declared price source. Report returns, drawdown and exposure as a scenario-based replay.
