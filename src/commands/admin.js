import { checkAdminPermissions } from '../utils/permissions';

export async function handleAdminCommand(d1, interaction, env) {
    const options = interaction.data.options;
    if (!options || options.length === 0) {
        return { content: "❌ Please specify an admin command: `add_role`, `remove_role`, or `list_roles`.", flags: 64 };
    }

    const subcommand = options[0].name;
    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;

    // Check if user has admin permissions
    const permissionError = await checkAdminPermissions(interaction, d1, env);
    if (permissionError) return permissionError;

    switch (subcommand) {
        case "add_role": {
            const role = options[0].options?.find(opt => opt.name === "role")?.value;
            if (!role) {
                return { content: "❌ Please mention a role to add as admin.", flags: 64 };
            }

            const roleData = interaction.data.resolved?.roles?.[role];
            if (!roleData) {
                return { content: "❌ Could not find the specified role.", flags: 64 };
            }

            try {
                await d1.prepare(`
                    INSERT INTO admin_roles (guild_id, role_id, role_name, added_by)
                    VALUES (?, ?, ?, ?)
                `).bind(guildId, role, roleData.name, userId).run();

                return { content: `✅ Added <@&${role}> as an admin role!`, flags: 64 };
            } catch (error) {
                if (error.message.includes('UNIQUE constraint failed')) {
                    return { content: `❌ <@&${role}> is already an admin role.`, flags: 64 };
                }
                throw error;
            }
        }

        case "remove_role": {
            const role = options[0].options?.find(opt => opt.name === "role")?.value;
            if (!role) {
                return { content: "❌ Please mention a role to remove from admin.", flags: 64 };
            }

            const result = await d1.prepare(`
                DELETE FROM admin_roles WHERE guild_id = ? AND role_id = ?
            `).bind(guildId, role).run();

            if (result.meta.changes === 0) {
                return { content: `❌ <@&${role}> is not an admin role.`, flags: 64 };
            }

            return { content: `✅ Removed <@&${role}> from admin roles!`, flags: 64 };
        }

        case "list_roles": {
            const adminRoles = await d1.prepare(`
                SELECT role_id, role_name FROM admin_roles WHERE guild_id = ?
            `).bind(guildId).all();

            if (!adminRoles || adminRoles.results.length === 0) {
                return { content: "📋 No admin roles set. Only server administrators have access to admin commands.", flags: 64 };
            }

            let response = "📋 **Admin Roles:**\n";
            adminRoles.results.forEach(role => {
                response += `\n<@&${role.role_id}>`;
            });

            return { content: response, flags: 64 };
        }

        default:
            return { content: "❌ Invalid admin command.", flags: 64 };
    }
} 