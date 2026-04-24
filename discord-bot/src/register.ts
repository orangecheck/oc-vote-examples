// One-shot: register slash commands with Discord's API.
//   - If DISCORD_GUILD_ID is set → registers to that guild (instant).
//   - Otherwise → registers globally (takes up to an hour to propagate).

import 'dotenv/config';
import { REST, Routes } from 'discord.js';

import { COMMANDS } from './commands.js';

const token = process.env.DISCORD_TOKEN!;
const appId = process.env.DISCORD_APP_ID!;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !appId) {
    console.error('DISCORD_TOKEN and DISCORD_APP_ID are required');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

const route = guildId
    ? Routes.applicationGuildCommands(appId, guildId)
    : Routes.applicationCommands(appId);

await rest.put(route, { body: COMMANDS });

console.log(
    `✓ registered ${COMMANDS.length} command(s) ${guildId ? `to guild ${guildId}` : 'globally (~1 hour to propagate)'}`
);
