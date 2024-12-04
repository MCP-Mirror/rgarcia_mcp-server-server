import { describe, expect, it } from "bun:test";
import { parseCommandLineArgs } from "./parse";

describe("parseCommandLineArgs", () => {
  it("should parse default values when no arguments are provided", () => {
    const options = parseCommandLineArgs([]);
    expect(options.port).toBe(3000);
    expect(options.env).toEqual({});
    expect(options.command).toEqual([]);
  });

  it("should parse port and environment variables correctly", () => {
    const options = parseCommandLineArgs([
      "-p",
      "8080",
      "-e",
      "VAR1=value1",
      "-e",
      "VAR2=value2",
      "command1",
      "command2",
    ]);
    expect(options.port).toBe(8080);
    expect(options.env).toEqual({ VAR1: "value1", VAR2: "value2" });
    expect(options.command).toEqual(["command1", "command2"]);
  });

  it("should handle multiple environment variable inputs", () => {
    const options = parseCommandLineArgs([
      "-e",
      "VAR1=value1",
      "-e",
      "VAR2=value2",
    ]);
    expect(options.env).toEqual({ VAR1: "value1", VAR2: "value2" });
  });
});
