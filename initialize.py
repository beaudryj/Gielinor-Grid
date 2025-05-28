import os
import requests
import json
import urllib.parse

# Load environment variables
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_APP_ID = os.getenv("DISCORD_APP_ID")

DISCORD_INTERACTION_URL = "https://bingo.example.com"

if not DISCORD_BOT_TOKEN or not DISCORD_APP_ID:
    response = {
        "success": False,
        "error": "Missing required environment variables: DISCORD_BOT_TOKEN or DISCORD_APP_ID"
    }
    print(json.dumps(response, indent=2))
    exit(1)

# Helper function to define game parameter consistently
def get_game_parameter():
    return {
        "name": "game",
        "description": "Name of the bingo game",
        "type": 3,  # STRING type
        "required": True,
        "autocomplete": True  # Enable autocomplete for game selection
    }

# Define bot commands
COMMANDS = [
    {
        "name": "bingo",
        "description": "Play and manage OSRS bingo games",
        "options": [
            {
                "name": "create_game",
                "description": "Create a new OSRS bingo game",
                "type": 1,  # SUB_COMMAND
                "options": [
                    {
                        "name": "name",
                        "description": "Name of the bingo game",
                        "type": 3,  # STRING
                        "required": True
                    },
                    {
                        "name": "max_teams",
                        "description": "Maximum number of teams allowed",
                        "type": 4,  # INTEGER
                        "required": True,
                        "min_value": 1,
                        "max_value": 100
                    },
                    {
                        "name": "min_team_size",
                        "description": "Minimum players per team",
                        "type": 4,  # INTEGER
                        "required": True,
                        "min_value": 1,
                        "max_value": 10
                    },
                    {
                        "name": "max_team_size",
                        "description": "Maximum players per team",
                        "type": 4,  # INTEGER
                        "required": True,
                        "min_value": 1,
                        "max_value": 999
                    },
                    {
                        "name": "start_month",
                        "description": "Start month",
                        "type": 3,  # STRING
                        "required": True,
                        "choices": [
                            {"name": "January", "value": "01"},
                            {"name": "February", "value": "02"},
                            {"name": "March", "value": "03"},
                            {"name": "April", "value": "04"},
                            {"name": "May", "value": "05"},
                            {"name": "June", "value": "06"},
                            {"name": "July", "value": "07"},
                            {"name": "August", "value": "08"},
                            {"name": "September", "value": "09"},
                            {"name": "October", "value": "10"},
                            {"name": "November", "value": "11"},
                            {"name": "December", "value": "12"}
                        ]
                    },
                    {
                        "name": "start_day",
                        "description": "Start day",
                        "type": 4,  # INTEGER
                        "required": True,
                        "min_value": 1,
                        "max_value": 31
                    },
                    {
                        "name": "start_year",
                        "description": "Start year",
                        "type": 4,  # INTEGER type
                        "required": True,
                        "min_value": 2000,
                        "max_value": 3000
                    },
                    {
                        "name": "end_month",
                        "description": "End month",
                        "type": 3,  # STRING
                        "required": True,
                        "choices": [
                            {"name": "January", "value": "01"},
                            {"name": "February", "value": "02"},
                            {"name": "March", "value": "03"},
                            {"name": "April", "value": "04"},
                            {"name": "May", "value": "05"},
                            {"name": "June", "value": "06"},
                            {"name": "July", "value": "07"},
                            {"name": "August", "value": "08"},
                            {"name": "September", "value": "09"},
                            {"name": "October", "value": "10"},
                            {"name": "November", "value": "11"},
                            {"name": "December", "value": "12"}
                        ]
                    },
                    {
                        "name": "end_day",
                        "description": "End day",
                        "type": 4,  # INTEGER
                        "required": True,
                        "min_value": 1,
                        "max_value": 31
                    },
                    {
                        "name": "end_year",
                        "description": "End year",
                        "type": 4,  # INTEGER type
                        "required": True,
                        "min_value": 2000,
                        "max_value": 3000
                    },
                    {
                        "name": "description",
                        "description": "Description of the bingo game",
                        "type": 3,  # STRING
                        "required": False
                    },
                    {
                        "name": "size",
                        "description": "Board size (3-10)",
                        "type": 4,  # INTEGER
                        "required": False,
                        "min_value": 3,
                        "max_value": 10
                    }
                ]
            },
            {
                "name": "add_square",
                "description": "Add a square to the bingo board",
                "type": 1,
                "options": [
                    get_game_parameter(),
                    {
                        "name": "goal",
                        "description": "Goal to achieve (e.g., 'Get a Fire cape')",
                        "type": 3,
                        "required": True
                    },
                    {
                        "name": "points",
                        "description": "Points for completing this goal",
                        "type": 4,
                        "required": True,
                        "min_value": 1
                    }
                ]
            },
            {
                "name": "view",
                "description": "View a bingo board (defaults to your team's board in current game)",
                "type": 1,
                "options": [
                    get_game_parameter(),
                    {
                        "name": "team",
                        "description": "Team to view (admin only, leave empty to view your own team)",
                        "type": 3,
                        "required": True,
                        "autocomplete": True
                    }
                ]
            },
            {
                "name": "submit",
                "description": "Submit proof for completing a square",
                "type": 1,
                "options": [
                    get_game_parameter(),
                    {
                        "name": "square",
                        "description": "Which square did you complete? (e.g., '1,1' for top-left)",
                        "type": 3,
                        "required": True,
                        "autocomplete": True
                    },
                    {
                        "name": "image",
                        "description": "Screenshot or image showing your completion",
                        "type": 11,  # ATTACHMENT type
                        "required": True
                    }
                ]
            },
            {
                "name": "verify",
                "description": "Verify a square completion",
                "type": 1,
                "options": [
                    get_game_parameter(),
                    {
                        "name": "team",
                        "description": "Team name",
                        "type": 3,
                        "required": True,
                        "autocomplete": True
                    },
                    {
                        "name": "square",
                        "description": "Which square to verify?",
                        "type": 3,
                        "required": True,
                        "autocomplete": True
                    }
                ]
            },
            {
                "name": "end_game",
                "description": "End a bingo game",
                "type": 1,
                "options": [
                    get_game_parameter(),
                    {"name": "winner_team", "type": 3, "description": "Team that won the game", "required": True, "autocomplete": True}
                ]
            },
            {
                "name": "list_games",
                "description": "List all bingo games",
                "type": 1,
                "options": [
                    {"name": "all", "type": 5, "description": "Show all games (not just the most recent 10)", "required": False}
                ]
            },
            {
                "name": "join",
                "description": "Join an active bingo game with your team",
                "type": 1,
                "options": [
                    get_game_parameter()
                ]
            },
            {
                "name": "view_square",
                "description": "View all submissions for a specific square",
                "type": 1,
                "options": [
                    {"name": "game", "type": 3, "description": "Game name", "required": True, "autocomplete": True},
                    {"name": "team", "type": 3, "description": "Team name", "required": True, "autocomplete": True},
                    {"name": "square", "type": 3, "description": "Square (position or name)", "required": True, "autocomplete": True}
                ]
            }
        ]
    },
    {
        "name": "signup",
        "description": "Sign up for the event by creating a team, joining a team, or as a free agent.",
        "options": [
            {
                "name": "create_team",
                "description": "Create a new team.",
                "type": 1,  # Subcommand
                "options": [
                    get_game_parameter(),
                    {
                        "name": "team_name",
                        "description": "Enter your team name",
                        "type": 3,
                        "required": True,
                        "autocomplete": True
                    },
                    {
                        "name": "timezone",
                        "description": "Your time zone (e.g., GMT, PST, EST)",
                        "type": 3,
                        "required": True
                    }
                ]
            },
            {
                "name": "join_team",
                "description": "Join an existing team.",
                "type": 1,  # Subcommand
                "options": [
                    get_game_parameter(),
                    {
                        "name": "team_name",
                        "description": "Name of the team to join",
                        "type": 3,
                        "required": True,
                        "autocomplete": True
                    },
                    {
                        "name": "timezone",
                        "description": "Your time zone (e.g., GMT, PST, EST)",
                        "type": 3,
                        "required": True
                    }
                ]
            },
            {
                "name": "free_agent",
                "description": "Sign up as a free agent and wait for a team to join.",
                "type": 1,  # Subcommand
                "options": [
                    get_game_parameter(),
                    {
                        "name": "timezone",
                        "description": "Your time zone (e.g., GMT, PST, EST)",
                        "type": 3,
                        "required": True
                    }
                ]
            }
        ]
    },
    {"name": "myteam", "description": "Check your assigned team."},
    {"name": "listunpaired", "description": "View all free agents waiting for pairing."},
    {"name": "leave_team", "description": "Leave your current signup or team."},
    {"name": "list_teams", "description": "View all registered teams."},
    {"name": "help", "description": "Show bot help."},
    {
        "name": "invite",
        "description": "Get the bot's invite link"
    },
    {
        "name": "add_team_member",
        "description": "Add a member to your team.",
        "options": [
            {
                "name": "member",
                "description": "Mention the member to add",
                "type": 6,  # USER type
                "required": True
            },
            {
                "name": "timezone",
                "description": "Member's time zone (e.g., GMT, PST, EST)",
                "type": 3,
                "required": True
            }
        ]
    },
    {
        "name": "setup",
        "description": "One-time setup command to populate guild data.",
        "default_member_permissions": "8"  # Administrator permission
    },
    {
        "name": "admin",
        "description": "Manage admin roles for the bot.",
        "default_member_permissions": "8",  # Administrator permission
        "options": [
            {
                "name": "add_role",
                "description": "Add a role as admin.",
                "type": 1,  # Subcommand
                "options": [
                    {
                        "name": "role",
                        "description": "The role to add as admin.",
                        "type": 8,  # ROLE type
                        "required": True
                    }
                ]
            },
            {
                "name": "remove_role",
                "description": "Remove a role from admin.",
                "type": 1,  # Subcommand
                "options": [
                    {
                        "name": "role",
                        "description": "The role to remove from admin.",
                        "type": 8,  # ROLE type
                        "required": True
                    }
                ]
            },
            {
                "name": "list_roles",
                "description": "List all admin roles.",
                "type": 1  # Subcommand
            }
        ]
    }
]

