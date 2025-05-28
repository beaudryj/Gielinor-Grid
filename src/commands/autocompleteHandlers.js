// This file was renamed from autocompleteSignup.js to autocompleteHandlers.js to reflect its broader use for all autocomplete handlers. 

export async function handleGameAutocomplete(d1, interaction) {
    const focusedValue = interaction.data.options[0].options.find(opt => opt.focused)?.value || "";
    const guildId = interaction.guild_id;

    // Query active and pending games that match the partial name
    const games = await d1.prepare(`
        SELECT name, description 
        FROM bingo_games 
        WHERE guild_id = ? 
        AND active = true 
        AND name LIKE ? || '%'
        ORDER BY start_date DESC
        LIMIT 25
    `).bind(guildId, focusedValue).all();

    const choices = (games?.results || []).map(game => ({
        name: game.name + (game.description ? ` (${game.description})` : ""),
        value: game.name
    }));

    console.log("[handleGameAutocomplete] choices", choices);
    return { choices };
}

export async function autocompleteSignupTeamName(d1, interaction) {
    const focused = interaction.data.options[0]?.options?.find(opt => opt.focused);
    const partial = focused?.value?.toLowerCase() || "";
    const subOptions = interaction.data.options[0]?.options || [];
    const gameName = subOptions.find(opt => opt.name === "game")?.value;
    const guildId = interaction.guild_id;
    // const userId = interaction.member.user.id;

    if (!gameName) {
        return { choices: [] };
    }

    // Get the active game
    const game = await d1.prepare(`
        SELECT id, max_team_size FROM bingo_games
        WHERE guild_id = ? AND name = ?
    `).bind(guildId, gameName).first();

    if (!game) return { choices: [] };

    // Find all teams in this game
    const teams = await d1.prepare(`
        SELECT t.id, t.team_name, COUNT(tm.id) as current_size
        FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND t.game_id = ?
        GROUP BY t.id
        HAVING current_size < ?
    `).bind(guildId, game.id, game.max_team_size).all();

    // Show all teams matching the partial
    const availableTeams = [];
    for (const team of teams.results) {
        if (team.team_name.toLowerCase().includes(partial)) {
            availableTeams.push({ name: team.team_name, value: team.team_name });
        }
    }

    return { choices: availableTeams.slice(0, 25) }; // Discord max 25 choices
}

export async function autocompleteBingoViewTeam(d1, interaction) {
    const focused = interaction.data.options[0]?.options?.find(opt => opt.focused);
    const partial = focused?.value?.toLowerCase() || "";
    const subOptions = interaction.data.options[0]?.options || [];
    const gameName = subOptions.find(opt => opt.name === "game")?.value;
    const guildId = interaction.guild_id;

    if (!gameName) {
        return { choices: [] };
    }

    // Get the game
    const game = await d1.prepare(`
        SELECT id FROM bingo_games
        WHERE guild_id = ? AND name = ?
    `).bind(guildId, gameName).first();

    if (!game) return { choices: [] };

    // Get all teams that have joined this game (are in game_participants)
    const teams = await d1.prepare(`
        SELECT t.team_name
        FROM teams t
        JOIN game_participants gp ON t.id = gp.team_id
        WHERE t.guild_id = ? AND gp.game_id = ?
    `).bind(guildId, game.id).all();

    // Filter by partial match
    const choices = (teams.results || [])
        .filter(team => team.team_name.toLowerCase().includes(partial))
        .map(team => ({ name: team.team_name, value: team.team_name }));

    return { choices: choices.slice(0, 25) };
}

export async function autocompleteBingoSubmitSquare(d1, interaction) {
    const subOptions = interaction.data.options[0]?.options || [];
    const gameName = subOptions.find(opt => opt.name === "game")?.value;
    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;
    const focused = subOptions.find(opt => opt.focused);
    const partial = focused?.value?.toLowerCase() || "";

    console.log("[autocompleteBingoSubmitSquare]", { gameName, guildId, userId });

    if (!gameName) return { choices: [] };

    // Get the game
    const game = await d1.prepare(`
        SELECT id FROM bingo_games
        WHERE guild_id = ? AND name = ?
    `).bind(guildId, gameName).first();
    if (!game) {
        console.log("[autocompleteBingoSubmitSquare] No game found");
        return { choices: [] };
    }

    // Get the user's team
    const team = await d1.prepare(`
        SELECT t.id FROM teams t
        JOIN game_participants gp ON t.id = gp.team_id
        JOIN team_members tm ON t.id = tm.team_id
        WHERE t.guild_id = ? AND gp.game_id = ? AND tm.user_id = ?
    `).bind(guildId, game.id, userId).first();
    if (!team) {
        console.log("[autocompleteBingoSubmitSquare] No team found");
        return { choices: [] };
    }

    // Get all squares for this game
    const squares = await d1.prepare(`
        SELECT id, goal_name, position_x, position_y
        FROM bingo_squares
        WHERE game_id = ?
        ORDER BY position_y, position_x
    `).bind(game.id).all();

    console.log("[autocompleteBingoSubmitSquare] game_id", game.id);
    console.log("[autocompleteBingoSubmitSquare] squares", squares.results);

    // Format choices
    const choices = (squares.results || [])
        .filter(sq =>
            sq.goal_name.toLowerCase().includes(partial) ||
            `${sq.position_x},${sq.position_y}`.includes(partial)
        )
        .map(sq => ({
            name: `${sq.goal_name} (${sq.position_x + 1},${sq.position_y + 1})`,
            value: `${sq.position_x},${sq.position_y}`
        }));

    console.log("[autocompleteBingoSubmitSquare] choices", choices);

    return { choices: choices.slice(0, 25) };
}

export async function autocompleteBingoWinnerTeam(d1, interaction) {
    const focused = interaction.data.options[0]?.options?.find(opt => opt.focused);
    const partial = focused?.value?.toLowerCase() || "";
    const subOptions = interaction.data.options[0]?.options || [];
    const gameName = subOptions.find(opt => opt.name === "game")?.value;
    const guildId = interaction.guild_id;
    if (!gameName) {
        return { choices: [] };
    }
    // Get the game (active or inactive)
    const game = await d1.prepare(`SELECT id FROM bingo_games WHERE guild_id = ? AND name = ?`).bind(guildId, gameName).first();
    if (!game) return { choices: [] };
    // Get all teams for this game with at least 1 verified square
    const teams = await d1.prepare(`
        SELECT t.team_name
        FROM teams t
        JOIN team_square_completions tsc ON t.id = tsc.team_id
        WHERE t.game_id = ? AND t.guild_id = ? AND tsc.verified = 1
        GROUP BY t.id
        HAVING COUNT(tsc.id) > 0
    `).bind(game.id, guildId).all();
    const choices = (teams.results || [])
        .filter(team => team.team_name.toLowerCase().includes(partial))
        .map(team => ({ name: team.team_name, value: team.team_name }));
    return { choices: choices.slice(0, 25) };
} 