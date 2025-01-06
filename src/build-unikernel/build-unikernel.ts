import * as fs from "fs/promises";
import * as path from "path";
import { type Config, loadConfig } from "../lib/config";

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

export function generateDockerfile(
  config: Config,
  configContent: string
): string {
  const { needsPython, needsNode } = determineRequiredSetups(config);

  // Collect all packages that need to be installed
  const npmPackages = needsNode
    ? Object.values(config.mcpServers)
        .filter((server) => server.command === "npx")
        .map((server) => server.args[0])
    : [];
  const uvTools = needsPython
    ? Object.values(config.mcpServers)
        .filter((server) => server.command === "uvx")
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
ENV PATH="/root/.local/bin:$PATH"\n`;

    // Add UV tool installations if any
    if (uvTools.length > 0) {
      dockerfile += `
# Pre-install UV tools
RUN uv tool install ${uvTools.join(" ")}\n`;
    }
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

  // Add the common parts with Bun installation and embedded config
  dockerfile += `
# Install Bun
RUN curl -fsSL https://bun.sh/install | bash 
ENV PATH="/root/.bun/bin:$PATH"

# Copy package files
COPY package*.json .
COPY bun.lockb .
RUN bun install

# Copy the application
COPY . .

# Embed the config file
COPY <<'ENDCONFIG' /usr/app/config/mcp-config.json
${configContent}
ENDCONFIG

ENTRYPOINT ["bun", "/usr/app/src/mcp-server-wrapper/mcp-server-wrapper.ts", "-p", "3001", "/usr/app/config/mcp-config.json"]`;

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
    const configContent = await Bun.file(configPath).text();
    const config = await loadConfig(configPath);

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

    const dockerfile = generateDockerfile(config, configContent);
    const outputPath = path.join(
      path.dirname(configPath),
      "Dockerfile.generated"
    );
    await fs.writeFile(outputPath, dockerfile);
    console.log(`Generated Dockerfile at: ${outputPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
