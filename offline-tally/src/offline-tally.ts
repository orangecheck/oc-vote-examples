// Count an OC Vote poll from its signed record. Every BIP-322 signature is
// checked here with @orangecheck/bip322, the count is vote-core's, and the
// chain is read from an explorer the caller names. No tally service is asked.

import { verifySignature } from '@orangecheck/bip322';
import {
    ballotId,
    distinctBallotCopies,
    isAnchoredPoll,
    pollId,
    tally,
    verifyBallot,
    verifyPoll,
    type Ballot,
    type Poll,
    type SignatureVerifier,
    type TallyResult,
    type UtxoLookup,
    type VoteErrorCode,
} from '@orangecheck/vote-core';

/** What a count reads from Bitcoin: the snapshot height, and each voter's coins at it. */
export interface Chain {
    snapshotBlock(poll: Poll): Promise<number>;
    utxosAt: UtxoLookup;
}

/** A ballot copy that does not count, and why. */
export interface Rejected {
    ballot_id: string;
    voter: string;
    code: VoteErrorCode;
    reason: string;
}

export type OfflineTally = TallyResult & {
    poll_id: string;
    question: string;
    /** Copies of this poll's ballots whose shape or signature fails (SPEC §10.2). */
    rejected: Rejected[];
};

export const bip322: SignatureVerifier = ({ address, message, signature }) =>
    verifySignature(address, message, signature);

export async function offlineTally(poll: Poll, ballots: Ballot[], chain: Chain): Promise<OfflineTally> {
    const pollCheck = await verifyPoll(poll, bip322);
    if (!pollCheck.ok) throw new Error(`the poll does not verify (${pollCheck.code}): ${pollCheck.reason}`);
    if (isAnchoredPoll(poll)) {
        throw new Error(
            'this poll is anchored (deadline on or after 2026-11-15): its ballots count by their Bitcoin anchors, ' +
                'which this example does not read. Count it with `npx -y @orangecheck/vote-cli tally <poll_id>`.'
        );
    }
    if (poll.mode !== 'public') {
        throw new Error('this is a secret poll; this example counts public polls. Use `oc-vote tally <poll_id>`.');
    }

    const pid = pollId(poll);
    // Every distinct copy: copies with one ballot_id can carry different signatures.
    const copies = distinctBallotCopies(ballots);
    const result = await tally({
        poll,
        ballots: copies,
        utxosAt: chain.utxosAt,
        snapshotBlock: await chain.snapshotBlock(poll),
        verify: bip322,
    });

    const rejected: Rejected[] = [];
    for (const b of copies) {
        if (b.poll_id !== pid) continue;
        const check = await verifyBallot(b, bip322);
        if (!check.ok) rejected.push({ ballot_id: ballotId(b), voter: b.voter, code: check.code, reason: check.reason });
    }
    return { poll_id: pid, question: poll.question, ...result, rejected };
}
