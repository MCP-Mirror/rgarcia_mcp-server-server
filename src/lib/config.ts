import { z } from "zod";

// Define the MCP server configuration schema
export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
});

export const ConfigSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
});

export type Config = z.infer<typeof ConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export async function loadConfig(configPath: string): Promise<Config> {
  const configContent = await Bun.file(configPath).text();
  const configJson = JSON.parse(configContent);
  return ConfigSchema.parse(configJson);
}
