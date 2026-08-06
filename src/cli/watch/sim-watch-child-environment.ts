import path from "node:path";
import { simWatchConfig } from "../../watch/sim-watch.config.js";

const nodeOptionsName = "NODE_OPTIONS";

interface SimWatchChildEnvironmentProperties {
  readonly cwd: string;
  readonly inspect?: string | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

/**
 * The environment a supervised process runs in.
 *
 * Three things are added to the environment the supervisor was given. The
 * project's own `node_modules/.bin` goes on `PATH`, so `yulin watch -- tsx
 * dev.ts` works from a plain shell as well as from a package script. A marker
 * says a supervisor is listening, which is what makes the runtime in the child
 * report paths at all. An inspector flag goes through `NODE_OPTIONS` rather
 * than on the command line, because the command being run is often not `node`
 * itself.
 */
export class SimWatchChildEnvironment {
  private readonly cwd: string;
  private readonly inspect: string | undefined;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(properties: SimWatchChildEnvironmentProperties) {
    const { cwd, inspect, environment = process.env } = properties;
    this.cwd = cwd;
    this.inspect = inspect;
    this.environment = environment;
  }

  /**
   * Build the environment for one run of the supervised command.
   */
  build(): NodeJS.ProcessEnv {
    return {
      ...this.environment,
      PATH: this.pathWithLocalBin(),
      [simWatchConfig.environmentVariableName]:
        simWatchConfig.environmentVariableValue,
      ...(this.inspect !== undefined && {
        [nodeOptionsName]: this.nodeOptionsWithInspector(this.inspect),
      }),
    };
  }

  private pathWithLocalBin(): string {
    const localBin = path.join(this.cwd, "node_modules", ".bin");
    const existing = this.environment["PATH"] ?? "";

    if (existing.split(path.delimiter).includes(localBin)) {
      return existing;
    }

    return `${localBin}${path.delimiter}${existing}`;
  }

  private nodeOptionsWithInspector(inspect: string): string {
    const existing = this.environment["NODE_OPTIONS"] ?? "";

    return `${existing} ${inspect}`.trim();
  }
}
