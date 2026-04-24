// Render a tally response into a Discord embed.

import { EmbedBuilder } from 'discord.js';

interface TallyResponse {
    poll_id: string;
    state: 'tallied' | 'awaiting_reveal';
    question?: string;
    creator?: string;
    deadline?: string;
    weight_mode?: string;
    mode?: 'public' | 'secret';
    snapshot_block?: number;
    turnout?: { voters: number; weight: number };
    tallies?: Record<string, number>;
    ballot_count?: number;
    error?: string;
}

function bar(pct: number, width = 18): string {
    const filled = Math.round((pct / 100) * width);
    return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function fmt(n: number): string {
    return n.toLocaleString('en-US');
}

export async function fetchTally(pollId: string): Promise<TallyResponse> {
    const base = process.env.TALLY_BASE_URL ?? 'https://vote.ochk.io/api/tally';
    const res = await fetch(`${base}?poll=${pollId}`);
    const body = (await res.json().catch(() => ({ error: 'not json' }))) as TallyResponse;
    if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `http ${res.status}`);
    }
    return body;
}

export function renderTally(t: TallyResponse): EmbedBuilder {
    const url = `https://vote.ochk.io/p/${t.poll_id}`;
    const e = new EmbedBuilder()
        .setColor(0xf97316)
        .setTitle(t.question ?? 'OC Vote poll')
        .setURL(url);

    if (t.state === 'awaiting_reveal') {
        e.setDescription(
            '**awaiting reveal** — secret-mode poll; creator has not yet published the reveal event.\n' +
                `ballots observed: ${t.ballot_count ?? 0}`
        );
        return e;
    }

    if (t.state !== 'tallied' || !t.tallies) {
        e.setDescription(`state: ${t.state}${t.error ? ` — ${t.error}` : ''}`);
        return e;
    }

    const totalWeight = t.turnout?.weight ?? 0;
    const lines: string[] = [];
    for (const [optionId, weight] of Object.entries(t.tallies).sort((a, b) => b[1] - a[1])) {
        const pct = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
        lines.push(
            '`' +
                optionId.padEnd(14) +
                ' ' +
                bar(pct) +
                ' ' +
                fmt(weight).padStart(12) +
                ' ' +
                pct.toFixed(1).padStart(5) +
                '%`'
        );
    }

    e.setDescription(lines.join('\n'));
    e.addFields(
        { name: 'voters', value: String(t.turnout?.voters ?? 0), inline: true },
        { name: 'total weight', value: fmt(totalWeight), inline: true },
        { name: 'weight mode', value: t.weight_mode ?? '—', inline: true }
    );
    if (t.deadline) {
        const isPast = Date.parse(t.deadline) < Date.now();
        e.addFields({
            name: isPast ? 'closed' : 'open · closes',
            value: t.deadline.replace('T', ' ').slice(0, 16) + ' UTC',
            inline: false,
        });
    }
    e.setFooter({ text: `vote.ochk.io/p/${t.poll_id.slice(0, 12)}…` });
    return e;
}
