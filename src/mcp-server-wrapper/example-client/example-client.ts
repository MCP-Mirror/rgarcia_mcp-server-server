import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { loadConfig } from "../../lib/config";

async function testServer(serverName: string, port: number) {
  console.log(`\nTesting server: ${serverName}`);
  const transport = new WebSocketClientTransport(
    new URL(`ws://localhost:${port}/${serverName}`)
  );

  const client = new Client(
    {
      name: "example-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    console.time(`${serverName} Connection`);
    await client.connect(transport);
    console.timeEnd(`${serverName} Connection`);

    console.time(`${serverName} List Tools`);
    const tools = await client.listTools();
    console.timeEnd(`${serverName} List Tools`);

    console.log(
      `${serverName} Tools:`,
      tools.tools.map((t) => t.name)
    );
  } catch (error) {
    console.error(`Error testing ${serverName}:`, error);
  } finally {
    await client.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: example-client <config-file-path> [port]");
    process.exit(1);
  }

  const configPath = args[0];
  const port = args[1] ? parseInt(args[1]) : 3001;

  const config = await loadConfig(configPath);

  // Test each server in sequence
  for (const serverName of Object.keys(config.mcpServers)) {
    await testServer(serverName, port);
  }
}

main().catch(console.error);
