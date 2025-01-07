import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { type Config, loadConfig } from "../lib/config";

async function createBuildDir(
  configPath: string,
  configContent: string
): Promise<string> {
  // Create a hash of the config content
  const hash = createHash("sha256")
    .update(configContent)
    .digest("hex")
    .slice(0, 8); // Use first 8 chars of hash

  // Create build directory name
  const buildDir = `./build-unikernel-${hash}`;

  // Create directory structure
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(path.join(buildDir, "unikernel"), { recursive: true });
  await fs.mkdir(path.join(buildDir, "unikernel", "analysis"), {
    recursive: true,
  });
  await fs.mkdir(path.join(buildDir, "unikernel", "analysis", "ldd-output"), {
    recursive: true,
  });
  await fs.mkdir(
    path.join(buildDir, "unikernel", "analysis", "strace-output"),
    { recursive: true }
  );

  return buildDir;
}

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

function generateInstrumentedDockerfile(
  config: Config,
  configContent: string,
  analysisType: "ldd" | "strace"
): string {
  const baseDockerfile = generateDockerfile(config, configContent);

  // Split the Dockerfile at the ENTRYPOINT
  const [baseContent] = baseDockerfile.split("ENTRYPOINT");

  if (analysisType === "ldd") {
    // Add analysis tools for ldd analysis
    return `${baseContent}
# Install analysis tools
RUN apt-get update && apt-get install -y libc-bin

# Create analysis scripts
COPY <<'ENDSCRIPT' /usr/app/analyze-binaries.sh
#!/bin/bash
set -e

analyze_binary() {
    local binary_name=\$1
    local output_file="/analysis/ldd-output/\${binary_name}.txt"
    if command -v \$binary_name &> /dev/null; then
        echo "Analyzing \${binary_name}..." > "\$output_file"
        # Run ldd with error handling
        if ! ldd \$(which \$binary_name) >> "\$output_file" 2>&1; then
            echo "Warning: ldd failed for \${binary_name}, trying with LD_TRACE_LOADED_OBJECTS=1" >> "\$output_file"
            # Fallback to using LD_TRACE_LOADED_OBJECTS if ldd fails
            LD_TRACE_LOADED_OBJECTS=1 \$(which \$binary_name) >> "\$output_file" 2>&1 || true
        fi
    fi
}

# Analyze each binary
analyze_binary "bun"
analyze_binary "node"
analyze_binary "python3"
analyze_binary "uv"

# Additional system information
echo "System information:" > /analysis/system-info.txt
uname -a >> /analysis/system-info.txt
cat /etc/os-release >> /analysis/system-info.txt
ENDSCRIPT

RUN chmod +x /usr/app/analyze-*.sh

VOLUME /analysis
ENTRYPOINT ["/bin/bash", "-c", "/usr/app/analyze-binaries.sh"]`;
  } else {
    // Add analysis tools for strace analysis
    return `${baseContent}
# Install analysis tools
RUN apt-get update && apt-get install -y strace

# Create analysis scripts
COPY <<'ENDSCRIPT' /usr/app/analyze-runtime.sh
#!/bin/bash
set -e

# Start the server with strace
strace -f -e trace=open,openat bun /usr/app/src/mcp-server-wrapper/mcp-server-wrapper.ts -p 3001 /usr/app/config/mcp-config.json 2> /analysis/strace-output/server.txt &
SERVER_PID=\$!

# Wait for server to start
sleep 2

# Run example client with strace
strace -f -e trace=open,openat bun /usr/app/src/mcp-server-wrapper/example-client/example-client.ts /usr/app/config/mcp-config.json 3001 2> /analysis/strace-output/client.txt

# Kill server
kill \$SERVER_PID || true
ENDSCRIPT

RUN chmod +x /usr/app/analyze-*.sh

VOLUME /analysis
ENTRYPOINT ["/bin/bash", "-c", "/usr/app/analyze-runtime.sh"]`;
  }
}

async function runAnalysis(
  buildDir: string,
  config: Config,
  configContent: string
) {
  // Generate both Dockerfiles
  const lddDockerfile = generateInstrumentedDockerfile(
    config,
    configContent,
    "ldd"
  );
  const straceDockerfile = generateInstrumentedDockerfile(
    config,
    configContent,
    "strace"
  );

  const lddPath = path.join(buildDir, "unikernel", "Dockerfile.ldd");
  const stracePath = path.join(buildDir, "unikernel", "Dockerfile.strace");

  await fs.writeFile(lddPath, lddDockerfile);
  await fs.writeFile(stracePath, straceDockerfile);

  const analysisDir = path.resolve(
    path.join(buildDir, "unikernel", "analysis")
  );

  // Run ldd analysis on x86_64
  const lddImageName = `mcp-analysis-ldd:${path.basename(buildDir)}`;
  console.log("Building ldd analysis container (x86_64)...");
  const lddBuildResult = Bun.spawnSync(
    [
      "sh",
      "-c",
      `docker build --platform linux/amd64 -t ${lddImageName} -f ${lddPath} .`,
    ],
    {
      stdio: ["inherit", "inherit", "inherit"],
    }
  );
  if (lddBuildResult.exitCode !== 0) {
    throw new Error("Failed to build ldd analysis container");
  }

  console.log("Running ldd analysis...");
  const lddRunResult = Bun.spawnSync(
    [
      "sh",
      "-c",
      `docker run --platform linux/amd64 --rm -v "${analysisDir}:/analysis" ${lddImageName}`,
    ],
    {
      stdio: ["inherit", "inherit", "inherit"],
    }
  );
  if (lddRunResult.exitCode !== 0) {
    throw new Error("ldd analysis failed");
  }

  // Run strace analysis on native arm64
  const straceImageName = `mcp-analysis-strace:${path.basename(buildDir)}`;
  console.log("Building strace analysis container (arm64)...");
  const straceBuildResult = Bun.spawnSync(
    [
      "sh",
      "-c",
      `docker build --platform linux/arm64 -t ${straceImageName} -f ${stracePath} .`,
    ],
    {
      stdio: ["inherit", "inherit", "inherit"],
    }
  );
  if (straceBuildResult.exitCode !== 0) {
    throw new Error("Failed to build strace analysis container");
  }

  console.log("Running strace analysis...");
  const straceRunResult = Bun.spawnSync(
    [
      "sh",
      "-c",
      `docker run --platform linux/arm64 --cap-add=SYS_PTRACE --rm -v "${analysisDir}:/analysis" ${straceImageName}`,
    ],
    {
      stdio: ["inherit", "inherit", "inherit"],
    }
  );
  if (straceRunResult.exitCode !== 0) {
    throw new Error("strace analysis failed");
  }

  // TODO: Process analysis results
  // TODO: Generate unikernel Dockerfile
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

    // Create build directory structure
    const buildDir = await createBuildDir(configPath, configContent);
    console.log(`Created build directory: ${buildDir}`);

    // Generate and write the regular Dockerfile
    const dockerfile = generateDockerfile(config, configContent);
    const dockerfilePath = path.join(buildDir, "Dockerfile.generated");
    await fs.writeFile(dockerfilePath, dockerfile);
    console.log(`Generated Dockerfile at: ${dockerfilePath}`);

    // Run analysis
    await runAnalysis(buildDir, config, configContent);
    console.log(
      "Analysis complete. Results in:",
      path.join(buildDir, "unikernel", "analysis")
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
