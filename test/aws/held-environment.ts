import { mkdir } from "node:fs/promises";
import { SimAws } from "../../src/index.js";
import type { SimAwsAccountRegionContainer } from "../../src/service/aws/sim-aws-account-region-scope.js";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../src/util/type-guard/json.js";

export const otherAccountId = "111111111111";
export const otherRegionName = "eu-west-1";

/**
 * A simulation holding every kind of handle it can, in more than one scope.
 *
 * Real files and real watches, because the tests around closing are about the
 * open filesystem handles that keep a process alive. Two Account and Region
 * scopes, because a simulation that deploys into a second one starts its
 * watches there too, and a close that only knew about the default scope would
 * leave those holding the process open.
 */
export class HeldEnvironment {
  readonly simAws = new SimAws();

  private readonly directory = new TemporaryDirectory();

  /**
   * Deploy a watched template and mount a watched directory in both scopes.
   */
  static async of(): Promise<HeldEnvironment> {
    const held = new HeldEnvironment();
    await held.directory.writeFile(
      "Stack.template.json",
      jsonStringify({ Resources: {} }),
    );

    await held.hold(held.simAws.accountRegionScope(), "default");
    await held.hold(held.otherScope(), "other");

    return held;
  }

  /**
   * Every path this simulation is watching, in either scope.
   */
  watchedPaths(): readonly string[] {
    return [
      ...this.scopeWatchedPaths(this.simAws.accountRegionScope()),
      ...this.scopeWatchedPaths(this.otherScope()),
    ];
  }

  /**
   * Wait for a close nothing handed back a promise for, as a signal handler's
   * is.
   */
  async untilClosed(withinMs = 5000): Promise<void> {
    const giveUpAt = Date.now() + withinMs;

    while (this.watchedPaths().length > 0) {
      if (Date.now() >= giveUpAt) {
        throw new Error(
          `Still watching ${String(this.watchedPaths().length)} paths`,
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- polling for a close
      await heldPause(10);
    }
  }

  private otherScope(): SimAwsAccountRegionContainer {
    return this.simAws.account(otherAccountId).region(otherRegionName);
  }

  private async hold(
    scope: SimAwsAccountRegionContainer,
    name: string,
  ): Promise<void> {
    await scope.cloudFormation().deployTemplateFile({
      templatePath: this.directory.join("Stack.template.json"),
      stackName: `${name}-stack`,
      watch: true,
    });

    const mountPath = await this.mountDirectory(name);
    await scope.s3().createBucket({ input: { Bucket: `${name}-site` } });
    scope.s3().mountBucketFilesystem(`${name}-site`, mountPath, {
      reload: { reload: (): void => undefined },
    });
  }

  private scopeWatchedPaths(
    scope: SimAwsAccountRegionContainer,
  ): readonly string[] {
    return [
      ...scope.cloudFormation().watchedTemplateFiles(),
      ...scope.s3().watchedMountedDirectories(),
    ];
  }

  private async mountDirectory(name: string): Promise<string> {
    await this.directory.resolvePath();
    const mountPath = this.directory.join(name, "public");

    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(mountPath, { recursive: true });

    return mountPath;
  }
}

/**
 * Wait, for a test polling for something nothing handed it a promise for.
 */
export async function heldPause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
