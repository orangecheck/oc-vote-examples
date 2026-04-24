// Bot entry point. Listens for /poll + /poll-watch interactions.

import 'dotenv/config';
import { Client, GatewayIntentBits, type TextChannel } from 'discord.js';

import { fetchTally, renderTally } from './render.js';
import { startWatch } from './watch.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error('DISCORD_TOKEN is required');
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', (c) => {
    console.log(`✓ logged in as ${c.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const pollId = interaction.options.getString('id', true);

    if (!/^[0-9a-f]{64}$/.test(pollId)) {
        await interaction.reply({ content: 'poll id must be 64 hex chars', ephemeral: true });
        return;
    }

    await interaction.deferReply();

    try {
        const tally = await fetchTally(pollId);
        const embed = renderTally(tally);
        await interaction.editReply({ embeds: [embed] });

        if (interaction.commandName === 'poll-watch' && tally.deadline) {
            if (Date.parse(tally.deadline) > Date.now() && interaction.channel?.isTextBased()) {
                startWatch(client, interaction.channel as TextChannel, pollId, tally.deadline);
                await interaction.followUp({
                    content: `_watching — I'll update this channel every 5 min until ${tally.deadline}_`,
                    ephemeral: true,
                });
            }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        await interaction.editReply({ content: `failed to fetch tally: ${msg}` });
    }
});

await client.login(token);
