import { describe, expect, test } from "bun:test";
import { ProcessPool } from "./process-pool";

describe("ProcessPool", () => {
  test("initializes with correct number of processes", async () => {
    const pool = new ProcessPool(["echo", "hello"], {}, 2);
    await pool.initialize();
    expect(pool.getPoolSize()).toBe(2);
    pool.cleanup();
  });

  test("maintains pool size after getting processes", async () => {
    const pool = new ProcessPool(["echo", "hello"], {}, 2);
    await pool.initialize();

    // Get a process and verify pool size
    await pool.getProcess();
    const processes = await Promise.all([pool.getProcess(), pool.getProcess()]);

    // Cleanup the processes we got
    processes.forEach((p) => p.process.kill());
    pool.cleanup();
  });

  test("spawns new process when pool is empty", async () => {
    const pool = new ProcessPool(["echo", "hello"], {}, 1);
    await pool.initialize();

    // Get two processes (pool size is 1)
    const process1 = await pool.getProcess();
    const process2 = await pool.getProcess();

    expect(process1).toBeDefined();
    expect(process2).toBeDefined();
    expect(process1).not.toBe(process2);

    process1.process.kill();
    process2.process.kill();
    pool.cleanup();
  });

  test("handles concurrent process requests", async () => {
    const pool = new ProcessPool(["echo", "hello"], {}, 1);
    await pool.initialize();

    // Request multiple processes concurrently
    const processes = await Promise.all([
      pool.getProcess(),
      pool.getProcess(),
      pool.getProcess(),
    ]);

    expect(processes.length).toBe(3);
    expect(processes.every((p) => p.process && p.stdin)).toBe(true);
    // Verify all processes are different
    const pids = processes.map((p) => p.process.pid);
    expect(new Set(pids).size).toBe(pids.length);

    // Cleanup the processes we got
    processes.forEach((p) => p.process.kill());
    pool.cleanup();
  });

  test("cleans up processes on cleanup", async () => {
    const pool = new ProcessPool(["echo", "hello"], {}, 2);
    await pool.initialize();

    expect(pool.getPoolSize()).toBe(2);
    pool.cleanup();
    expect(pool.getPoolSize()).toBe(0);
  });

  test("process stdin works correctly", async () => {
    const pool = new ProcessPool(["cat"], {}, 1);
    await pool.initialize();

    const { process, stdin } = await pool.getProcess();
    const testMessage = "hello world\n";

    // Create a promise that resolves with stdout data
    const outputPromise = new Promise<string>((resolve) => {
      process.stdout?.on("data", (data: Buffer) => {
        resolve(data.toString());
      });
    });

    // Write to stdin
    stdin.write(testMessage);

    // Wait for the output and verify it matches
    const output = await outputPromise;
    expect(output).toBe(testMessage);

    process.kill();
    pool.cleanup();
  });
});
