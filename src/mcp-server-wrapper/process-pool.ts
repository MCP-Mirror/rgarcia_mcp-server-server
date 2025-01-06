import { spawn } from "child_process";
import { PassThrough } from "node:stream";
import { childProcessLogger, logger as l } from "./logger";

export type SpawnedProcess = {
  process: ReturnType<typeof spawn>;
  stdin: PassThrough;
};

export class ProcessPool {
  private processes: SpawnedProcess[] = [];
  private command: string[];
  private env: Record<string, string>;
  private minPoolSize: number;
  private logger = l;
  private spawningCount = 0;

  constructor(command: string[], env: Record<string, string>, minPoolSize = 1) {
    this.command = command;
    this.env = env;
    this.minPoolSize = minPoolSize;
  }

  private async spawnProcess(): Promise<SpawnedProcess> {
    this.spawningCount++;
    try {
      const startTime = performance.now();
      const childProcess = spawn(this.command[0], this.command.slice(1), {
        env: { ...process.env, ...this.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const spawnTime = performance.now() - startTime;
      const cl = childProcessLogger(childProcess.pid);

      childProcess.stderr?.on("data", (data: Buffer) => {
        cl.error(data.toString());
      });

      const stdin = new PassThrough();
      stdin.pipe(childProcess.stdin!);

      const spawnedProcess: SpawnedProcess = {
        process: childProcess,
        stdin,
      };

      this.logger.info(
        `spawned process with PID ${childProcess.pid} in ${spawnTime.toFixed(
          2
        )}ms`
      );

      return spawnedProcess;
    } finally {
      this.spawningCount--;
    }
  }

  private async spawnReplacement() {
    // Only spawn if total processes (running + spawning) is less than minPoolSize
    if (this.processes.length + this.spawningCount < this.minPoolSize) {
      const process = await this.spawnProcess();
      // Double check we still need this process
      if (this.processes.length + this.spawningCount < this.minPoolSize) {
        this.processes.push(process);
      } else {
        // We don't need this process anymore, kill it
        l.info(`killing process ${process.process.pid}`);
        process.process.kill();
      }
    }
  }

  async initialize() {
    // Start initial processes
    const promises = [];
    for (let i = 0; i < this.minPoolSize; i++) {
      promises.push(
        this.spawnProcess().then((process) => {
          this.processes.push(process);
        })
      );
    }
    await Promise.all(promises);
  }

  async getProcess(): Promise<SpawnedProcess> {
    // If we have a process available, return it
    if (this.processes.length > 0) {
      const process = this.processes.pop()!;
      // Spawn a replacement asynchronously
      this.spawnReplacement();
      return process;
    }

    // If no process available, spawn one immediately
    return await this.spawnProcess();
  }

  cleanup() {
    for (const process of this.processes) {
      l.info(`killing process ${process.process.pid}`);
      process.process.kill();
    }
    this.processes = [];
  }

  // For testing purposes
  getPoolSize(): number {
    return this.processes.length;
  }

  getSpawningCount(): number {
    return this.spawningCount;
  }
}
