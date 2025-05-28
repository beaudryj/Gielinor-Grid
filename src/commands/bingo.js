import { checkAdminPermissions } from '../utils/permissions';

/**
 * Create a new bingo game
 */
async function createGame(d1, interaction, options, env) {
    const permissionError = await checkAdminPermissions(interaction, d1, env);
    if (permissionError) return {
        type: 4,
        data: permissionError
    };

    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;
    
    // Extract team config directly from options
    const maxTeams = options.find(opt => opt.name === "max_teams")?.value || 99;
    const minTeamSize = options.find(opt => opt.name === "min_team_size")?.value || 1;
    const maxTeamSize = options.find(opt => opt.name === "max_team_size")?.value || 10;
    // Debug log for team config values
    console.log({ maxTeamSize, minTeamSize, maxTeams });

    // Extract other options
    const name = options.find(opt => opt.name === "name")?.value;
    const description = options.find(opt => opt.name === "description")?.value || "";
    const boardSize = options.find(opt => opt.name === "size")?.value || 5; // Default to 5x5

    // Extract dates directly from options
    const startMonth = options.find(opt => opt.name === "start_month")?.value;
    const startDay = options.find(opt => opt.name === "start_day")?.value;
    const startYear = options.find(opt => opt.name === "start_year")?.value;
    const endMonth = options.find(opt => opt.name === "end_month")?.value;
    const endDay = options.find(opt => opt.name === "end_day")?.value;
    const endYear = options.find(opt => opt.name === "end_year")?.value;

    if (!name || !startMonth || !startDay || !startYear || !endMonth || !endDay || !endYear) {
        return {
            type: 4,
            data: {
                content: "❌ Game name and dates are required.",
                flags: 64
            }
        };
    }

    if (boardSize < 3 || boardSize > 10) {
        return {
            type: 4,
            data: {
                content: "❌ Board size must be between 3 and 10.",
                flags: 64
            }
        };
    }

    try {
        // Parse dates
        const parseDate = (month, day, year) => {
            if (!month || !day || !year) {
                throw new Error("Invalid date format");
            }
            
            const date = new Date(year, month - 1, day);
            if (isNaN(date.getTime())) {
                throw new Error("Invalid date");
            }
            return date;
        };

        const startDate = parseDate(startMonth, startDay, startYear);
        const endDate = parseDate(endMonth, endDay, endYear);

        // Validate dates
        if (endDate < startDate) {
            return {
                type: 4,
                data: {
                    content: "❌ End date must be after start date.",
                    flags: 64
                }
            };
        }

        // Create the game in the database
        const gameResult = await d1.prepare(`
            INSERT INTO bingo_games (
                guild_id, name, description, start_date, end_date, 
                created_by, board_size, max_teams, min_team_size, max_team_size
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            guildId,
            name,
            description,
            startDate.toISOString(),
            endDate.toISOString(),
            userId,
            boardSize,
            maxTeams,
            minTeamSize,
            maxTeamSize
        ).run();

        // Create Discord scheduled event
        const eventData = {
            name: `🎮 ${name}`,
            description: description || `Join us for a ${boardSize}x${boardSize} OSRS bingo game!`,
            scheduled_start_time: startDate.toISOString(),
            scheduled_end_time: endDate.toISOString(),
            privacy_level: 2, // GUILD_ONLY
            entity_type: 3, // EXTERNAL
            entity_metadata: {
                location: "Discord" // Required for external events
            }
        };

        try {
            const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/scheduled-events`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData)
            });

            if (!response.ok) {
                console.error('Failed to create Discord event:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: await response.text(),
                    requestData: eventData
                });
            }
        } catch (eventError) {
            console.error('Error creating Discord event:', eventError);
        }

        return {
            type: 4,
            data: {
                content: `✅ Created ${boardSize}x${boardSize} bingo game "${name}"!\n\n` +
                    `📅 Start: ${startDate.toLocaleDateString()}\n` +
                    `📅 End: ${endDate.toLocaleDateString()}\n\n` +
                    `👥 Team Settings:\n` +
                    `• Min Team Size: ${minTeamSize}\n` +
                    `• Max Team Size: ${maxTeamSize}\n` +
                    `• Max Teams: ${maxTeams}\n\n` +
                    `Use \`/bingo add_square\` to add squares to the game.`,
                flags: 64
            }
        };
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return {
                type: 4,
                data: {
                    content: `❌ A game named "${name}" already exists.`,
                    flags: 64
                }
            };
        }
        if (error.message === "Invalid date format" || error.message === "Invalid date") {
            return {
                type: 4,
                data: {
                    content: "❌ Invalid date format. Please use the date picker.",
                    flags: 64
                }
            };
        }
        console.error('Error creating game:', error);
        return {
            type: 4,
            data: {
                content: "❌ An error occurred while creating the game. Please try again.",
                flags: 64
            }
        };
    }
}

