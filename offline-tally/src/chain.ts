// The chain a count reads, from a mempool.space-compatible explorer. The
// explorer is a trust anchor: name your own instance with --mempool-base.

import {
    mempoolBlockTimeSource,
    resolvePollSnapshot,
    UtxoUnreadError,
    type Poll,
    type Utxo,
} from '@orangecheck/vote-core';

import type { Chain } from './offline-tally.js';

interface ExplorerCoin {
    value: number;
    status: { confirmed: boolean; block_height?: number };
}

function isCoin(c: unknown): c is ExplorerCoin {
    const coin = c as ExplorerCoin | null;
    return !!coin && typeof coin.value === 'number' && !!coin.status && typeof coin.status === 'object';
}

export function explorerChain(base = 'https://mempool.space/api'): Chain {
    return {
        async snapshotBlock(poll: Poll) {
            const r = await resolvePollSnapshot(poll, mempoolBlockTimeSource({ base }));
            if (!r.ok) throw new Error(`the snapshot block is not countable yet (${r.code}): ${r.reason}`);
            return r.height;
        },
        // Coins unspent now and confirmed at or before the snapshot, as vote.ochk.io and oc-vote count them.
        async utxosAt(address: string, snapshot: number): Promise<Utxo[]> {
            let res: Response;
            try {
                res = await fetch(`${base}/address/${address}/utxo`, { signal: AbortSignal.timeout(8_000) });
            } catch {
                throw new UtxoUnreadError('chain_unread');
            }
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                if (/too many unspent/i.test(body)) throw new UtxoUnreadError('utxo_cap_unread');
                throw new UtxoUnreadError(res.status === 429 || res.status >= 500 ? 'chain_unread' : 'provider_refused_unread');
            }
            const coins: unknown = await res.json().catch(() => null);
            if (!Array.isArray(coins) || !coins.every(isCoin)) throw new UtxoUnreadError('chain_unread');
            return coins
                .filter((c) => c.status.confirmed && typeof c.status.block_height === 'number')
                .map((c) => ({ value: c.value, confirmed_height: c.status.block_height as number }))
                .filter((c) => c.confirmed_height <= snapshot);
        },
    };
}
