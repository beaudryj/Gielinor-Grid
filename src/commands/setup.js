import { checkAdminPermissions } from '../utils/permissions';

/**
 * One-time setup command to populate guild_owners table for the current guild only
 */
export async function handleSetupCommand(d1, interaction, env) {
    // Fetch the guild info from Discord API to get the owner_id
    const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${interaction.guild_id}`, {
        headers: {
            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });

    if (!guildResponse.ok) {
        return {
            content: `❌ Failed to fetch guild info: ${guildResponse.status}`,
            flags: 64
        };
    }

    const guild = await guildResponse.json();

    // Only allow this to be run by the server owner
    if (interaction.member.user.id !== guild.owner_id) {
        return { 
            content: "❌ This command can only be run by the server owner.", 
            flags: 64 
        };
    }

    try {
        // Cache the owner in our database for this guild only
        await d1.prepare(`
            INSERT INTO guild_owners (guild_id, owner_id)
            VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET owner_id = excluded.owner_id
        `).bind(guild.id, guild.owner_id).run();

        return {
            content: `✅ Setup complete for guild: ${guild.id}`,
            flags: 64
        };
    } catch (error) {
        console.error('Setup command failed:', error);
        return {
            content: `❌ Setup failed: ${error.message}`,
            flags: 64
        };
    }
} 