/**
 * List all bingo games
 */
async function listGames(d1, interaction, options = []) {
    // Check for 'all' option
    let showAll = false;
    if (options && options.length > 0) {
        const allOpt = options.find(opt => opt.name === 'all');
        showAll = !!(allOpt && (allOpt.value === true || allOpt.value === 'true'));
    }
    const limitClause = showAll ? '' : 'LIMIT 10';
    const games = await d1.prepare(`
        SELECT 
            bg.name, bg.description, bg.start_date, bg.end_date, bg.active, 
            bg.board_size, bg.max_teams, bg.min_team_size, bg.max_team_size,
            bg.winner_team_id,
            (SELECT COUNT(*) FROM game_participants gp WHERE gp.game_id = bg.id) as team_count,
            bg.winner_team_name,
            bg.winner_team_members
        FROM bingo_games bg
        LEFT JOIN teams t ON bg.winner_team_id = t.id
        WHERE bg.guild_id = ?
        ORDER BY bg.start_date DESC
        ${limitClause}
    `).bind(interaction.guild_id).all();
    if (!games || games.results.length === 0) {
        return {
            type: 4,
            data: {
                content: "📋 No bingo games found.",
                flags: 64
            }
        };
    }
    let response = `🎮 **Bingo Games:**${showAll ? '' : ' (showing most recent 10)'}\n\n`;
    games.results.forEach(game => {
        let status;
        if (game.active) {
            status = "🟢 Active";
        } else {
            status = "🟣 Completed";
        }
        response += `**${game.name}** (${status})\n`;
        if (game.description) response += `📝 ${game.description}\n`;
        response += `📅 ${new Date(game.start_date).toLocaleDateString()} to ${new Date(game.end_date).toLocaleDateString()}\n`;
        response += `📐 ${game.board_size}x${game.board_size} Board\n`;
        if (game.active) {
            response += `👥 Teams: ${game.team_count}/${game.max_teams} (${game.min_team_size}-${game.max_team_size} players)\n`;
        } else {
            response += `👥 Final Teams: ${game.team_count}\n`;
        }
        if (!game.active && game.winner_team_name) {
            response += `🏆 Winner: **${game.winner_team_name}**`;
            if (game.winner_team_members) {
                try {
                    const members = JSON.parse(game.winner_team_members);
                    if (Array.isArray(members) && members.length > 0) {
                        response += `\n👤 Members: ${members.join(", ")}`;
                    }
                } catch (e) {}
            }
            response += `\n`;
        }
        response += `\n`;
    });
    return {
        type: 4,
        data: {
            content: response,
            flags: 64
        }
    };
}

/**
 * Add a square to a bingo game
 */
async function addSquare(d1, interaction, options) {
    const gameName = options.find(opt => opt.name === "game")?.value;
    const goalName = options.find(opt => opt.name === "goal")?.value;
    const points = options.find(opt => opt.name === "points")?.value;

    if (!gameName || !goalName || !points) {
        return {
            type: 4,
            data: {
                content: "❌ Missing required parameters.",
                flags: 64
            }
        };
    }

    // Get game info
    const game = await d1.prepare(`
        SELECT id, board_size FROM bingo_games 
        WHERE guild_id = ? AND name = ? AND active = true
    `).bind(interaction.guild_id, gameName).first();

    if (!game) {
        return {
            type: 4,
            data: {
                content: `❌ Active game "${gameName}" not found.`,
                flags: 64
            }
        };
    }

    // Find the next available position
    const squares = await d1.prepare(`
        SELECT position_x, position_y 
        FROM bingo_squares 
        WHERE game_id = ?
        ORDER BY position_y, position_x
    `).bind(game.id).all();

    let nextX = 0;
    let nextY = 0;
    const occupiedPositions = new Set(
        squares.results.map(s => `${s.position_x},${s.position_y}`)
    );

    // Find first available position
    for (let y = 0; y < game.board_size; y++) {
        for (let x = 0; x < game.board_size; x++) {
            if (!occupiedPositions.has(`${x},${y}`)) {
                nextX = x;
                nextY = y;
                break;
            }
        }
        if (!occupiedPositions.has(`${nextX},${nextY}`)) break;
    }

    if (occupiedPositions.has(`${nextX},${nextY}`)) {
        return {
            type: 4,
            data: {
                content: "❌ The board is full. No more squares can be added.",
                flags: 64
            }
        };
    }

    try {
        await d1.prepare(`
            INSERT INTO bingo_squares (game_id, position_x, position_y, goal_name, points)
            VALUES (?, ?, ?, ?, ?)
        `).bind(game.id, nextX, nextY, goalName, points).run();

        return {
            type: 4,
            data: {
                content: `✅ Added square "${goalName}" (${points} points) at position (${nextX}, ${nextY})!`,
                flags: 64
            }
        };
    } catch (error) {
        console.error('Error adding square:', error);
        return {
            type: 4,
            data: {
                content: "❌ An error occurred while adding the square. Please try again.",
                flags: 64
            }
        };
    }
}

