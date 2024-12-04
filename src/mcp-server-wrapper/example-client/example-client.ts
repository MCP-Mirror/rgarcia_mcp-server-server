import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";

const transport = new WebSocketClientTransport(new URL("ws://localhost:3001"));

const client = new Client(
  {
    name: "example-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);
await client.connect(transport);
const tools = await client.listTools();
console.log(
  "Tools:",
  tools.tools.map((t) => t.name)
);
await client.close();
