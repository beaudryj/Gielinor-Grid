export async function listTeams(d1, interaction) {
    const guildId = interaction.guild_id;

    // Get the active game
    const activeGame = await d1.prepare(`
        SELECT id, min_team_size, max_team_size FROM bingo_games 
        WHERE guild_id = ? AND active = true
    `).bind(guildId).first();

    if (!activeGame) {
        return { content: "❌ No active game found in this server.", flags: 64 };
    }

    // Fetch all teams in this guild with their members
    const teams = await d1.prepare(`
        SELECT t.*, COUNT(tm.id) as member_count
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND t.game_id = ?
        GROUP BY t.id
    `).bind(guildId, activeGame.id).all();

    // If no teams are found, return a structured response
    if (!teams || teams.results.length === 0) {
        return { content: "📭 No teams found in this server.", flags: 64 };
    }

    let response = `📋 **Teams in this Server (${activeGame.min_team_size}-${activeGame.max_team_size} players per team):**\n`;
    
    for (const team of teams.results) {
        // Get team members
        const members = await d1.prepare(`
            SELECT user_id, timezone FROM team_members 
            WHERE team_id = ?
        `).bind(team.id).all();

        response += `\n🏆 **${team.team_name}** (${team.member_count + 1}/${activeGame.max_team_size} players)\n`;
        response += `👤 Captain: <@${team.captain_id}> (${team.captain_timezone})\n`;
        
        if (members.results.length > 0) {
            response += `👥 Members:\n`;
            members.results.forEach(member => {
                response += `   • <@${member.user_id}> (${member.timezone})\n`;
            });
        }
        
        response += `\n`;
    }

    return { content: response, flags: 64 };
}
