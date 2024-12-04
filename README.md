# mcp-server-server

This repo is a proof of concept MCP server that lets you spin up ... other MCP servers.

## But...why?

MCP servers are hard to use.

The primary transport mechanism for MCP servers is stdio, i.e. in your MCP client program you need to spawn a new process for the MCP server you want to use.
This has downsides:

1. It's cumbersome--every MCP client needs to be a process manager now. The way you [configure Claude Desktop](https://modelcontextprotocol.io/quickstart#installation) to use MCP servers is a good demonstration of this--it needs a list of processes to run.
2. It creates an infra problem: if you have many users, all of which require different MCP server configurations (e.g. they all have different credentials for underlying MCP servers like Github, Google Drive, etc.), then you now have tons of processes to operate and route client requests to.

## A better way

What if MCP servers were actually... servers? I.e. communication with them happened over the network instead of stdio?
Then you could have an easier time using them programatically.

### Step 1: Convert a stdio MCP server to a websocket MCP server

This repo contains a wrapper program that will take an existing MCP server ([here](https://github.com/modelcontextprotocol/servers/tree/main/src/) is a list of the official ones, but they're all over now) and expose it via websocket:

```zsh
bun run mcp-server -p 3001 -- npx -y @modelcontextprotocol/server-puppeteer@latest
```

### Step 2: Interact with the MCP server programatically without managing processes

```typescript
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
const tools = await client.listTools();
console.log("Tools:", tools);
```

### Step 3: Make the MCP server server

TODO: We haven't solved problem 2, i.e. as an MCP client developer we still (in step 1) had to spawn a program for a specific MCP server + user configuration. What if there was a single MCP server that exposed tools to spin up
