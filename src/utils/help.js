export function getHelpMessage(isAdmin) {
    let content = `
**🎮 Bingo Bot Commands**
📌 Use these commands to sign up and manage your team:

✅ **Signup Commands**
- \`/signup create_team game:<name> team_name:<n> timezone:<zone>\`  
  → Create a new team and become the team captain.  
- \`/signup join_team game:<name> team_name:<n> timezone:<zone>\`  
  → Join an existing team.  
- \`/signup free_agent game:<name> timezone:<zone>\`  
  → Join the free agent pool and wait for a team to join.  

❌ **Leave or Reset**
- \`/leave_team\`  
  → Leave your current team or cancel signup.

🔍 **Team Management**
- \`/myteam\`  
  → Check your team status.  
- \`/listunpaired\`  
  → View all free agents waiting for a team.  
- \`/list_teams\`  
  → View all registered teams.
- \`/add_team_member member:@user timezone:<zone>\`
  → Add a new member to your team

🎲 **Bingo Commands**
- \`/bingo list_games\`
  → List all bingo games
- \`/bingo view game:<name> team:<name>\`
  → View a team's bingo board
- \`/bingo submit game:<name> square:<x,y> proof:<image>\`
  → Submit proof for a bingo square
- \`/bingo join game:<name>\`
  → Join a bingo game with your team`;

    if (isAdmin) {
        content += `

👑 **Admin Commands**
- \`/admin add_role role:@role\`  
  → Add a role as admin.  
- \`/admin remove_role role:@role\`  
  → Remove a role from admin.  
- \`/admin list_roles\`  
  → List all admin roles.

🎲 **Admin Bingo Commands**
- \`/bingo create_game name:<n> max_teams:<n> min_team_size:<n> max_team_size:<n> start_month:<m> start_day:<d> start_year:<y> end_month:<m> end_day:<d> end_year:<y> description:<text> size:<n>\`
  → Create a new bingo game
- \`/bingo add_square game:<name> goal:<text> points:<n>\`
  → Add a square to the bingo board
- \`/bingo verify game:<name> team:<name> square:<x,y>\`
  → Verify a team's square completion
- \`/bingo end_game game:<name>\`
  → End a bingo game`;
    }

    content += `

ℹ️ **Help**
- \`/help\`  
  → Show this message.`;

    return {
        content,
        flags: 64 // Private response to the user
    };
} 