# API endpoints
DISCORD_API_BASE = "https://discord.com/api/v10"
COMMANDS_URL = f"{DISCORD_API_BASE}/applications/{DISCORD_APP_ID}/commands"

# Function to register commands
def register_commands():
    headers = {
        "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
        "Content-Type": "application/json"
    }
    
    response = requests.put(COMMANDS_URL, headers=headers, json=COMMANDS)

    if response.status_code in [200, 201]:
        return {
            "success": True,
            "message": "Successfully registered commands!",
            "commands": COMMANDS
        }
    else:
        return {
            "success": False,
            "error": f"Failed to register commands: {response.status_code}",
            "response": response.text
        }

# Function to generate bot invite link
def generate_invite_link():
    BASE_URL = "https://discord.com/oauth2/authorize"
    SCOPES = ["bot", "applications.commands"]
    PERMISSIONS = 2147485696  # Admin-level permissions, adjust as needed

    query_params = {
        "client_id": DISCORD_APP_ID,
        "scope": " ".join(SCOPES),
        "permissions": str(PERMISSIONS)
    }

    return f"{BASE_URL}?{urllib.parse.urlencode(query_params)}"

# Run script
if __name__ == "__main__":
    command_response = register_commands()
    invite_url = generate_invite_link()

    final_response = {
        "success": command_response["success"],
        "commands_status": command_response,
        "invite_url": invite_url
    }

    print(json.dumps(final_response, indent=2))