// Helper to upload an image to Cloudflare Images
async function uploadToCloudflareImages(imageUrl, contentType, env) {
    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) throw new Error('Failed to fetch image from Discord');
    const imageBuffer = await imageResp.arrayBuffer();
    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer], { type: contentType }), 'proof.png');
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_IMAGES_ACCOUNT_ID}/images/v1`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.CF_IMAGES_API_TOKEN}`,
        },
        body: formData
    });
    const data = await resp.json();
    if (!data.success) throw new Error('Failed to upload to Cloudflare Images: ' + (data.errors?.[0]?.message || 'Unknown error'));
    return data.result.variants[0];
}

/**
 * Submit proof for completing a square
 */
async function submitProof(d1, interaction, options, env) {
    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;
    // Extract options from array (Discord sends as array, not object)
    const gameName = options.find(opt => opt.name === "game")?.value;
    const squareValue = options.find(opt => opt.name === "square")?.value;
    // Accept both 'proof' and 'image' as the attachment field
    let proofAttachment = options.find(opt => opt.name === "proof");
    if (!proofAttachment) {
        proofAttachment = options.find(opt => opt.name === "image");
    }
    if (!gameName || !squareValue || !proofAttachment) {
        return {
            type: 4,
            data: {
                content: "❌ Game name, square, and proof image are required.",
                flags: 64
            }
        };
    }
    // Get the actual URL from the Discord attachment
    const discordAttachment = interaction.data.resolved?.attachments?.[proofAttachment.value];
    const discordUrl = discordAttachment?.url;
    const contentType = discordAttachment?.content_type;
    if (!discordUrl) {
        return {
            type: 4,
            data: {
                content: "❌ Could not process the uploaded image. Please try again.",
                flags: 64
            }
        };
    }
    // Validate that it's an image
    if (!contentType?.startsWith('image/')) {
        return {
            type: 4,
            data: {
                content: "❌ The uploaded file must be an image (PNG, JPG, GIF, etc.).",
                flags: 64
            }
        };
    }
    // Upload to Cloudflare Images
    let proofUrl;
    try {
        proofUrl = await uploadToCloudflareImages(discordUrl, contentType, env);
    } catch (err) {
        return {
            type: 4,
            data: {
                content: `❌ Failed to upload image to Cloudflare Images: ${err.message}`,
                flags: 64
            }
        };
    }
    try {
        // Get the game first
        const game = await d1.prepare(`
            SELECT id, active FROM bingo_games 
            WHERE guild_id = ? AND name = ?
        `).bind(guildId, gameName).first();

        if (!game) {
            return {
                type: 4,
                data: {
                    content: "❌ Game not found.",
                    flags: 64
                }
            };
        }

        if (!game.active) {
            return {
                type: 4,
                data: {
                    content: "❌ This game has ended.",
                    flags: 64
                }
            };
        }

        // Get the user's team and check if they're participating in this game
        const teamParticipation = await d1.prepare(`
            SELECT t.id, t.team_name, t.captain_id
            FROM teams t
            JOIN game_participants gp ON t.id = gp.team_id
            JOIN team_members tm ON t.id = tm.team_id
            WHERE gp.game_id = ? 
            AND tm.user_id = ?
            AND t.guild_id = ?
        `).bind(game.id, userId, guildId).first();

        if (!teamParticipation) {
            // Check if user is in a team at all
            const userTeam = await d1.prepare(`
                SELECT t.id, t.team_name
                FROM teams t
                JOIN team_members tm ON t.id = tm.team_id
                WHERE t.guild_id = ?
                AND tm.user_id = ?
            `).bind(guildId, userId).first();

            if (!userTeam) {
                return {
                    type: 4,
                    data: {
                        content: "❌ You need to be part of a team to submit proofs!\n\n" +
                            "Here's how to get started:\n" +
                            "1️⃣ Create or join a team using one of these commands:\n" +
                            "• `/signup partner` - Create a team with a specific partner\n" +
                            "• `/signup random_team` - Get matched with another player\n" +
                            "• `/signup free_agent` - Sign up to be matched later\n\n" +
                            "2️⃣ Once you have a team, join the bingo game:\n" +
                            `• \`/bingo join game:"${gameName}"\`\n\n` +
                            "Need help? Use `/help` for more information!",
                        flags: 64
                    }
                };
            } else {
                return {
                    type: 4,
                    data: {
                        content: `❌ Your team "${userTeam.team_name}" isn't participating in this game yet!\n\n` +
                            "Here's what you need to do:\n" +
                            `• Use \`/bingo join game:"${gameName}"\` to join the game with your team\n` +
                            "• Once joined, you can view your board with `/bingo view`\n" +
                            "• Then you can start submitting proofs for completed squares!\n\n" +
                            "Need help? Use `/help` for more information!",
                        flags: 64
                    }
                };
            }
        }

        // Parse the square coordinates
        const [x, y] = squareValue.split(',').map(Number);

        // Get the square
        const square = await d1.prepare(`
            SELECT id, goal_name FROM bingo_squares 
            WHERE game_id = ? AND position_x = ? AND position_y = ?
        `).bind(game.id, x, y).first();

        if (!square) {
            return {
                type: 4,
                data: {
                    content: "❌ Square not found.",
                    flags: 64
                }
            };
        }

        // Check if this square is already verified for the team
        const existingVerified = await d1.prepare(`
            SELECT id FROM team_square_completions
            WHERE team_id = ? AND square_id = ? AND verified = true
        `).bind(teamParticipation.id, square.id).first();

        if (existingVerified) {
            return {
                type: 4,
                data: {
                    content: "❌ This square has already been verified for your team.",
                    flags: 64
                }
            };
        }

        // Check for existing submissions by this user for this square
        const existingUserSubmissions = await d1.prepare(`
            SELECT COUNT(*) as count FROM team_square_completions
            WHERE team_id = ? AND square_id = ? AND submitted_by = ?
        `).bind(teamParticipation.id, square.id, userId).first();

        // Get total submissions for this square
        const totalSubmissions = await d1.prepare(`
            SELECT COUNT(*) as count FROM team_square_completions
            WHERE team_id = ? AND square_id = ?
        `).bind(teamParticipation.id, square.id).first();

        // Insert new submission
        await d1.prepare(`
            INSERT INTO team_square_completions (team_id, square_id, proof_url, submitted_by)
            VALUES (?, ?, ?, ?)
        `).bind(teamParticipation.id, square.id, proofUrl, userId).run();

        // Get updated submission count
        const newTotalSubmissions = await d1.prepare(`
            SELECT COUNT(*) as count FROM team_square_completions
            WHERE team_id = ? AND square_id = ?
        `).bind(teamParticipation.id, square.id).first();

        let response = `✅ Submitted proof for "${square.goal_name}"!\n`;
        response += `📸 Image URL: ${proofUrl}\n\n`;
        
        if (existingUserSubmissions.count > 0) {
            response += `📝 This is your ${existingUserSubmissions.count + 1}${getOrdinalSuffix(existingUserSubmissions.count + 1)} submission for this square.\n`;
        }
        
        response += `📊 Total submissions for this square: ${newTotalSubmissions.count}\n`;
        response += `An admin will verify your completion soon.`;

        return {
            type: 4,
            data: {
                content: response,
                flags: 64
            }
        };
    } catch (error) {
        console.error('Error submitting proof:', error);
        return {
            type: 4,
            data: {
                content: "❌ An error occurred while submitting your proof. Please try again.",
                flags: 64
            }
        };
    }
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinalSuffix(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Verify a square completion
 */
async function verifySquare(d1, interaction, options, env) {
    const permissionError = await checkAdminPermissions(interaction, d1, env);
    if (permissionError) return {
        type: 4,
        data: permissionError
    };

    const gameName = options.find(opt => opt.name === "game")?.value;
    const teamName = options.find(opt => opt.name === "team")?.value;
    const squareValue = options.find(opt => opt.name === "square")?.value;

    if (!gameName || !teamName || !squareValue) {
        return {
            type: 4,
            data: {
                content: "❌ Game name, team name, and square are required.",
                flags: 64
            }
        };
    }

    // Parse the square coordinates
    const [x, y] = squareValue.split(',').map(Number);

    // Get completion info
    const completion = await d1.prepare(`
        SELECT tsc.id, tsc.verified, t.team_name, bs.goal_name
        FROM team_square_completions tsc
        JOIN teams t ON tsc.team_id = t.id
        JOIN bingo_squares bs ON tsc.square_id = bs.id
        JOIN bingo_games g ON bs.game_id = g.id
        WHERE t.team_name = ? AND g.name = ? AND bs.position_x = ? AND bs.position_y = ?
        AND g.guild_id = ? AND g.active = true
    `).bind(teamName, gameName, x, y, interaction.guild_id).first();

    if (!completion) {
        return {
            type: 4,
            data: {
                content: `❌ No proof submission found for this square in active game "${gameName}".`,
                flags: 64
            }
        };
    }

    if (completion.verified) {
        return {
            type: 4,
            data: {
                content: `❌ This square has already been verified.`,
                flags: 64
            }
        };
    }

    // Mark as verified
    await d1.prepare(`
        UPDATE team_square_completions 
        SET verified = true, verified_by = ?, verified_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).bind(interaction.member.user.id, completion.id).run();

    return {
        type: 4,
        data: {
            content: `✅ Verified "${completion.goal_name}" for team "${completion.team_name}"!`,
            flags: 64
        }
    };
}

/**
 * End a bingo game
 */
async function endGame(d1, interaction, options, env) {
    const permissionError = await checkAdminPermissions(interaction, d1, env);
    if (permissionError) return {
        type: 4,
        data: permissionError
    };
    const gameName = options.find(opt => opt.name === "game")?.value;
    const winnerTeamName = options.find(opt => opt.name === "winner_team")?.value;
    if (!gameName) {
        return {
            type: 4,
            data: {
                content: "❌ Game name is required.",
                flags: 64
            }
        };
    }
    try {
        // Get game info
        const game = await d1.prepare(`SELECT id FROM bingo_games WHERE guild_id = ? AND name = ? AND active = true`).bind(interaction.guild_id, gameName).first();
        if (!game) {
            return {
                type: 4,
                data: {
                    content: `❌ Active game \"${gameName}\" not found.`,
                    flags: 64
                }
            };
        }
        let winnerTeamId = null;
        let winnerTeamMembers = [];
        let winnerTeamNameToStore = null;
        if (winnerTeamName) {
            const winnerTeam = await d1.prepare(`SELECT id, team_name FROM teams WHERE guild_id = ? AND team_name = ? AND game_id = ?`).bind(interaction.guild_id, winnerTeamName, game.id).first();
            if (!winnerTeam) {
                return {
                    type: 4,
                    data: {
                        content: `❌ Winner team \"${winnerTeamName}\" not found for this game.`,
                        flags: 64
                    }
                };
            }
            winnerTeamId = winnerTeam.id;
            winnerTeamNameToStore = winnerTeam.team_name;
            // Fetch members (including captain)
            const members = await d1.prepare(`SELECT user_id FROM team_members WHERE team_id = ?`).bind(winnerTeamId).all();
            winnerTeamMembers = members.results.map(m => `<@${m.user_id}>`);
        }
        // End the game and set winner_team_name and winner_team_members
        await d1.prepare(`
            UPDATE bingo_games 
            SET active = false, 
                ended_by = ?, 
                ended_at = CURRENT_TIMESTAMP,
                winner_team_id = NULL,
                winner_team_name = ?,
                winner_team_members = ?
            WHERE id = ?
        `).bind(interaction.member.user.id, winnerTeamNameToStore, JSON.stringify(winnerTeamMembers), game.id).run();
        // Delete all team_square_completions for this game
        await d1.prepare(`
            DELETE FROM team_square_completions
            WHERE square_id IN (SELECT id FROM bingo_squares WHERE game_id = ?)
        `).bind(game.id).run();
        // Delete all team_members for teams in this game
        await d1.prepare(`
            DELETE FROM team_members
            WHERE team_id IN (SELECT id FROM teams WHERE game_id = ?)
        `).bind(game.id).run();
        // Delete all game_participants for this game
        await d1.prepare(`
            DELETE FROM game_participants WHERE game_id = ?
        `).bind(game.id).run();
        // Delete all teams for this game
        await d1.prepare(`
            DELETE FROM teams WHERE game_id = ?
        `).bind(game.id).run();
        return {
            type: 4,
            data: {
                content: `✅ Game \"${gameName}\" has been ended. All teams and completions have been removed.${winnerTeamName ? ` Winner: ${winnerTeamName}` : ''}`,
                flags: 64
            }
        };
    } catch (error) {
        console.error('Error ending game:', error);
        return {
            type: 4,
            data: {
                content: "❌ An error occurred while ending the game. Please try again.",
                flags: 64
            }
        };
    }
}

