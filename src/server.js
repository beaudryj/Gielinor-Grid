import { Router } from "itty-router";
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import { handleSignup } from "./commands/signup";
import { getMyTeam } from "./commands/myteam";
import { handleHelpCommand } from "./commands/help.js";
import { listUnpaired } from "./commands/listunpaired";
import { leaveTeam } from "./commands/leaveTeam";
import { viewProofs } from "./commands/viewProofs";
import { listTeams } from "./commands/listTeams";
import { handleAdminCommand } from "./commands/admin";
import { handleBingoCommand } from "./commands/bingo";
import { handleSetupCommand } from "./commands/setup";
import { handleInviteCommand } from "./commands/invite";
import { handleGameAutocomplete, autocompleteSignupTeamName, autocompleteBingoViewTeam, autocompleteBingoSubmitSquare, autocompleteBingoWinnerTeam } from "./commands/autocompleteHandlers.js";

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: { 
        "content-type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      },
    };
    super(jsonBody, init);
  }
}

const router = Router();

// Handle square autocomplete
async function handleSquareAutocomplete(d1, interaction) {
  const gameOption = interaction.data.options[0].options.find(opt => opt.name === "game");
  const focusedValue = interaction.data.options[0].options.find(opt => opt.focused)?.value?.toLowerCase() || "";
  
  if (!gameOption?.value) {
    return new JsonResponse({
      type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      data: { choices: [] }
    });
  }

  // Get the game ID first
  const game = await d1.prepare(`
    SELECT id FROM bingo_games 
    WHERE guild_id = ? AND name = ? AND active = true
  `).bind(interaction.guild_id, gameOption.value).first();

  if (!game) {
    return new JsonResponse({
      type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      data: { choices: [] }
    });
  }

  // Query squares for this game that match the partial goal name
  const squares = await d1.prepare(`
    SELECT position_x, position_y, goal_name, points
    FROM bingo_squares 
    WHERE game_id = ?
    AND LOWER(goal_name) LIKE '%' || ? || '%'
    ORDER BY position_y, position_x
    LIMIT 25
  `).bind(game.id, focusedValue).all();

  const choices = (squares?.results || []).map(square => ({
    name: `${square.goal_name} (${square.points} points) - Position ${square.position_x + 1},${square.position_y + 1}`,
    value: `${square.position_x},${square.position_y}`
  }));

  return new JsonResponse({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices }
  });
}

// Function to cache guild owner
async function cacheGuildOwner(d1, interaction, env) {
    try {
        // Check if we already have this guild's owner
        const existingOwner = await d1.prepare(`
            SELECT owner_id FROM guild_owners WHERE guild_id = ?
        `).bind(interaction.guild_id).first();

        if (!existingOwner) {
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

                console.log(`✅ Cached owner for guild: ${interaction.guild_id}`);
            }
        }
    } catch (error) {
        console.error(`❌ Failed to cache owner for guild ${interaction.guild_id}:`, error);
    }
}

router.post("/", async (request, env) => {
  const { isValid, interaction } = await verifyDiscordRequest(request, env);

  if (!isValid || !interaction) {
      return new Response("❌ Bad request signature.", { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
      return new JsonResponse({ type: InteractionResponseType.PONG });
  }

  // Handle autocomplete interactions
  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
    const focusedOption = interaction.data.options[0].options.find(opt => opt.focused);
    if (focusedOption?.name === "game") {
      return new JsonResponse({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: await handleGameAutocomplete(env.DB_D1, interaction)
      });
    }
    if (focusedOption?.name === "square") {
      return new JsonResponse({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: await autocompleteBingoSubmitSquare(env.DB_D1, interaction)
      });
    }
    if (focusedOption?.name === "team_name") {
      return new JsonResponse({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: await autocompleteSignupTeamName(env.DB_D1, interaction)
      });
    }
    if (focusedOption?.name === "team") {
      return new JsonResponse({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: await autocompleteBingoViewTeam(env.DB_D1, interaction)
      });
    }
    if (focusedOption?.name === "winner_team") {
      return new JsonResponse({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: await autocompleteBingoWinnerTeam(env.DB_D1, interaction)
      });
    }
    return new JsonResponse({
      type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
      data: { choices: [] }
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      // Cache guild owner if needed
      await cacheGuildOwner(env.DB_D1, interaction, env);

      const commandName = interaction.data.name.toLowerCase();
      let responseMessage;

      try {
          switch (commandName) {
              case "signup":
                  responseMessage = await handleSignup(env.DB_D1, interaction);
                  break;

              case "listunpaired":
                  responseMessage = await listUnpaired(env.DB_D1, interaction);
                  break;

              case "myteam":
                  responseMessage = await getMyTeam(env.DB_D1, interaction);
                  break;

              case "list_teams":
                  responseMessage = await listTeams(env.DB_D1, interaction);
                  break;

              case "leave_team":
                  responseMessage = await leaveTeam(env.DB_D1, interaction);
                  break;

              case "view_proofs":
                  responseMessage = await viewProofs(env.DB_D1, interaction);
                  break;

              case "help":
                  responseMessage = await handleHelpCommand(env.DB_D1, interaction, env);
                  break;

              case "invite":
                  responseMessage = await handleInviteCommand(env);
                  break;

              case "admin":
                  responseMessage = await handleAdminCommand(env.DB_D1, interaction, env);
                  break;

              case "bingo":
                  console.log('Handling bingo command with options:', JSON.stringify(interaction.data.options));
                  const bingoResponse = await handleBingoCommand(env.DB_D1, interaction, interaction.data.options, env);
                  return new JsonResponse(bingoResponse);

              case "setup":
                  responseMessage = await handleSetupCommand(env.DB_D1, interaction, env);
                  break;

              default:
                  responseMessage = { content: "❌ Unknown command.", flags: 64 };
                  break;
          }

          if (!responseMessage || typeof responseMessage !== "object") {
              console.log(`❌ ERROR: ${commandName} returned an invalid response.`);
              responseMessage = { content: "❌ An error occurred. Please try again later.", flags: 64 };
          }

          // Ensure response has content
          if (!responseMessage.content) {
              console.log(`❌ ERROR: ${commandName} response missing content.`);
              responseMessage = { content: "❌ An error occurred. Please try again later.", flags: 64 };
          }

      } catch (error) {
          console.log(`❌ ERROR: ${commandName} execution failed.`, error);
          responseMessage = { content: "❌ An error occurred while processing your request.", flags: 64 };
      }

      // Always wrap the response in the correct Discord interaction format
      return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: responseMessage
      });
  }

  return new JsonResponse({ error: "Unknown Type" }, { status: 400 });
});

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));

  return { interaction: JSON.parse(body), isValid: !!isValidRequest };
}

export default { fetch: router.fetch };
