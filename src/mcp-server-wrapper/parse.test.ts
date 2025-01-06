import { describe, expect, test } from "bun:test";
import { parseCommandLineArgs } from "./parse";

describe("parseCommandLineArgs", () => {
  test("should parse default port when only config path provided", () => {
    const options = parseCommandLineArgs(["config.json"]);
    expect(options.port).toBe(3000);
    expect(options.configPath).toBe("config.json");
  });

  test("should parse port and config path correctly", () => {
    const options = parseCommandLineArgs(["-p", "8080", "config.json"]);
    expect(options.port).toBe(8080);
    expect(options.configPath).toBe("config.json");

    const options2 = parseCommandLineArgs(["--port", "9000", "config.json"]);
    expect(options2.port).toBe(9000);
    expect(options2.configPath).toBe("config.json");
  });

  test("should handle config path before port flag", () => {
    const options = parseCommandLineArgs(["config.json", "-p", "8080"]);
    expect(options.port).toBe(8080);
    expect(options.configPath).toBe("config.json");
  });

  test("should error on missing config path", () => {
    expect(() => parseCommandLineArgs(["-p", "8080"])).toThrow();
  });

  test("should error on invalid port", () => {
    expect(() =>
      parseCommandLineArgs(["-p", "invalid", "config.json"])
    ).toThrow();
  });

  test("should error on unknown flag", () => {
    expect(() => parseCommandLineArgs(["-x", "config.json"])).toThrow();
  });
});
