import { buffer } from "node:stream/consumers";
import { assertNonNullable } from "@kensio/smartass";
import { SimAws } from "../../src/index.js";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../src/util/type-guard/json.js";
import type { SimCfnTemplateFileWatchOptions } from "../../src/service/cloudformation/watch/sim-cfn-template-watch.type.js";

/**
 * A synthesized template file on disk, deployed and watched.
 *
 * The tests around watching are about what happens between a file being written
 * and a Stack having caught up with it, so they need the real thing: a real
 * file, a real watch on the directory it is in, and a real wait for the events
 * to arrive.
 */
export class WatchedTemplate {
  public readonly simAws = new SimAws();

  private readonly directory = new TemporaryDirectory();
  private readonly fileName = "Site.template.json";
  private readonly updates: string[] = [];
  private readonly failures: Error[] = [];
  private updatedListener: (() => void) | undefined;

  /**
   * Deploy a template file and watch it.
   */
  static async of(
    template: object,
    watching: boolean | SimCfnTemplateFileWatchOptions = {},
  ): Promise<WatchedTemplate> {
    const watched = new WatchedTemplate();
    await watched.write(template);

    // macOS delivers filesystem events with a short delay, so a watch started
    // straight after the template was written still sees that write. Yulin
    // refuses it as an update with nothing in it, but a test counting updates
    // should not be waiting for that to happen.
    await templatePause(250);

    await watched.simAws.cloudFormation().deployTemplateFile({
      templatePath: watched.path(),
      watch: watched.watchProperty(watching),
    });

    return watched;
  }

  /**
   * The path the template file was deployed from.
   */
  path(): string {
    return this.directory.join(this.fileName);
  }

  /**
   * Synthesize the template file again.
   */
  async write(template: object): Promise<void> {
    await this.directory.writeFile(this.fileName, jsonStringify(template));
  }

  /**
   * Run something at the moment an update completes, for a test asking what
   * the simulated environment looks like by then.
   */
  whenUpdated(listener: () => void): void {
    this.updatedListener = listener;
  }

  /**
   * How many updates the watch has finished.
   */
  updateCount(): number {
    return this.updates.length;
  }

  /**
   * The failures the watch has been given.
   */
  failed(): readonly Error[] {
    return this.failures;
  }

  /**
   * Stop watching, so nothing is left holding the test process open.
   */
  stop(): void {
    this.simAws.cloudFormation().stopWatchingTemplateFiles();
  }

  /**
   * Wait for the watch to have finished the given number of updates.
   */
  async updated(count = 1, withinMs = 5000): Promise<void> {
    await until(
      () => this.updates.length >= count,
      withinMs,
      () => {
        return `Watched template updated ${String(this.updates.length)} times, expected ${String(count)}`;
      },
    );
  }

  /**
   * Wait for the watch to have reported the given number of failures.
   */
  async failedUpdates(count = 1, withinMs = 5000): Promise<void> {
    await until(
      () => this.failures.length >= count,
      withinMs,
      () => {
        return `Watched template failed ${String(this.failures.length)} times, expected ${String(count)}`;
      },
    );
  }

  /**
   * What the deployment asks for by way of watching. A test that only cares
   * whether the file is watched at all says so with a boolean, as a dev script
   * would; the rest are given somewhere for the outcome to be recorded.
   */
  private watchProperty(
    watching: boolean | SimCfnTemplateFileWatchOptions,
  ): boolean | SimCfnTemplateFileWatchOptions {
    if (typeof watching === "boolean") {
      return watching;
    }

    return {
      settleMs: 40,
      onUpdated: (): void => {
        this.updatedListener?.();
        this.updates.push(this.path());
      },
      onFailed: (error: Error): void => {
        this.failures.push(error);
      },
      ...watching,
    };
  }
}

/**
 * Give the filesystem events time to arrive and settle, for a test asserting
 * that nothing happened.
 */
export async function templatePause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function until(
  condition: () => boolean,
  withinMs: number,
  timedOut: () => string,
): Promise<void> {
  const giveUpAt = Date.now() + withinMs;

  while (!condition()) {
    if (Date.now() >= giveUpAt) {
      throw new Error(timedOut());
    }

    // eslint-disable-next-line no-await-in-loop -- polling for a filesystem event
    await templatePause(20);
  }
}

interface SiteTemplateProperties {
  readonly withUploads?: boolean;
  readonly description?: string;
}

/**
 * A synthesized template for a site: one Bucket to serve from, and whatever
 * the change under test adds to it.
 */
export function siteTemplate(properties: SiteTemplateProperties = {}): object {
  const { withUploads = false, description } = properties;

  return {
    ...(description !== undefined && { Description: description }),
    Resources: {
      Site: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-content" },
      },
      ...(withUploads && {
        Uploads: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "site-uploads" },
        },
      }),
    },
  };
}

/**
 * Put a page in the Bucket the template deployed, standing in for whatever a
 * simulated environment is holding when the infrastructure changes.
 */
export async function putSitePage(simAws: SimAws): Promise<void> {
  await simAws.s3().putObject({
    input: {
      Bucket: "site-content",
      Key: "index.html",
      Body: "<h1>Hello</h1>",
    },
  });
}

/**
 * Read the page back out of simulated S3.
 */
export async function sitePage(simAws: SimAws): Promise<string> {
  const output = await simAws
    .s3()
    .getObject({ input: { Bucket: "site-content", Key: "index.html" } });
  assertNonNullable(output.Body);

  const bytes = await buffer(output.Body);

  return bytes.toString("utf8");
}
