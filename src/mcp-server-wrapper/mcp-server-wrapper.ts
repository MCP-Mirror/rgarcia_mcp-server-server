import { type Server } from "bun";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { PassThrough } from "node:stream";
import { childProcessLogger, logger as l } from "./logger";
import { parseCommandLineArgs } from "./parse";

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
      open(ws) {
        const sessionId = randomUUID();
        l.debug(`open[${sessionId}]`);
        const startTime = performance.now();
        const child = spawn(options.command[0], options.command.slice(1), {
          env: { ...process.env, ...options.env },
          stdio: ["pipe", "pipe", "pipe"],
        });
        const spawnTime = performance.now() - startTime;
        const cl = childProcessLogger(child.pid);
        child.stderr.on("data", (data) => {
          cl.error(data.toString());
        });

        // stdin of the MCP server is how the client talks to it
        const stdin = new PassThrough();
        stdin.pipe(child.stdin);
        ws.data = { childProcess: child, stdin, sessionId };
        l.info(
          `started process with PID ${
            child.pid
          } (session: ${sessionId}) in ${spawnTime.toFixed(2)}ms`
        );

        // stdout of the MCP server is a message to the client
        child.stdout.on("data", (data) => {
          const lines = data.toString().trim().split("\n");
          for (const line of lines) {
            if (line) {
              cl.info(`[session: ${sessionId}] ${line}`);
              ws.send(line);
            }
          }
        });

        child.on("close", (code) => {
          const ll = code !== 0 ? l.error : l.info;
          ll(
            `process ${child.pid} exited with code ${code} (session: ${sessionId})`
          );
          ws.close();
        });
      },

      message(ws, message) {
        l.debug(`message: ${message} (session: ${ws.data.sessionId})`);
        ws.data.stdin.write(message + "\n");
      },

      close(ws) {
        l.debug(`close: connection (session: ${ws.data.sessionId})`);
        ws.data.childProcess.kill();
      },
    },
  });

  l.info(`WebSocket server listening on port ${options.port}`);
}

main().catch((error) => {
  l.error("Fatal error: " + error);
  process.exit(1);
});
