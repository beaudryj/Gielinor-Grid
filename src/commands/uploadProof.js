export async function uploadProof(d1, interaction) {
    const userId = interaction.member.user.id;
    const guildId = interaction.guild_id;
    const options = interaction.data.options;

    console.log(`🔍 Processing uploadProof for user ${userId} in guild ${guildId}`);

    if (!options || options.length === 0) {
        console.error("❌ ERROR: No image attachment provided.");
        return { content: "❌ Please attach an image using this command.", flags: 64 };
    }

    // 🔍 **Find the image attachment**
    const attachmentOption = options.find(opt => opt.name === "image");
    if (!attachmentOption || !attachmentOption.value) {
        console.error("❌ ERROR: No valid image attachment found.");
        return { content: "❌ No image was provided. Please upload a valid image.", flags: 64 };
    }

    // **Extract the image URL from Discord's resolved attachments**
    const imageId = attachmentOption.value;
    const attachment = interaction.data.resolved?.attachments?.[imageId];
    
    if (!attachment || !attachment.url) {
        console.error("❌ ERROR: Could not resolve image URL.");
        return { content: "❌ Failed to retrieve image URL. Please try again.", flags: 64 };
    }

    // Validate image type and size
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(attachment.content_type)) {
        return { content: "❌ Invalid image type. Please upload a JPEG, PNG, GIF, or WebP image.", flags: 64 };
    }

    if (attachment.size > 10 * 1024 * 1024) { // 10MB limit
        return { content: "❌ Image is too large. Maximum size is 10MB.", flags: 64 };
    }

    console.log(`✅ Image validated: ${attachment.url}`);

    // 🔍 **Check if the user is in a team**
    const teamData = await d1.prepare(`
        SELECT t.*, g.name as game_name, g.id as game_id FROM teams t
        LEFT JOIN team_members tm ON t.id = tm.team_id
        JOIN bingo_games g ON t.game_id = g.id
        WHERE t.guild_id = ? AND (t.captain_id = ? OR tm.user_id = ?)
    `).bind(guildId, userId, userId).first();

    if (!teamData) {
        console.error(`❌ ERROR: User ${userId} is not in any team.`);
        return { content: "❌ You are not part of a team in this server. Use `/signup` to register first.", flags: 64 };
    }

    console.log(`✅ User is in team: ${teamData.team_name} (Type: ${teamData.type})`);

    // **Ensure `partner` & `solo_team` are allowed to upload proofs**
    if (teamData.type !== "partner" && teamData.type !== "solo_team") {
        console.error(`❌ ERROR: Team type "${teamData.type}" is not allowed to upload proofs.`);
        return { content: "❌ Invalid team type. Only solo and partner teams can upload proof.", flags: 64 };
    }

    try {
        // Fetch the image from Discord
        const imageResponse = await fetch(attachment.url);
        if (!imageResponse.ok) {
            throw new Error('Failed to fetch image from Discord');
        }
        const imageBuffer = await imageResponse.arrayBuffer();

        // Generate a structured filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedGameName = teamData.game_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const sanitizedTeamName = teamData.team_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const proofType = attachment.content_type.split('/')[1]; // jpeg, png, gif, webp
        const filename = `${sanitizedGameName}/${sanitizedTeamName}/proof-${timestamp}.${proofType}`;

        // Upload to Cloudflare Images
        const formData = new FormData();
        formData.append('file', new Blob([imageBuffer], { type: attachment.content_type }), filename);
        formData.append('metadata', JSON.stringify({
            game_id: teamData.game_id,
            game_name: teamData.game_name,
            team_id: teamData.id,
            team_name: teamData.team_name,
            uploaded_by: userId,
            uploaded_at: new Date().toISOString(),
            content_type: attachment.content_type,
            original_filename: attachment.filename,
            original_size: attachment.size
        }));

        const cfResponse = await fetch('https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.CF_IMAGES_API_TOKEN}`
            },
            body: formData
        });

        if (!cfResponse.ok) {
            const errorData = await cfResponse.json();
            throw new Error(`Cloudflare Images API error: ${errorData.errors?.[0]?.message || 'Unknown error'}`);
        }

        const cfResult = await cfResponse.json();
        const cfImageUrl = cfResult.result.variants[0]; // Get the first variant URL

        // Get the square ID from the options
        const squareOption = options.find(opt => opt.name === "square");
        if (!squareOption || !squareOption.value) {
            return { content: "❌ Please specify which square this proof is for.", flags: 64 };
        }

        // Parse the square position
        const [x, y] = squareOption.value.split(',').map(Number);
        
        // Get the square ID
        const square = await d1.prepare(`
            SELECT id FROM bingo_squares 
            WHERE game_id = ? AND position_x = ? AND position_y = ?
        `).bind(teamData.game_id, x, y).first();

        if (!square) {
            return { content: "❌ Invalid square position.", flags: 64 };
        }

        // Insert the proof into team_square_completions
        await d1.prepare(`
            INSERT INTO team_square_completions (
                team_id,
                square_id,
                proof_url,
                submitted_by
            ) VALUES (?, ?, ?, ?)
        `).bind(
            teamData.id,
            square.id,
            cfImageUrl,
            interaction.member.user.id
        ).run();

        console.log(`✅ Proof uploaded successfully for square "${square.id}"!`);

        return {
            content: `✅ Proof uploaded successfully for square "${square.id}"!`,
            flags: 64 // Private response so only the user sees it
        };
    } catch (error) {
        console.error("❌ ERROR: Failed to process proof image:", error);
        return { 
            content: "❌ An error occurred while processing the proof image. Please try again later.", 
            flags: 64 
        };
    }
}
