import { mkdir } from "node:fs/promises";
import { SimAws } from "../../src/index.js";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";

interface MountedSiteProperties {
  readonly reload?: boolean;
  readonly settleMs?: number;
  readonly fresh?: boolean;
}

/**
 * A directory of built files on disk, mounted into a simulated S3 Bucket.
 *
 * The tests around watching a mount are about what happens between a build
 * writing files and a browser being told, so they need the real thing: a real
 * directory, a real recursive watch on it, and a real wait for the events to
 * arrive.
 */
export class MountedSite {
  readonly simAws = new SimAws();

  private readonly directory = new TemporaryDirectory();
  private reloads = 0;

  /**
   * Mount a directory holding a built page into a Bucket.
   */
  static async of(
    properties: MountedSiteProperties = {},
  ): Promise<MountedSite> {
    const { reload = true, settleMs = 200, fresh = false } = properties;
    const site = new MountedSite();
    await site.prepare(fresh);
    await site.simAws.s3().createBucket({ input: { Bucket: "site" } });
    site.simAws.s3().mountBucketFilesystem("site", site.path(), {
      settleMs,
      ...(reload && {
        reload: {
          reload: (): void => {
            site.reloads += 1;
          },
        },
      }),
    });

    return site;
  }

  /**
   * The directory the Bucket is serving, which is a build output directory as
   * filesystem storage insists on.
   */
  path(): string {
    return this.directory.join("public");
  }

  /**
   * Write a built file into the directory, as a site generator would.
   */
  async write(name: string, content: string): Promise<void> {
    await this.directory.writeFile(["public", ...name.split("/")], content);
  }

  /**
   * How many times the connected browsers have been told to reload.
   */
  reloadCount(): number {
    return this.reloads;
  }

  /**
   * Wait for the mount to have reloaded the given number of times.
   */
  async reloaded(count = 1, withinMs = 5000): Promise<void> {
    const giveUpAt = Date.now() + withinMs;

    while (this.reloads < count) {
      if (Date.now() >= giveUpAt) {
        throw new Error(
          `Mounted site reloaded ${String(this.reloads)} times, expected ${String(count)}`,
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- polling for a filesystem event
      await mountPause(20);
    }
  }

  /**
   * Stop watching, so nothing is left holding the test process open.
   */
  stop(): void {
    this.simAws.s3().stopWatchingMountedDirectories();
  }

  /**
   * Get the directory into the state the mount is supposed to meet.
   *
   * A fresh one is mounted the moment it is made with nothing built into it,
   * which is what macOS replays the directory's own creation at. Otherwise it
   * holds a built page and is left to go quiet first, because a watch is also
   * handed the events that were still in flight when it started, and those are
   * writes that finished before the Bucket existed.
   */
  private async prepare(fresh: boolean): Promise<void> {
    if (fresh) {
      await this.directory.resolvePath();
      // oxlint-disable-next-line security/detect-non-literal-fs-filename
      await mkdir(this.path(), { recursive: true });

      return;
    }

    await this.write("index.html", "<h1>Hello</h1>");
    await mountPause(250);
  }
}

/**
 * Give the filesystem events time to arrive and settle, for a test asserting
 * that nothing happened.
 */
export async function mountPause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
