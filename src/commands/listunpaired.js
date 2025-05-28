export async function listUnpaired(d1, interaction) {
  const guildId = interaction.guild_id;

  try {
      console.log(`Fetching unpaired players for guild ${guildId}`);

      // Fetch all unpaired free agents
      const freeAgents = await d1.prepare(`
          SELECT username, timezone FROM free_agents WHERE guild_id = ?
      `).bind(guildId).all();

      if (!freeAgents || freeAgents.results.length === 0) {
          return { content: "🔍 No unpaired players found.", flags: 64 };
      }

      let response = `🎮 **Unpaired Free Agents:**\n`;
      freeAgents.results.forEach(agent => {
          response += `\n👤 **${agent.username}** - ${agent.timezone}`;
      });

      return { content: response, flags: 64 };

  } catch (error) {
      console.error("❌ ERROR: Failed to fetch unpaired players:", error);
      return { content: "❌ An error occurred while retrieving unpaired players. Please try again later.", flags: 64 };
  }
}
