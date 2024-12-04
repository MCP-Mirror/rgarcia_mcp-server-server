import { parseArgs } from "util";

interface ProgramOptions {
  port: number;
  env: Record<string, string>;
  command: string[];
}

function parseEnvironmentVariables(
  envInputs: string[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const input of envInputs) {
    // Handle space-delimited list of VAR=value pairs
    const pairs = input.split(" ");

    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      if (key && value) {
        result[key] = value;
      }
    }
  }

  return result;
}

export function parseCommandLineArgs(args: string[]): ProgramOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      port: {
        type: "string",
        short: "p",
        default: "3000",
      },
      env: {
        type: "string",
        short: "e",
        multiple: true,
        default: [],
      },
    },
    strict: true,
    allowPositionals: true,
  });
  return {
    port: parseInt(values.port as string, 10),
    env: parseEnvironmentVariables(values.env as string[]),
    command: positionals,
  };
}
