import { describe, expect, test } from "bun:test";
import { type Config } from "../lib/config";
import { determineRequiredSetups, generateDockerfile } from "./build-unikernel";

describe("determineRequiredSetups", () => {
  test("correctly identifies Python-only setup", () => {
    const config: Config = {
      mcpServers: {
        test: {
          command: "uvx",
          args: ["test-package"],
        },
      },
    };
    const result = determineRequiredSetups(config);
    expect(result.needsPython).toBe(true);
    expect(result.needsNode).toBe(false);
  });
});

describe("generateDockerfile", () => {
  const testConfig = {
    mcpServers: {
      test: {
        command: "uvx",
        args: ["test-package"],
      },
    },
  };

  test("generates correct Dockerfile for Python/UV setup", () => {
    const dockerfile = generateDockerfile(
      testConfig,
      JSON.stringify(testConfig, null, 2)
    );
    expect(dockerfile).toContain("Install Python and UV");
    expect(dockerfile).toContain("uv tool install test-package");
    expect(dockerfile).toContain(
      "cat > /usr/app/config/mcp-config.json << 'ENDCONFIG'"
    );
    expect(dockerfile).toContain(JSON.stringify(testConfig, null, 2));
  });

  test("generates correct Dockerfile for Node setup with npx command", () => {
    const config: Config = {
      mcpServers: {
        test: {
          command: "npx",
          args: ["test-package"],
        },
      },
    };
    const dockerfile = generateDockerfile(
      config,
      JSON.stringify(config, null, 2)
    );
    expect(dockerfile).toContain("Install Node.js and npm");
    expect(dockerfile).toContain("npm install test-package");
    expect(dockerfile).toContain(
      "cat > /usr/app/config/mcp-config.json << 'ENDCONFIG'"
    );
  });

  test("generates correct Dockerfile for both Python and Node setup with multiple packages", () => {
    const config: Config = {
      mcpServers: {
        test1: {
          command: "uvx",
          args: ["test-package1"],
        },
        test2: {
          command: "npx",
          args: ["test-package2"],
        },
      },
    };
    const dockerfile = generateDockerfile(
      config,
      JSON.stringify(config, null, 2)
    );
    expect(dockerfile).toContain("Install Python and UV");
    expect(dockerfile).toContain("uv tool install test-package1");
    expect(dockerfile).toContain("Install Node.js and npm");
    expect(dockerfile).toContain("npm install test-package2");
    expect(dockerfile).toContain(
      "cat > /usr/app/config/mcp-config.json << 'ENDCONFIG'"
    );
  });

  test("generates correct common parts for all setups", () => {
    const dockerfile = generateDockerfile(
      testConfig,
      JSON.stringify(testConfig, null, 2)
    );
    expect(dockerfile).toContain("FROM debian:bookworm-slim");
    expect(dockerfile).toContain("WORKDIR /usr/app");
    expect(dockerfile).toContain("Install Bun");
    expect(dockerfile).toContain("COPY package*.json .");
    expect(dockerfile).toContain("COPY . .");
    expect(dockerfile).toContain(
      'ENTRYPOINT ["bun", "/usr/app/src/mcp-server-wrapper/mcp-server-wrapper.ts"'
    );
  });
});
