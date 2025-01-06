import { type Server } from "bun";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { PassThrough } from "node:stream";
import { childProcessLogger, logger as l } from "./logger";
import { parseCommandLineArgs } from "./parse";
import { ProcessPool } from "./process-pool";

// WSContextData is the state associated with each ws connection
type WSContextData = {
  childProcess: ReturnType<typeof spawn>;
  stdin: PassThrough;
  sessionId: string;
};

async function main() {
  l.debug(`argv: ${process.argv.slice(2)}`);
  const options = parseCommandLineArgs(process.argv.slice(2));

  if (!options.command[0]) {
    l.error("No command provided to execute.");
    process.exit(1);
  }

  const pool = new ProcessPool(options.command, options.env);
  await pool.initialize();

  Bun.serve<WSContextData>({
    port: options.port,
    fetch(req: Request, server: Server) {
      l.debug(`connection attempt: ${req.url}`);
      if (server.upgrade(req)) {
        return;
      }
      return new Response("Upgrade failed", { status: 500 });
    },

    websocket: {
      async open(ws) {
        const sessionId = randomUUID();
        l.debug(`open[${sessionId}]`);

        try {
          const { process: child, stdin } = await pool.getProcess();
          const cl = childProcessLogger(child.pid);

          ws.data = { childProcess: child, stdin, sessionId };
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
    pool.cleanup();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((error) => {
  l.error("Fatal error: " + error);
  process.exit(1);
});