/**
 * Get the current active game for a guild
 */
export async function getCurrentGame(d1, guildId) {
    const game = await d1.prepare(`
        SELECT id, name, board_size, description, start_date, end_date,
               max_teams, min_team_size, max_team_size
        FROM bingo_games 
        WHERE guild_id = ? AND active = true
        ORDER BY start_date DESC
        LIMIT 1
    `).bind(guildId).first();
    return game;
}

/**
 * Join a bingo game with your team
 */
async function joinGame(d1, interaction, options) {
    const guildId = interaction.guild_id;
    const userId = interaction.member.user.id;
    const gameName = options.find(opt => opt.name === "game")?.value;

    if (!gameName) {
        return {
            type: 4,
            data: {
                content: "❌ Game name is required.",
                flags: 64
            }
        };
    }

    try {
        // Get the game first
        const game = await d1.prepare(`
            SELECT id, active, max_teams, min_team_size, max_team_size
            FROM bingo_games 
            WHERE guild_id = ? AND name = ?
        `).bind(guildId, gameName).first();

        if (!game) {
            return {
                type: 4,
                data: {
                    content: "❌ Game not found.",
                    flags: 64
                }
            };
        }

        if (!game.active) {
            return {
                type: 4,
                data: {
                    content: "❌ This game has ended.",
                    flags: 64
                }
            };
        }

        // Get the user's team
        const team = await d1.prepare(`
            SELECT t.id, t.team_name, COUNT(tm.user_id) as member_count
            FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            WHERE t.guild_id = ?
            AND EXISTS (
                SELECT 1 FROM team_members tm2 
                WHERE tm2.team_id = t.id AND tm2.user_id = ?
            )
            GROUP BY t.id
        `).bind(guildId, userId).first();

        if (!team) {
            return {
                type: 4,
                data: {
                    content: "❌ You are not part of any team. Use `/signup` to create or join a team first.",
                    flags: 64
                }
            };
        }

        // Check team size constraints
        if (team.member_count < game.min_team_size) {
            return {
                type: 4,
                data: {
                    content: `❌ Your team needs at least ${game.min_team_size} members to join this game.\n` +
                        `Current team size: ${team.member_count}\n` +
                        `Use \`/add_team_member\` to add more members.`,
                    flags: 64
                }
            };
        }

        if (team.member_count > game.max_team_size) {
            return {
                type: 4,
                data: {
                    content: `❌ Your team exceeds the maximum size of ${game.max_team_size} members.\n` +
                        `Current team size: ${team.member_count}\n` +
                        `Use \`/leave_team\` to remove members.`,
                    flags: 64
                }
            };
        }

        // Check if team is already in the game
        const existing = await d1.prepare(`
            SELECT 1 FROM game_participants
            WHERE game_id = ? AND team_id = ?
        `).bind(game.id, team.id).first();

        if (existing) {
            return {
                type: 4,
                data: {
                    content: "❌ Your team is already participating in this game.",
                    flags: 64
                }
            };
        }

        // Check if game has reached max teams
        const teamCount = await d1.prepare(`
            SELECT COUNT(*) as count
            FROM game_participants
            WHERE game_id = ?
        `).bind(game.id).first();

        if (teamCount.count >= game.max_teams) {
            return {
                type: 4,
                data: {
                    content: `❌ This game has reached its maximum of ${game.max_teams} teams.`,
                    flags: 64
                }
            };
        }

        // Add team to the game
        await d1.prepare(`
            INSERT INTO game_participants (game_id, team_id)
            VALUES (?, ?)
        `).bind(game.id, team.id).run();

        return {
            type: 4,
            data: {
                content: `✅ Team "${team.team_name}" has joined the game "${gameName}"!\nUse \`/bingo view\` to see your board.`,
                flags: 64
            }
        };
    } catch (error) {
        console.error('Error joining game:', error);
        return {
            type: 4,
            data: {
                content: "❌ An error occurred while joining the game. Please try again.",
                flags: 64
            }
        };
    }
}

