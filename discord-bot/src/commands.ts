import { ApplicationCommandOptionType, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

export const COMMANDS: RESTPostAPIApplicationCommandsJSONBody[] = [
    {
        name: 'poll',
        description: 'Look up the tally for an OC Vote poll',
        options: [
            {
                name: 'id',
                description: '64-hex poll id (from a vote.ochk.io/p/<id> URL)',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
    {
        name: 'poll-watch',
        description: 'Subscribe this channel to periodic tally updates until deadline',
        options: [
            {
                name: 'id',
                description: '64-hex poll id',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
        ],
    },
];
