export async function getMyTeam(d1, interaction) {
    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;

    console.log(`Fetching team for user ${userId} in guild ${guildId}`);

    // Fetch the user's team
    const teamData = await d1.prepare(`
        SELECT t.* FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND (t.captain_id = ? OR tm.user_id = ?)
        LIMIT 1
    `).bind(guildId, userId, userId).first();

    if (!teamData) {
        return {
            content: "❌ You are not part of a team in this server. Use `/signup` to register.",
            flags: 64
        };
    }

    // Get team members
    const members = await d1.prepare(`
        SELECT user_id, timezone FROM team_members
        WHERE team_id = ?
    `).bind(teamData.id).all();

    // Get completed squares with proofs
    const proofs = await d1.prepare(`
        SELECT tsc.proof_url, bs.goal_name, bs.position_x, bs.position_y
        FROM team_square_completions tsc
        JOIN bingo_squares bs ON tsc.square_id = bs.id
        WHERE tsc.team_id = ?
    `).bind(teamData.id).all();

    // Build response
    let response = `🏆 **Your Team: "${teamData.team_name}"**\n👤 **Captain:** <@${teamData.captain_id}> (${teamData.captain_timezone})\n`;

    // Add members
    response += "👥 **Team Members:**\n";
    for (const member of members.results) {
        response += `• <@${member.user_id}> (${member.timezone})\n`;
    }

    // Add completed squares with proofs
    if (proofs.results.length > 0) {
        response += "\n✅ **Completed Squares:**\n";
        for (const proof of proofs.results) {
            response += `• [${proof.goal_name}](${proof.proof_url}) (${proof.position_x},${proof.position_y})\n`;
        }
    }

    response += `🔹 **Signup Type:** ${teamData.type.toUpperCase()}`;

    return { content: response, flags: 64 };
}