/**
 * Handle the bingo command
 */
export async function handleBingoCommand(d1, interaction, options, env) {
    console.log('Bingo command options:', JSON.stringify(options));
    
    if (!options || options.length === 0) {
        return {
            type: 4,
            data: {
                content: "❌ Please specify a bingo command: `create_game`, `add_square`, `view`, `submit`, `verify`, `end_game`, or `list_games`.",
                flags: 64
            }
        };
    }

    const subcommand = options[0]?.name;
    console.log('Subcommand:', subcommand);
    
    const subcommandOptions = options[0]?.options || [];
    console.log('Subcommand options:', JSON.stringify(subcommandOptions));

    // Get current active game if not specified
    let currentGame = null;
    if (subcommand !== 'list_games' && subcommand !== 'create_game') {
        currentGame = await getCurrentGame(d1, interaction.guild_id);
        if (!currentGame) {
            return {
                type: 4,
                data: {
                    content: "❌ No active game found. Create a game first or specify a game name.",
                    flags: 64
                }
            };
        }
    }

    // Add game name to options if not provided
    if (subcommand !== 'list_games' && subcommand !== 'create_game' && !subcommandOptions.find(opt => opt.name === 'game')) {
        subcommandOptions.push({
            name: 'game',
            value: currentGame.name
        });
    }

    let response;
    switch (subcommand) {
        case "create_game":
            response = await createGame(d1, interaction, subcommandOptions, env);
            break;
        case "add_square":
            response = await addSquare(d1, interaction, subcommandOptions);
            break;
        case "view":
            response = await viewBoard(d1, interaction, subcommandOptions, env);
            break;
        case "submit":
            response = await submitProof(d1, interaction, subcommandOptions, env);
            break;
        case "verify":
            response = await verifySquare(d1, interaction, subcommandOptions, env);
            break;
        case "end_game":
            response = await endGame(d1, interaction, subcommandOptions, env);
            break;
        case "list_games":
            response = await listGames(d1, interaction, subcommandOptions);
            break;
        case "join":
            response = await joinGame(d1, interaction, subcommandOptions);
            break;
        case "view_square":
            response = await viewSquare(d1, interaction, subcommandOptions, env);
            break;
        default:
            console.log('Invalid subcommand:', subcommand);
            response = {
                content: "❌ Invalid subcommand. Use `create_game`, `add_square`, `view`, `submit`, `verify`, `end_game`, or `list_games`.",
                flags: 64
            };
    }

    // Ensure response is properly formatted
    if (!response.type) {
        response = {
            type: 4,
            data: response
        };
    }

    return response;
}

