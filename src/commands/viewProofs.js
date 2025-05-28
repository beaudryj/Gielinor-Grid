export async function viewProofs(d1, interaction) {
    const options = interaction.data.options;
    if (!options || options.length === 0) {
        return {
            content: "❌ Please specify a team name using `/view_proofs team_name:<name>`.",
            flags: 64
        };
    }

    const teamName = options.find(opt => opt.name === "team_name")?.value;
    if (!teamName) {
        return { content: "❌ Team name is required.", flags: 64 };
    }

    // Fetch team by name
    const teamData = await d1.prepare(`
        SELECT t.* FROM teams t
        WHERE t.team_name = ?
    `).bind(teamName).first();

    if (!teamData) {
        return { content: `❌ No team found with the name **"${teamName}"**.`, flags: 64 };
    }

    // Fetch team members
    const teamMembers = await d1.prepare(`
        SELECT user_id, timezone FROM team_members 
        WHERE team_id = ?
    `).bind(teamData.id).all();

    // Get team's completed squares with proofs
    const proofs = await d1.prepare(`
        SELECT tsc.proof_url, tsc.submitted_by, tsc.submitted_at, tsc.verified, tsc.verified_by, tsc.verified_at,
               bs.goal_name, bs.position_x, bs.position_y, bs.points
        FROM team_square_completions tsc
        JOIN bingo_squares bs ON tsc.square_id = bs.id
        WHERE tsc.team_id = ?
        ORDER BY tsc.submitted_at DESC
    `).bind(teamData.id).all();

    // Build response
    let response = `**Team: ${teamData.team_name}**\n`;
    response += `Game: ${teamData.game_name}\n\n`;

    if (proofs.results.length > 0) {
        response += "**📸 Proof Submissions:**\n";
        for (const proof of proofs.results) {
            response += `• [${proof.goal_name}](${proof.proof_url}) (${proof.position_x},${proof.position_y}) - ${proof.points} points\n`;
            response += `  Submitted by: <@${proof.submitted_by}> at ${new Date(proof.submitted_at).toLocaleString()}\n`;
            if (proof.verified) {
                response += `  ✅ Verified by: <@${proof.verified_by}> at ${new Date(proof.verified_at).toLocaleString()}\n`;
            } else {
                response += `  ⏳ Pending verification\n`;
            }
            response += "\n";
        }
    } else {
        response += "No proof submissions yet.";
    }

    return { content: response, flags: 64 };
}
