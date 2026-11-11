// yarn tally <poll.json> <ballots.json> [--mempool-base <url>]
// Prints the count as JSON. Exit 0 on a count, 3 when a voter's coins were not
// read (no count; run it again), 1 on anything else.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { Ballot, Poll } from '@orangecheck/vote-core';

import { explorerChain } from './chain.js';
import { offlineTally } from './offline-tally.js';

function readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf8'));
}

try {
    const { positionals, values } = parseArgs({
        allowPositionals: true,
        options: { 'mempool-base': { type: 'string' } },
    });
    const [pollPath, ballotsPath] = positionals;
    if (!pollPath || !ballotsPath || positionals.length !== 2) {
        throw new Error('usage: yarn tally <poll.json> <ballots.json> [--mempool-base <url>]');
    }
    const poll = readJson(pollPath) as Poll;
    const ballots = readJson(ballotsPath);
    if (!Array.isArray(ballots)) throw new Error(`${ballotsPath} is not a JSON array of ballots`);

    const out = await offlineTally(poll, ballots as Ballot[], explorerChain(values['mempool-base']));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    if (out.state === 'unread') process.exitCode = 3;
} catch (err) {
    process.stderr.write(`offline-tally: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
}