/**
 * View the board of a bingo game
 */
async function viewBoard(d1, interaction, options, env) {
    const gameName = options.find(opt => opt.name === "game")?.value;
    const teamName = options.find(opt => opt.name === "team")?.value;
    if (!gameName || !teamName) {
        return {
            type: 4,
            data: {
                content: "❌ Game name and team are required.",
                flags: 64
            }
        };
    }
    try {
        // Get game info
        const game = await d1.prepare(`
            SELECT id, board_size, description, start_date, end_date,
                   max_teams, min_team_size, max_team_size
            FROM bingo_games 
            WHERE guild_id = ? AND name = ? AND active = true
        `).bind(interaction.guild_id, gameName).first();
        if (!game) {
            return {
                type: 4,
                data: {
                    content: `❌ Active game \"${gameName}\" not found.`,
                    flags: 64
                }
            };
        }
        // Get team info
        const team = await d1.prepare(`
            SELECT id FROM teams WHERE guild_id = ? AND team_name = ?
        `).bind(interaction.guild_id, teamName).first();
        if (!team) {
            return {
                type: 4,
                data: {
                    content: `❌ Team \"${teamName}\" not found.`,
                    flags: 64
                }
            };
        }
        // Get squares
        const squares = await d1.prepare(`
            SELECT id, position_x, position_y, goal_name, points
            FROM bingo_squares 
            WHERE game_id = ?
        `).bind(game.id).all();
        // Get completions for this team
        const completions = await d1.prepare(`
            SELECT tsc.id, tsc.verified, tsc.proof_url, tsc.submitted_by, tsc.submitted_at, bs.id as square_id
            FROM team_square_completions tsc
            JOIN bingo_squares bs ON tsc.square_id = bs.id
            WHERE tsc.team_id = ? AND bs.game_id = ?
        `).bind(team.id, game.id).all();
        // Create a map of square_id to completion info (latest submission)
        const squareStatus = new Map();
        completions.results.forEach(c => {
            if (!squareStatus.has(c.square_id) || c.verified) {
                squareStatus.set(c.square_id, {
                    status: c.verified ? '✅' : '❌',
                    proofUrl: c.proof_url,
                    submittedBy: c.submitted_by,
                    submittedAt: c.submitted_at
                });
            }
        });
        // Create a grid representation
        let response = `🎮 **${game.name}**\n\n`;
        if (game.description) response += `📝 ${game.description}\n\n`;
        response += `📅 ${new Date(game.start_date).toLocaleDateString()} to ${new Date(game.end_date).toLocaleDateString()}\n\n`;
        response += `👥 Teams: ${game.max_teams} teams, ${game.min_team_size}-${game.max_team_size} players\n\n`;
        for (let y = 0; y < game.board_size; y++) {
            for (let x = 0; x < game.board_size; x++) {
                const square = squares.results.find(s => s.position_x === x && s.position_y === y);
                if (square) {
                    const completion = squareStatus.get(square.id);
                    const status = completion?.status || '⬜';
                    response += `[${status} ${square.goal_name} (${square.points}★)] `;
                } else {
                    response += `[Empty] `;
                }
            }
            response += '\n';
        }
        return {
            type: 4,
            data: {
                content: response,
                flags: 64
            }
        };
    } catch (error) {
        console.error('Error viewing board:', error);
        return {
            type: 4,
            data: {
                content: "❌ An error occurred while viewing the board. Please try again.",
                flags: 64
            }
        };
    }
}

