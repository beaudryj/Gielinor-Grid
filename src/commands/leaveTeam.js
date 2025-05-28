export async function leaveTeam(d1, interaction) {
    const userId = interaction.member.user.id;
    const guildId = interaction.guild_id;

    // Get the active game
    const activeGame = await d1.prepare(`
        SELECT id, min_team_size FROM bingo_games 
        WHERE guild_id = ? AND active = true
    `).bind(guildId).first();

    if (!activeGame) {
        return { content: "❌ No active game found.", flags: 64 };
    }

    // Check if the user is a team captain
    const teamData = await d1.prepare(`
        SELECT t.*, COUNT(tm.id) as member_count
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND t.game_id = ? AND t.captain_id = ?
        GROUP BY t.id
    `).bind(guildId, activeGame.id, userId).first();

    if (teamData) {
        // If captain and team would be below min size after leaving, delete the team
        if (teamData.member_count < activeGame.min_team_size) {
            await d1.prepare(`DELETE FROM teams WHERE id = ?`).bind(teamData.id).run();
            return { content: `✅ You have left and **"${teamData.team_name}"** has been **disbanded** (team would be below minimum size).`, flags: 64 };
        }
        
        // If captain but team has enough members, transfer captaincy to first member
        const firstMember = await d1.prepare(`
            SELECT user_id, timezone FROM team_members 
            WHERE team_id = ? 
            ORDER BY joined_at ASC 
            LIMIT 1
        `).bind(teamData.id).first();

        if (firstMember) {
            await d1.prepare(`
                UPDATE teams 
                SET captain_id = ?, captain_timezone = ? 
                WHERE id = ?
            `).bind(firstMember.user_id, firstMember.timezone, teamData.id).run();

            await d1.prepare(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`).bind(teamData.id, firstMember.user_id).run();
            return { content: `✅ You have left **"${teamData.team_name}"**. Captaincy has been transferred to <@${firstMember.user_id}>.`, flags: 64 };
        }
    }

    // Check if the user is a team member
    const memberData = await d1.prepare(`
        SELECT t.* FROM teams t
        JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND t.game_id = ? AND tm.user_id = ?
    `).bind(guildId, activeGame.id, userId).first();

    if (memberData) {
        // Check if removing would make team too small
        const remainingCount = await d1.prepare(`
            SELECT COUNT(*) as count FROM team_members 
            WHERE team_id = ?
        `).bind(memberData.id).first();

        if (remainingCount.count < activeGame.min_team_size) {
            return { content: `❌ Cannot leave team as it would make the team too small (minimum ${activeGame.min_team_size} players required).`, flags: 64 };
        }

        // Remove member from team
        await d1.prepare(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`).bind(memberData.id, userId).run();
        return { content: `✅ You have left **"${memberData.team_name}"**. The team remains active.`, flags: 64 };
    }

    // Check if the user is a free agent
    const freeAgentData = await d1.prepare(`
        SELECT user_id FROM free_agents 
        WHERE guild_id = ? AND game_id = ? AND user_id = ?
    `).bind(guildId, activeGame.id, userId).first();

    if (freeAgentData) {
        await d1.prepare(`DELETE FROM free_agents WHERE guild_id = ? AND game_id = ? AND user_id = ?`).bind(guildId, activeGame.id, userId).run();
        return { content: `✅ You have been **removed from the Free Agent pool**.`, flags: 64 };
    }

    // User is not in any team or the free agent pool
    return { content: "⚠️ You are not currently part of any team or the Free Agent pool.", flags: 64 };
}
