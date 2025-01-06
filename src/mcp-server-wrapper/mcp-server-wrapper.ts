import { type Server } from "bun";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { PassThrough } from "node:stream";
import { loadConfig } from "../lib/config";
import { childProcessLogger, logger as l } from "./logger";
import { parseCommandLineArgs } from "./parse";
import { ProcessPool } from "./process-pool";

// WSContextData is the state associated with each ws connection
type WSContextData = {
  childProcess: ReturnType<typeof spawn>;
  stdin: PassThrough;
  sessionId: string;
  serverName: string;
};

type ServerPools = {
  [key: string]: ProcessPool;
};

async function main() {
  l.debug(`argv: ${process.argv.slice(2)}`);

  let options;
  try {
    options = parseCommandLineArgs(process.argv.slice(2));
  } catch (error: any) {
    l.error(`Command line error: ${error.message}`);
    l.error("Usage: mcp-server-wrapper [-p PORT] <config-file-path>");
    process.exit(1);
  }

  const config = await loadConfig(options.configPath);

  // Create a process pool for each MCP server
  const pools: ServerPools = {};
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    const pool = new ProcessPool(
      [serverConfig.command, ...serverConfig.args],
      {}
    );
    await pool.initialize();
    pools[name] = pool;
  }

  Bun.serve<WSContextData>({
    port: options.port,
    fetch(req: Request, server: Server) {
      l.debug(`connection attempt: ${req.url}`);

      // Extract the server name from the URL path
      const url = new URL(req.url);
      const serverName = url.pathname.slice(1); // Remove leading slash

      if (!pools[serverName]) {
        return new Response(`No MCP server found at ${serverName}`, {
          status: 404,
        });
      }

      if (server.upgrade(req, { data: { serverName } })) {
        return;
      }
      return new Response("Upgrade failed", { status: 500 });
    },

    websocket: {
      async open(ws) {
        const sessionId = randomUUID();
        l.debug(`open[${sessionId}]`);

        try {
          const serverName = ws.data.serverName;
          const pool = pools[serverName];
          const { process: child, stdin } = await pool.getProcess();
          const cl = childProcessLogger(child.pid);

          ws.data = {
            childProcess: child,
            stdin,
            sessionId,
            serverName,
          };
          l.info(`assigned process PID ${child.pid} (session: ${sessionId})`);

          // stdout of the MCP server is a message to the client
          child.stdout?.on("data", (data: Buffer) => {
            const lines = data.toString().trim().split("\n");
            for (const line of lines) {
              if (line) {
                cl.info(`[session: ${sessionId}] ${line}`);
                ws.send(line);
              }
            }
          });

          child.on("close", (code) => {
            const ll = code !== null && code > 0 ? l.error : l.info;
            ll(
              `process ${child.pid} exited with code ${code} (session: ${sessionId})`
            );
            ws.close();
          });
        } catch (error) {
          l.error(`Failed to get process for session ${sessionId}: ${error}`);
          ws.close();
        }
      },

      message(ws, message) {
        l.debug(`message: ${message} (session: ${ws.data.sessionId})`);
        ws.data.stdin.write(message + "\n");
      },

      close(ws) {
        l.debug(`close: connection (session: ${ws.data.sessionId})`);
        ws.data.childProcess.kill("SIGINT");
      },
    },
  });

  l.info(`WebSocket server listening on port ${options.port}`);

  // Cleanup on exit
  const cleanup = () => {
    l.info("Shutting down...");
    for (const pool of Object.values(pools)) {
      pool.cleanup();
    }
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((error) => {
  l.error("Fatal error: " + error);
  process.exit(1);
});
