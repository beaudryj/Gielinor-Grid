export async function addTeamMember(d1, interaction) {
    const options = interaction.data.options;
    if (!options || options.length === 0) {
        return { content: "❌ Please provide member details.", flags: 64 };
    }

    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;
    const newMemberId = options.find(opt => opt.name === "member")?.value;
    const newMemberTimezone = options.find(opt => opt.name === "timezone")?.value;

    if (!newMemberId || !newMemberTimezone) {
        return { content: "❌ Member and timezone are required.", flags: 64 };
    }

    // Get the active game and team configuration
    const activeGame = await d1.prepare(`
        SELECT id, min_team_size, max_team_size FROM bingo_games 
        WHERE guild_id = ? AND active = true
    `).bind(guildId).first();

    if (!activeGame) {
        return { content: "❌ No active game found.", flags: 64 };
    }

    // Get the user's team
    const team = await d1.prepare(`
        SELECT t.*, COUNT(tm.id) as member_count
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND t.game_id = ? AND t.captain_id = ?
        GROUP BY t.id
    `).bind(guildId, activeGame.id, userId).first();

    if (!team) {
        return { content: "❌ You are not a team captain.", flags: 64 };
    }

    // Check if the new member is already in a team
    const memberInTeam = await d1.prepare(`
        SELECT 1 FROM team_members 
        WHERE team_id IN (
            SELECT id FROM teams 
            WHERE guild_id = ? AND game_id = ?
        ) AND user_id = ?
    `).bind(guildId, activeGame.id, newMemberId).first();

    if (memberInTeam) {
        return { content: "❌ This member is already part of a team.", flags: 64 };
    }

    // Check if team is at max size
    if (team.member_count >= activeGame.max_team_size) {
        return { content: `❌ Team is already at maximum size (${activeGame.max_team_size} members).`, flags: 64 };
    }

    try {
        // Add the new member to the team
        await d1.prepare(`
            INSERT INTO team_members (team_id, user_id, timezone)
            VALUES (?, ?, ?)
        `).bind(team.id, newMemberId, newMemberTimezone).run();

        // If they were a free agent, remove them from the pool
        await d1.prepare(`
            DELETE FROM free_agents 
            WHERE guild_id = ? AND game_id = ? AND user_id = ?
        `).bind(guildId, activeGame.id, newMemberId).run();

        return { content: `✅ <@${newMemberId}> has been added to team **"${team.team_name}"**!`, flags: 64 };
    } catch (error) {
        console.error("Failed to add team member:", error);
        return { content: "❌ Failed to add team member. Please try again.", flags: 64 };
    }
} 