// Handler for /bingo view_square
async function viewSquare(d1, interaction, options, env) {
    try {
        const guildId = interaction.guild_id;
        const gameName = options.find(opt => opt.name === "game")?.value;
        const squareValue = options.find(opt => opt.name === "square")?.value;
        const teamName = options.find(opt => opt.name === "team")?.value;
        if (!gameName || !squareValue || !teamName) {
            return {
                type: 4,
                data: {
                    content: "❌ Game name, team, and square are required.",
                    flags: 64
                }
            };
        }
        // Get the game
        const game = await d1.prepare(`SELECT id, board_size FROM bingo_games WHERE guild_id = ? AND name = ?`).bind(guildId, gameName).first();
        if (!game) {
            return {
                type: 4,
                data: { content: `❌ Game \"${gameName}\" not found.`, flags: 64 }
            };
        }
        // Get the team
        const team = await d1.prepare(`SELECT id FROM teams WHERE guild_id = ? AND team_name = ?`).bind(guildId, teamName).first();
        if (!team) {
            return {
                type: 4,
                data: { content: `❌ Team \"${teamName}\" not found.`, flags: 64 }
            };
        }
        // Parse the square coordinates
        let x, y;
        if (squareValue.includes(",")) {
            [x, y] = squareValue.split(",").map(Number);
        } else {
            // Try to find by goal name
            const sq = await d1.prepare(`SELECT position_x, position_y FROM bingo_squares WHERE game_id = ? AND goal_name = ?`).bind(game.id, squareValue).first();
            if (!sq) {
                return {
                    type: 4,
                    data: { content: `❌ Square not found.`, flags: 64 }
                };
            }
            x = sq.position_x;
            y = sq.position_y;
        }
        // Get the square
        const square = await d1.prepare(`SELECT id, goal_name, points FROM bingo_squares WHERE game_id = ? AND position_x = ? AND position_y = ?`).bind(game.id, x, y).first();
        if (!square) {
            return {
                type: 4,
                data: { content: `❌ Square not found.`, flags: 64 }
            };
        }
        // Get all submissions for this square for the team
        const submissions = await d1.prepare(`SELECT tsc.* FROM team_square_completions tsc WHERE tsc.square_id = ? AND tsc.team_id = ?`).bind(square.id, team.id).all();
        let response = `**Submissions for square: ${square.goal_name} (${x+1},${y+1}) - ${square.points} points (Team: ${teamName})**\n`;
        if (submissions.results.length === 0) {
            response += "No submissions yet.";
        } else {
            for (const sub of submissions.results) {
                response += `• Submitted by <@${sub.submitted_by}> on ${new Date(sub.submitted_at).toLocaleString()}\n`;
                response += `  └ Proof: ${sub.proof_url}\n`;
                response += `  └ Status: ${sub.verified ? '✅ Verified' : '❌ Pending'}\n`;
                response += '\n';
            }
        }
        return {
            type: 4,
            data: { content: response, flags: 64 }
        };
    } catch (err) {
        console.error('Error in viewSquare:', err);
        return {
            type: 4,
            data: { content: "❌ An error occurred while processing your request.", flags: 64 }
        };
    }
}

// Export the new handler
export { viewSquare };