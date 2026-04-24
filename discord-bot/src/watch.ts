// In-memory poll-watch scheduler.
//
// Users invoke /poll-watch <id> in a channel. We remember (channel, pollId,
// deadline) and poke a tally update every INTERVAL_MS until the deadline
// passes, then one final post and forget.

import type { Client, TextChannel } from 'discord.js';

import { fetchTally, renderTally } from './render.js';

interface Watch {
    channelId: string;
    pollId: string;
    deadlineMs: number;
    messageId?: string;
    timer: NodeJS.Timeout;
}

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const watches = new Map<string, Watch>(); // key = channelId + ':' + pollId

export function startWatch(client: Client, channel: TextChannel, pollId: string, deadlineIso: string): void {
    const key = channel.id + ':' + pollId;
    if (watches.has(key)) return;
    const deadlineMs = Date.parse(deadlineIso);
    const tick = async () => {
        try {
            const tally = await fetchTally(pollId);
            const embed = renderTally(tally);
            const existing = watches.get(key);
            if (existing?.messageId) {
                const msg = await channel.messages.fetch(existing.messageId).catch(() => null);
                if (msg) {
                    await msg.edit({ embeds: [embed] }).catch(() => null);
                } else {
                    const fresh = await channel.send({ embeds: [embed] });
                    if (existing) existing.messageId = fresh.id;
                }
            } else {
                const msg = await channel.send({ embeds: [embed] });
                const w = watches.get(key);
                if (w) w.messageId = msg.id;
            }

            if (Date.now() > deadlineMs) {
                await channel.send({
                    content: `_poll ${pollId.slice(0, 8)}… is closed — this is the final tally._`,
                });
                stopWatch(key);
            }
        } catch (err) {
            console.error(`watch tick failed for ${pollId}:`, err);
        }
    };

    void tick();
    const timer = setInterval(tick, INTERVAL_MS);
    watches.set(key, { channelId: channel.id, pollId, deadlineMs, timer });
}

function stopWatch(key: string): void {
    const w = watches.get(key);
    if (w) {
        clearInterval(w.timer);
        watches.delete(key);
    }
}
