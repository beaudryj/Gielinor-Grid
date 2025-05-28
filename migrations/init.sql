-- Create guild_owners table
CREATE TABLE guild_owners (
    guild_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_roles table
CREATE TABLE admin_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role_name TEXT,
    added_by TEXT,
    PRIMARY KEY (guild_id, role_id),
    FOREIGN KEY (guild_id) REFERENCES guild_owners(guild_id) ON DELETE CASCADE
);

-- Create bingo_games table
CREATE TABLE bingo_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    active BOOLEAN DEFAULT true,
    board_size INTEGER DEFAULT 5,
    min_team_size INTEGER DEFAULT 1,
    max_team_size INTEGER DEFAULT 2,
    max_teams INTEGER DEFAULT 99,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    ended_by TEXT,
    ended_at TIMESTAMP,
    winner_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    winner_team_name TEXT,
    winner_team_members TEXT,
    FOREIGN KEY (guild_id) REFERENCES guild_owners(guild_id) ON DELETE CASCADE,
    UNIQUE(guild_id, name)
);

-- Create teams table
CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    team_name TEXT UNIQUE NOT NULL,
    type TEXT CHECK( type IN ('partner', 'random_team', 'team', 'solo_team') ) NOT NULL,
    captain_id TEXT NOT NULL,
    captain_timezone TEXT NOT NULL,
    game_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guild_owners(guild_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE SET NULL
);

-- Create team_members table
CREATE TABLE team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    timezone TEXT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    UNIQUE(team_id, user_id)
);

-- Create bingo_squares table
CREATE TABLE bingo_squares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    position_x INTEGER NOT NULL,
    position_y INTEGER NOT NULL,
    goal_name TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE CASCADE,
    UNIQUE(game_id, position_x, position_y)
);

-- Create game_participants table
CREATE TABLE game_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    UNIQUE(game_id, team_id)
);

-- Create team_square_completions table
CREATE TABLE team_square_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    square_id INTEGER NOT NULL,
    proof_url TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified BOOLEAN DEFAULT false,
    verified_by TEXT,
    verified_at TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (square_id) REFERENCES bingo_squares(id) ON DELETE CASCADE
);

-- Create free_agents table
CREATE TABLE free_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    timezone TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guild_id) REFERENCES guild_owners(guild_id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES bingo_games(id) ON DELETE CASCADE,
    UNIQUE(user_id, game_id)
);