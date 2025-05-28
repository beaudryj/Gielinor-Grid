import { getHelpMessage } from "../utils/help.js";
import { checkAdminPermissions } from "../utils/permissions";

export async function handleHelpCommand(d1, interaction, env) {
    const permissionError = await checkAdminPermissions(interaction, d1, env);
    const isAdmin = permissionError === null;
    
    return getHelpMessage(isAdmin);
}
