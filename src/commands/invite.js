import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

export async function handleInviteCommand(env) {
    const applicationId = env.DISCORD_APPLICATION_ID;
    const permissions = 2147485696; // Admin-level permissions, adjust as needed
    const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot+applications.commands&permissions=${permissions}`;

    return {
        content: INVITE_URL,
        flags: InteractionResponseFlags.EPHEMERAL
    };
} 