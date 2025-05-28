# Gielinor Grid

A Discord bot for managing OSRS bingo events, built with Cloudflare Workers and Discord Interactions API.

## Overview

The Gielinor Grid bot allows Discord server members to participate in OSRS bingo events by:

- Creating and managing bingo games with custom board sizes
- Signing up as teams (with a partner or solo)
- Joining a pool of free agents for random team matching
- Submitting and verifying bingo square completions
- Tracking team progress and scores

The bot is deployed as a Cloudflare Worker with a D1 database for data storage.

## Features

- **Game Management**
  - Create new bingo games with custom board sizes (3x3 to 10x10)
  - Set game duration, team size limits, and maximum teams
  - Add custom bingo squares with point values
  - End games and declare winners
  - View active and past games

- **Team Management**
  - Create new teams with custom names
  - Join existing teams
  - Sign up as a free agent (to be matched with other free agents)
  - View your team information and progress
  - Leave your current team

- **Bingo Board Management**
  - Submit proof for completed bingo squares
  - Verify team submissions (admin only)
  - Track team progress and scores
  - View completed squares and remaining goals
  - View detailed square information

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (Cloudflare Workers CLI)
- A Discord bot token and application ID
- A Cloudflare account with:
  - Workers (Paid Plan) - Required for D1 Database and Cloudflare Images
  - D1 Database access
  - Cloudflare Images access

## Cloudflare Setup

1. Sign up for a [Cloudflare Workers Paid Plan](https://dash.cloudflare.com/?to=/:account/workers/plans)
   - Required for D1 Database and Cloudflare Images features
   - Current pricing: $5/month (includes 10M requests, 1GB D1 storage, and Images)

2. Enable Cloudflare Images:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Navigate to Images
   - Create an API token with Images permissions
   - Note your Account ID and API Token for the `.dev.vars` file

## Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" tab and click "Add Bot"
4. Under the "Bot" tab:
   - Enable "Message Content Intent"
   - Enable "Server Members Intent"
   - Enable "Presence Intent"
   - Copy the bot token (this is your `DISCORD_BOT_TOKEN`)
5. Go to the "General Information" tab:
   - Copy the "Application ID" (this is your `DISCORD_APP_ID` and `DISCORD_APPLICATION_ID`)
   - Copy the "Public Key" (this is your `DISCORD_PUBLIC_KEY`)
6. Go to the "OAuth2" tab:
   - Under "URL Generator", select the following scopes:
     - `bot`
     - `applications.commands`
   - Under "Bot Permissions", select:
     - "Administrator" (or customize as needed)
   - Copy the generated URL to invite the bot to your server

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/gielinor-grid.git
   cd gielinor-grid
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `wrangler.toml` file in the project root:
   ```toml
   name = "gielinor-grid"
   main = "src/server.js"
   compatibility_date = "2024-01-01"

   [[d1_databases]]
   binding = "DB_D1"
   database_name = "gielinor_grid_db"
   database_id = "your_database_id"

   [vars]
   DISCORD_BOT_TOKEN = "your_discord_bot_token"
   DISCORD_APP_ID = "your_discord_application_id"
   ```

4. Configure environment variables:
   Create a `.dev.vars` file in the project root with the following variables:
   ```
   DISCORD_PUBLIC_KEY=your_discord_public_key
   DISCORD_BOT_TOKEN=your_discord_bot_token
   DISCORD_APP_ID=your_discord_application_id
   DISCORD_APPLICATION_ID=your_discord_application_id
   CF_IMAGES_ACCOUNT_ID=your_cloudflare_images_account_id
   CF_IMAGES_API_TOKEN=your_cloudflare_images_api_token
   ```

## Setup

1. Create a D1 database in your Cloudflare account:
   ```bash
   wrangler d1 create gielinor_grid_db
   ```

2. Update the `wrangler.toml` file with your database ID from the previous step.

3. Apply database migrations:
   ```bash
   wrangler d1 migrations apply gielinor_grid_db --remote
   ```

4. Deploy the bot:
   ```bash
   wrangler deploy
   ```

5. Run the setup command in your Discord server:
   ```
   /setup
   ```
   This command will:
   - Initialize the bot for your server
   - Set up necessary permissions
   - Create required channels and roles

## Bot Commands

### Game Management
- `/bingo create_game name:<game_name> description:<description> start_month:<month> start_day:<day> start_year:<year> end_month:<month> end_day:<day> end_year:<year> size:<board_size> min_team_size:<size> max_team_size:<size> max_teams:<number>`  
  Create a new bingo game.
- `/bingo add_square game:<game_name> position_x:<x> position_y:<y> goal_name:<goal> points:<points>`  
  Add a square to the bingo board.
- `/bingo end_game game:<game_name> winner_team:<team_name>`  
  End a bingo game and declare a winner.
- `/bingo list_games [all]`  
  List all active and past games.

### Team Management
- `/signup create_team game:<game_name> team_name:<name> timezone:<zone>`  
  Create a new team.
- `/signup join_team game:<game_name> team_name:<name> timezone:<zone>`  
  Join an existing team.
- `/signup free_agent game:<game_name> timezone:<zone>`  
  Join the free agent pool and wait for a random team pairing.

### Team Information
- `/myteam`  
  Check your team status and progress.
- `/listunpaired`  
  View all free agents waiting for a team.
- `/list_teams`  
  View all registered teams.
- `/leave_team`  
  Leave your current team or cancel signup.

### Bingo Board
- `/bingo submit game:<game_name> square:<position> proof:<image>`  
  Submit proof for completing a bingo square.
- `/bingo verify game:<game_name> team:<team_name> square:<position>`  
  Verify a team's submission (admin only).
- `/bingo view game:<game_name> team:<team_name>`  
  View a team's progress on the bingo board.
- `/bingo view_square game:<game_name> team:<team_name> square:<position>`  
  View detailed information about a specific square.

### Admin Commands
- `/admin add_role @role`  
  Add an admin role for managing the bot.
- `/admin remove_role @role`  
  Remove an admin role.
- `/admin list_roles`  
  List all admin roles.

### Help
- `/help`  
  Show help information.

## Running Locally

1. Start the development server:
   ```bash
   wrangler dev
   ```

2. (Optional) Use Cloudflare Tunnel to expose your local server to the internet: 
   ```bash
   # Install cloudflared if you haven't already [chocolatey](https://chocolatey.org/install)
   # Windows (using chocolatey):
   choco install cloudflared
   # Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

   # Authenticate with Cloudflare
   cloudflared tunnel login

   # Create a tunnel
   cloudflared tunnel create gielinor-grid-dev

   # Configure the tunnel
   cloudflared tunnel route dns gielinor-grid-dev your-subdomain.yourdomain.com

   # Start the tunnel
   cloudflared tunnel run --url http://localhost:8787 gielinor-grid-dev
   ```

3. Update your Discord application's interaction endpoint URL to your Cloudflare Tunnel URL.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
