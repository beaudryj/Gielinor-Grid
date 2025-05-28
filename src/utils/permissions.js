/**
 * Check if a user has admin permissions in a guild
 * @param {Object} interaction - The Discord interaction object
 * @param {Object} d1 - The D1 database instance
 * @param {Object} env - The environment object containing DISCORD_BOT_TOKEN
 * @returns {Promise<boolean>} - Whether the user has admin permissions
 */
export async function hasAdminPermissions(interaction, d1, env) {
    const member = interaction.member;
    
    console.log('Checking permissions for user:', member.user.id);
    
    // First check if we have the owner in our database
    const ownerCheck = await d1.prepare(`
        SELECT owner_id FROM guild_owners WHERE guild_id = ?
    `).bind(interaction.guild_id).first();

    // If we have the owner in DB, check against that
    if (ownerCheck && ownerCheck.owner_id) {
        if (member.user.id === ownerCheck.owner_id) {
            console.log('User is server owner (from DB)');
            return true;
        }
    } else {
        // If not in DB, fetch from Discord API and cache it
        const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${interaction.guild_id}`, {
            headers: {
                'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (guildResponse.ok) {
            const guild = await guildResponse.json();
            // Cache the owner in our database
            await d1.prepare(`
                INSERT INTO guild_owners (guild_id, owner_id)
                VALUES (?, ?)
                ON CONFLICT(guild_id) DO UPDATE SET owner_id = excluded.owner_id
            `).bind(interaction.guild_id, guild.owner_id).run();

            if (member.user.id === guild.owner_id) {
                console.log('User is server owner (from API)');
                return true;
            }
        }
    }
    
    // Check database for admin roles
    const adminRoles = await d1.prepare(`
        SELECT role_id FROM admin_roles WHERE guild_id = ?
    `).bind(interaction.guild_id).all();

    console.log('Admin roles from database:', adminRoles);

    // Check if user has any of the admin roles
    if (adminRoles && adminRoles.results.length > 0) {
        const userRoles = member.roles || [];
        for (const adminRole of adminRoles.results) {
            if (userRoles.includes(adminRole.role_id)) {
                console.log('User has admin role');
                return true;
            }
        }
    }

    console.log('User does not have admin permissions');
    return false;
}

/**
 * Check if a user has admin permissions and return an error response if not
 * @param {Object} interaction - The Discord interaction object
 * @param {Object} d1 - The D1 database instance
 * @param {Object} env - The environment object containing DISCORD_BOT_TOKEN
 * @returns {Promise<Object|null>} - Error response if user doesn't have permissions, null if they do
 */
export async function checkAdminPermissions(interaction, d1, env) {
    const hasPermissions = await hasAdminPermissions(interaction, d1, env);
    if (!hasPermissions) {
        return {
            content: "❌ You don't have permission to use this command. This command requires an admin role or server owner status.",
            flags: 64
        };
    }
    return null;
} 