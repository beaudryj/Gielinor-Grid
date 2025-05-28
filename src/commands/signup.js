export async function handleSignup(d1, interaction) {
    const options = interaction.data.options;
    if (!options || options.length === 0) {
        return { content: "❌ You must specify a signup type: `join_team`, `create_team`, or `free_agent`.", flags: 64 };
    }

    const subcommand = options[0].name;
    console.log(`🛠️ Received signup type: ${subcommand}`);

    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;
    const username = interaction.member.user.username;

    // Get the active game and its team configuration
    const game = await d1.prepare(`
        SELECT id, name, min_team_size, max_team_size, max_teams FROM bingo_games 
        WHERE guild_id = ? AND active = true
    `).bind(guildId).first();

    if (!game) {
        return { content: "❌ No active game found. Please wait for a game to be created.", flags: 64 };
    }

    // Check if max teams has been reached
    const teamCount = await d1.prepare(`
        SELECT COUNT(*) as count FROM teams 
        WHERE guild_id = ? AND game_id = ?
    `).bind(guildId, game.id).first();

    if (teamCount.count >= game.max_teams) {
        return { content: `❌ Maximum number of teams (${game.max_teams}) has been reached for this game.`, flags: 64 };
    }

    // Get timezone and game name
    const subOptions = options[0]?.options || [];
    const gameName = subOptions.find(opt => opt.name === "game")?.value;
    const memberTimezone = subOptions.find(opt => opt.name === "timezone")?.value;

    if (!gameName) {
        return { content: "❌ You must specify which game you want to sign up for.", flags: 64 };
    }

    if (!memberTimezone) {
        return { content: "❌ Your timezone is required.", flags: 64 };
    }

    // Check if the user is already in a team
    const existingTeam = await d1.prepare(`
        SELECT t.id FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND t.game_id = ? AND (t.captain_id = ? OR tm.user_id = ?)
    `).bind(guildId, game.id, userId, userId).first();

    if (existingTeam) {
        return { content: "❌ You are already part of a team for this game.", flags: 64 };
    }

    // Create Team
    if (subcommand === "create_team") {
        const teamName = subOptions.find(opt => opt.name === "team_name")?.value;
        
        if (!teamName) {
            return { content: "❌ Team name is required.", flags: 64 };
        }

        // Check if team name is already taken
        const existingTeamName = await d1.prepare(`
            SELECT id FROM teams 
            WHERE guild_id = ? AND game_id = ? AND team_name = ?
        `).bind(guildId, game.id, teamName).first();

        if (existingTeamName) {
            return { content: "❌ This team name is already taken.", flags: 64 };
        }

        // Create team with captain
        const result = await d1.prepare(`
            INSERT INTO teams (guild_id, game_id, team_name, type, captain_id, captain_timezone)
            VALUES (?, ?, ?, 'team', ?, ?)
        `).bind(guildId, game.id, teamName, userId, memberTimezone).run();

        // Add captain as a member of the team
        await d1.prepare(`
            INSERT INTO team_members (team_id, user_id, timezone)
            VALUES (?, ?, ?)
        `).bind(result.meta.last_row_id, userId, memberTimezone).run();

        // If an active game is running, auto-join the team to the event
        await d1.prepare(`
            INSERT INTO game_participants (game_id, team_id)
            VALUES (?, ?)
        `).bind(game.id, result.meta.last_row_id).run();

        return { content: `✅ Team **"${teamName}"** has been created for game **"${gameName}"** and joined the event! You can now invite other players to join.`, flags: 64 };
    }

    // Join Team
    if (subcommand === "join_team") {
        const teamName = subOptions.find(opt => opt.name === "team_name")?.value;
        
        if (!teamName) {
            return { content: "❌ Team name is required.", flags: 64 };
        }

        // Get team and current size
        const team = await d1.prepare(`
            SELECT t.id, t.team_name, COUNT(tm.id) as current_size
            FROM teams t
            LEFT JOIN team_members tm ON t.id = tm.team_id
            WHERE t.guild_id = ? AND t.game_id = ? AND t.team_name = ?
            GROUP BY t.id
        `).bind(guildId, game.id, teamName).first();

        if (!team) {
            return { content: "❌ Team not found.", flags: 64 };
        }

        if (team.current_size >= game.max_team_size) {
            return { content: `❌ Team **"${teamName}"** is full (max ${game.max_team_size} members).`, flags: 64 };
        }

        // Add member to team
        await d1.prepare(`
            INSERT INTO team_members (team_id, user_id, timezone)
            VALUES (?, ?, ?)
        `).bind(team.id, userId, memberTimezone).run();

        return { content: `✅ **${username}** has joined team **"${teamName}"** for game **"${gameName}"**!`, flags: 64 };
    }

    // Free Agent Signup
    if (subcommand === "free_agent") {
        const existingFreeAgent = await d1.prepare(`
            SELECT user_id FROM free_agents 
            WHERE guild_id = ? AND game_id = ? AND user_id = ?
        `).bind(guildId, game.id, userId).first();

        if (existingFreeAgent) {
            return { content: "⚠️ You are already in the Free Agent pool for this game!", flags: 64 };
        }

        // Check if there are any teams that need members
        const availableTeam = await d1.prepare(`
            SELECT t.id, t.team_name, COUNT(tm.id) as current_size
            FROM teams t
            LEFT JOIN team_members tm ON t.id = tm.team_id
            WHERE t.guild_id = ? AND t.game_id = ?
            GROUP BY t.id
            HAVING current_size < ?
            LIMIT 1
        `).bind(guildId, game.id, game.max_team_size).first();

        if (availableTeam) {
            // Join existing team
            await d1.prepare(`
                INSERT INTO team_members (team_id, user_id, timezone)
                VALUES (?, ?, ?)
            `).bind(availableTeam.id, userId, memberTimezone).run();

            return { content: `✅ **${username}** has joined team **"${availableTeam.team_name}"** for game **"${gameName}"**!`, flags: 64 };
        }

        // If no available teams, add to free agents
        await d1.prepare(`
            INSERT INTO free_agents (user_id, username, timezone, guild_id, game_id) 
            VALUES (?, ?, ?, ?, ?)
        `).bind(userId, username, memberTimezone, guildId, game.id).run();

        return { content: `⚠️ No available teams for game **"${gameName}"**. You've been added to the waiting list.`, flags: 64 };
    }

    return { content: "❌ Invalid signup type.", flags: 64 };
}
