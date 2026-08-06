import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { SimAws } from "../../src/index.js";
import { repoPath } from "../../src/util/filesystem/path.js";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../src/util/type-guard/json.js";

const yulin = repoPath("src/index.js");
const yulinServe = repoPath("src/serve/index.js");
const tsx = repoPath(path.join("node_modules", ".bin", "tsx"));

/**
 * How long a dev script is given to serve, hold and then close everything.
 *
 * A real process, spawned through `tsx`, importing what a dev script imports.
 * Reaching it means something was left holding the event loop, so the wait is
 * generous enough for a loaded CI runner and the failure is the point.
 */
const runTimeoutMs = 20_000;

interface RunOptions {
  readonly signal?: NodeJS.Signals;
}

export interface ScriptRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

/**
 * A throwaway project for a dev script that serves a simulated environment.
 *
 * The template and the mounted directory are real files, because what is being
 * tested is the open filesystem handles a watch on them holds, and the script
 * is run as a real process, because nothing else can say whether it exits.
 */
export class ServedProject {
  private readonly directory = new TemporaryDirectory();

  /**
   * Write the files a served environment is built from.
   */
  static async of(): Promise<ServedProject> {
    const project = new ServedProject();
    await project.directory.writeFile(
      "Stack.template.json",
      jsonStringify({ Resources: {} }),
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(project.mountPath(), { recursive: true });

    return project;
  }

  /**
   * The synthesized template a Stack is deployed from.
   */
  templatePath(): string {
    return this.directory.join("Stack.template.json");
  }

  /**
   * The built directory a Bucket is mounted on.
   */
  mountPath(): string {
    return this.directory.join("public");
  }

  /**
   * Deploy the watched template and mount the watched directory.
   */
  async hold(simAws: SimAws, reload: { reload: () => void }): Promise<void> {
    await simAws
      .cloudFormation()
      .deployTemplateFile({ templatePath: this.templatePath(), watch: true });
    await simAws.s3().createBucket({ input: { Bucket: "site" } });
    simAws.s3().mountBucketFilesystem("site", this.mountPath(), { reload });
  }

  /**
   * Write the dev script this project is run as.
   */
  async writeScript(source: string): Promise<void> {
    await this.directory.writeFile("dev.ts", source);
  }

  /**
   * Run the dev script as a process of its own, and wait for it to exit.
   *
   * A run that has to be killed is a failure rather than a result: the whole
   * point of it is that the process ended on its own.
   */
  async run(options: RunOptions = {}): Promise<ScriptRun> {
    const child = spawn(tsx, [this.directory.join("dev.ts")], {
      cwd: this.directory.path(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = { stdout: "", stderr: "" };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output.stdout += chunk;

      if (options.signal !== undefined && output.stdout.includes("watching ")) {
        child.kill(options.signal);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      output.stderr += chunk;
    });

    const giveUp = setTimeout(() => {
      child.kill("SIGKILL");
    }, runTimeoutMs);

    const code = await new Promise<number | null>((resolve) => {
      child.on("exit", resolve);
    });
    clearTimeout(giveUp);

    if (code === null) {
      throw new Error(
        `The process did not exit on its own. It said: ${output.stdout} ${output.stderr}`,
      );
    }

    return { ...output, code };
  }
}

/**
 * A dev script that closes what it is holding once, and is expected to end.
 */
export function closingScript(project: ServedProject): string {
  return `${servingSource(project)}
await srv.close();
console.log("closed");
`;
}

/**
 * The same script, asking for the signal handler rather than writing one.
 */
export function signalledScript(project: ServedProject): string {
  return `${servingSource(project)}
srv.closeOnSignal();
process.on("exit", () => {
  console.log("closed");
});
`;
}

/**
 * A dev script up to the point where it is holding everything Yulin can hold:
 * a port, a DNS port, live reload, a watched template and a watched mount.
 */
function servingSource(project: ServedProject): string {
  return `import { SimAws } from ${JSON.stringify(yulin)};
import { serveSimAws } from ${JSON.stringify(yulinServe)};

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 0, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: ${JSON.stringify(project.templatePath())},
  watch: true,
});
await simAws.s3().createBucket({ input: { Bucket: "site" } });
simAws.s3().mountBucketFilesystem("site", ${JSON.stringify(project.mountPath())}, {
  reload: srv,
});

console.log(
  "watching " +
    String(
      simAws.cloudFormation().watchedTemplateFiles().length +
        simAws.s3().watchedMountedDirectories().length,
    ),
);
`;
}
