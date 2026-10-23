import { fileURLToPath } from 'node:url';

export const bundledAddonDirectory = fileURLToPath(new URL('../addon/godot_mcp_tool', import.meta.url));
