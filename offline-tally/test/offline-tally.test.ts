// The committed record of a real poll, counted with a fixed chain, so this
// runs offline. live.yml counts the same record against the real chain weekly.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { pollId, verifyPoll, type Ballot, type Poll } from '@orangecheck/vote-core';

import { bip322, offlineTally, type Chain } from '../src/offline-tally.js';

const POLL_ID = '9825268c74a3a15baefe8f9705f774cc7bb97205922fc828df3b377e0e158a18';
const BALLOT_ID = '1d10e1e5e108894285d74a11790860444fde0c51d180611006c6204360175164';
const dir = new URL(`../polls/${POLL_ID}/`, import.meta.url);
const poll = (): Poll => JSON.parse(readFileSync(new URL('poll.json', dir), 'utf8'));
const ballots = (): Ballot[] => JSON.parse(readFileSync(new URL('ballots.json', dir), 'utf8'));

// The voter holds 12,000 sat confirmed at block 900,000, older than the poll's 30-day floor.
const chain: Chain = {
    snapshotBlock: async () => 947_961,
    utxosAt: () => [{ value: 12_000, confirmed_height: 900_000 }],
};

/** The same base64 signature with one byte of the signature itself changed. */
function oneByteChanged(sigB64: string): string {
    const bytes = Buffer.from(sigB64, 'base64');
    bytes[bytes.length - 1]! ^= 0x01;
    return bytes.toString('base64');
}

test('the committed record counts its one ballot', async () => {
    const out = await offlineTally(poll(), ballots(), chain);
    assert.equal(out.poll_id, POLL_ID);
    assert.equal(out.state, 'tallied');
    if (out.state !== 'tallied') return;
    assert.deepEqual(out.counted, [BALLOT_ID]);
    assert.deepEqual(out.tallies, { yes: 12_000, no: 0 });
    assert.deepEqual(out.rejected, []);
});

test('a ballot with one signature byte changed does not count', async () => {
    const tampered = ballots().map((b) => ({ ...b, sig: { ...b.sig, value: oneByteChanged(b.sig.value) } }));
    const out = await offlineTally(poll(), tampered, chain);
    assert.equal(out.state, 'tallied');
    if (out.state !== 'tallied') return;
    assert.deepEqual(out.counted, []);
    assert.deepEqual(out.tallies, { yes: 0, no: 0 });
    assert.deepEqual(
        out.rejected.map((r) => [r.ballot_id, r.code]),
        [[BALLOT_ID, 'E_BAD_SIG']]
    );
});

test('a poll with one signature byte changed is not counted', async () => {
    const p = poll();
    await assert.rejects(
        offlineTally({ ...p, sig: { ...p.sig, value: oneByteChanged(p.sig.value) } }, ballots(), chain),
        /the poll does not verify \(E_BAD_SIG\)/
    );
});

// A throwaway key: it holds no coins and signs only the polls these tests make.
const THROWAWAY = new Uint8Array(32).fill(7);

/** The committed poll with some fields changed, signed again by the throwaway key. */
async function resigned(fields: Partial<Poll>): Promise<Poll> {
    const creator = addressFromPrivateKey(THROWAWAY, 'p2wpkh');
    const p: Poll = { ...poll(), ...fields, creator, sig: { alg: 'bip322', pubkey: creator, value: '' } };
    const signed = { ...p, sig: { ...p.sig, value: signMessage(creator, pollId(p), THROWAWAY) } };
    assert.deepEqual(await verifyPoll(signed, bip322), { ok: true });
    return signed;
}

test('an anchored poll is sent to vote-cli, not counted here', async () => {
    const p = await resigned({ deadline: '2026-11-20T00:00:00Z' });
    await assert.rejects(offlineTally(p, [], chain), /this poll is anchored .*vote-cli tally/);
});

test('a secret poll is sent to oc-vote, not counted here', async () => {
    const p = await resigned({ mode: 'secret', reveal_pk: '11'.repeat(32) });
    await assert.rejects(offlineTally(p, [], chain), /this is a secret poll/);
});
