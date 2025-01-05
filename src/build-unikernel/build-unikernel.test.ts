import { describe, expect, test } from "bun:test";
import { generateDockerfile } from "./build-unikernel";

describe("generateDockerfile", () => {
  test("generates correct Dockerfile for Python/UV setup", () => {
    const config = {
      mcpServers: {
        fetch: {
          command: "uvx",
          args: ["mcp-server-fetch"],
        },
      },
    };

    const dockerfile = generateDockerfile(config);

    // Check base setup
    expect(dockerfile).toContain("FROM debian:bookworm-slim");
    expect(dockerfile).toContain("WORKDIR /usr/app");
    expect(dockerfile).toContain(
      "RUN apt-get update && apt-get install -y curl wget unzip"
    );

    // Check Python/UV specific setup
    expect(dockerfile).toContain("RUN apt-get install -y python3 python3-venv");
    expect(dockerfile).toContain(
      "RUN curl -LsSf https://astral.sh/uv/install.sh | sh"
    );
    expect(dockerfile).toContain('ENV PATH="/root/.cargo/bin:$PATH"');
    expect(dockerfile).toContain("RUN uv venv");
    expect(dockerfile).toContain('ENV PATH="/venv/bin:$PATH"');

    // Should not contain Node setup
    expect(dockerfile).not.toContain("Install Node.js");
    expect(dockerfile).not.toContain("npm install");
  });

  test("generates correct Dockerfile for Node setup with npx command", () => {
    const config = {
      mcpServers: {
        puppeteer: {
          command: "npx",
          args: ["@modelcontextprotocol/server-puppeteer"],
        },
      },
    };

    const dockerfile = generateDockerfile(config);

    // Check base setup
    expect(dockerfile).toContain("FROM debian:bookworm-slim");
    expect(dockerfile).toContain("WORKDIR /usr/app");
    expect(dockerfile).toContain(
      "RUN apt-get update && apt-get install -y curl wget unzip"
    );

    // Check Node.js specific setup
    expect(dockerfile).toContain("Install Node.js and npm");
    expect(dockerfile).toContain("RUN apt-get install -y nodejs npm");

    // Check npm package installation
    expect(dockerfile).toContain("Pre-install npm packages");
    expect(dockerfile).toContain(
      "RUN npm install @modelcontextprotocol/server-puppeteer"
    );

    // Should not contain Python setup
    expect(dockerfile).not.toContain("python3");
    expect(dockerfile).not.toContain("uv venv");
  });

  test("generates correct Dockerfile for both Python and Node setup with multiple npx packages", () => {
    const config = {
      mcpServers: {
        fetch: {
          command: "uvx",
          args: ["mcp-server-fetch"],
        },
        puppeteer: {
          command: "npx",
          args: ["@modelcontextprotocol/server-puppeteer"],
        },
        other: {
          command: "npx",
          args: ["some-other-package"],
        },
      },
    };

    const dockerfile = generateDockerfile(config);

    // Check base setup
    expect(dockerfile).toContain("FROM debian:bookworm-slim");
    expect(dockerfile).toContain("WORKDIR /usr/app");
    expect(dockerfile).toContain(
      "RUN apt-get update && apt-get install -y curl wget unzip"
    );

    // Check Python/UV setup
    expect(dockerfile).toContain("RUN apt-get install -y python3 python3-venv");
    expect(dockerfile).toContain(
      "RUN curl -LsSf https://astral.sh/uv/install.sh | sh"
    );
    expect(dockerfile).toContain('ENV PATH="/root/.cargo/bin:$PATH"');
    expect(dockerfile).toContain("RUN uv venv");

    // Check Node.js setup with multiple packages
    expect(dockerfile).toContain("Install Node.js and npm");
    expect(dockerfile).toContain("RUN apt-get install -y nodejs npm");
    expect(dockerfile).toContain("Pre-install npm packages");
    expect(dockerfile).toContain("@modelcontextprotocol/server-puppeteer");
    expect(dockerfile).toContain("some-other-package");
  });

  test("generates correct common parts for all setups", () => {
    const config = {
      mcpServers: {
        fetch: {
          command: "uvx",
          args: ["mcp-server-fetch"],
        },
      },
    };

    const dockerfile = generateDockerfile(config);

    // Check common parts
    expect(dockerfile).toContain("WORKDIR /usr/app");
    expect(dockerfile).toContain("COPY package*.json .");
    expect(dockerfile).toContain("COPY bun.lockb .");
    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).toContain("COPY . .");
    expect(dockerfile).toContain(
      'ENTRYPOINT ["bun", "/usr/app/src/mcp-server-wrapper/mcp-server-wrapper.ts"]'
    );
  });
});
