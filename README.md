# Signal Proof

[Website](https://edwardforst.github.io/signal-proof-public/) · [Publisher](https://x.com/EdwardForst379)

New signals disclose their hourly UTC interval, buy/sell direction and transaction quantity. Quantity is the order size in the named asset, not the resulting position; reversals include the closing leg. Exact source times, prices and account positions are excluded.

After an hour closes, each signal receives a random nonce, SHA-256 commitment, hash-chain link, Ed25519 signature and RFC 3161 timestamp. Contents are disclosed 168 hours after that hour closes. The actual source-to-disclosure delay is 168–169 hours. In hourly receipts, `record.received_at` is the hour-end boundary, not the exact source reception time. TSA issuance establishes existence by issuance. Legacy records retain their original signed bytes and release rules.

## Verify

Use **Verify all records** on the website, or Node.js 22+:

```sh
npm ci
npm run verify
```

Download [records](https://edwardforst.github.io/signal-proof-public/data/records.json), [commitments](https://edwardforst.github.io/signal-proof-public/data/commitments.json) and the [checkpoint](https://edwardforst.github.io/signal-proof-public/data/manifest.json). Public key and TSA root are in `trust/`; pin trusted fingerprints independently. Compare the final sequence/hash with a previously saved checkpoint. Chain continuity covers published records, rather than independently witnessing upstream delivery.

For downloaded records:

```sh
node scripts/verify.js downloaded-records.json trusted-public-key.txt trusted-root.pem
```

`lib/` verifies proofs, `site/` displays them, and the publication workflow synchronizes the public archive. Historical formats remain readable. Build the website with `npm run build`.
