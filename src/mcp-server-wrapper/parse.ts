export type Options = {
  port: number;
  configPath: string;
};

export function parseCommandLineArgs(args: string[]): Options {
  const options: Options = {
    port: 3000,
    configPath: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-p":
      case "--port":
        if (i + 1 >= args.length) {
          throw new Error("Missing port number");
        }
        const port = parseInt(args[++i]);
        if (isNaN(port)) {
          throw new Error(`Invalid port number: ${args[i]}`);
        }
        options.port = port;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.configPath = arg;
    }
  }

  if (!options.configPath) {
    throw new Error("No config file path provided");
  }

  return options;
}
