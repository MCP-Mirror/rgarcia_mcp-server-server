import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

// Define the MCP server configuration schema
const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
});

const ConfigSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
});

type Config = z.infer<typeof ConfigSchema>;

export function determineRequiredSetups(config: Config): {
  needsPython: boolean;
  needsNode: boolean;
} {
  const commands = Object.values(config.mcpServers).map(
    (server) => server.command
  );
  return {
    needsPython: commands.some((cmd) => ["uvx", "python"].includes(cmd)),
    needsNode: commands.some((cmd) => ["node", "npx"].includes(cmd)),
  };
}

export function generateDockerfile(config: Config): string {
  const { needsPython, needsNode } = determineRequiredSetups(config);

  // Collect all npm packages that need to be installed
  const npmPackages = needsNode
    ? Object.values(config.mcpServers)
        .filter((server) => server.command === "npx")
        .map((server) => server.args[0])
    : [];

  let dockerfile = `FROM debian:bookworm-slim

WORKDIR /usr/app

RUN apt-get update && apt-get install -y curl wget unzip\n`;

  // Add Python/UV setup if needed
  if (needsPython) {
    dockerfile += `
# Install Python and UV
RUN apt-get install -y python3 python3-venv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:\$PATH"
RUN uv venv
ENV PATH="/venv/bin:\$PATH"\n`;
  }

  // Add Node.js setup if needed
  if (needsNode) {
    dockerfile += `
# Install Node.js and npm
RUN apt-get install -y nodejs npm\n`;

    // Add npm package installations if any
    if (npmPackages.length > 0) {
      dockerfile += `
# Pre-install npm packages
RUN npm install ${npmPackages.join(" ")}\n`;
    }
  }

  // Add the common parts with Bun installation
  dockerfile += `
# Install Bun
RUN curl -fsSL https://bun.sh/install | bash 
ENV PATH="/root/.bun/bin:\$PATH"

# Copy package files
COPY package*.json .
COPY bun.lockb .
RUN bun install

# Copy the application
COPY . .

ENTRYPOINT ["bun", "/usr/app/src/mcp-server-wrapper/mcp-server-wrapper.ts"]`;

  return dockerfile;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Usage: build-unikernel <config-file-path>");
    process.exit(1);
  }

  const configPath = args[0];
  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    const configJson = JSON.parse(configContent);
    const config = ConfigSchema.parse(configJson);

    // Validate that all commands are supported
    const unsupportedCommands = Object.values(config.mcpServers)
      .map((server) => server.command)
      .filter((cmd) => !["uvx", "python", "node", "npx"].includes(cmd));

    if (unsupportedCommands.length > 0) {
      console.error(
        `Error: Unsupported commands found: ${unsupportedCommands.join(", ")}`
      );
      process.exit(1);
    }

    const dockerfile = generateDockerfile(config);
    const outputPath = path.join(
      path.dirname(configPath),
      "Dockerfile.generated"
    );
    await fs.writeFile(outputPath, dockerfile);
    console.log(`Generated Dockerfile at: ${outputPath}`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Invalid configuration format:", error.errors);
    } else {
      console.error("Error:", error);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
