import {
  simWatch,
  type SimWatchRuntime,
} from "../../../watch/sim-watch-runtime.js";
import type { SimS3BucketName } from "../bucket/sim-s3-bucket.js";
import { SimS3MountWatch } from "./sim-s3-mount-watch.js";
import type { SimS3MountFilesystemOptions } from "./sim-s3-mount.type.js";

interface SimS3MountWatchesProperties {
  readonly watch?: SimWatchRuntime | undefined;
}

/**
 * The mounted directories one simulated S3 is watching.
 *
 * One watch per Bucket, because a Bucket reads one directory. Mounting a Bucket
 * again replaces its watch, so the directory being watched is always the one
 * being served.
 *
 * A recursive watch holds an open filesystem handle, which keeps the process
 * alive, so anything that starts one needs a way to let it go. `stopAll()` is
 * that way, and a long-running dev process simply never calls it.
 */
export class SimS3MountWatches {
  private readonly watch: SimWatchRuntime;
  private readonly watches = new Map<SimS3BucketName, SimS3MountWatch>();

  constructor(properties: SimS3MountWatchesProperties = {}) {
    this.watch = properties.watch ?? simWatch;
  }

  /**
   * Take on a directory that has just been mounted into a Bucket.
   *
   * A mount that reloads for itself watches the directory, and a `yulin watch`
   * supervisor is told to leave it alone. A mount that does not is only named
   * to the supervisor, which then restarts the process for a change in it, and
   * nothing here holds the event loop open.
   */
  register(
    bucketName: SimS3BucketName | string,
    directoryPath: string,
    options: SimS3MountFilesystemOptions,
  ): void {
    this.remove(bucketName);

    const { reload } = options;

    if (reload === undefined) {
      this.watch.reportPath(directoryPath);

      return;
    }

    const watch = new SimS3MountWatch({
      directoryPath,
      onChanged: (): void => {
        reload.reload();
      },
      settleMs: options.settleMs,
      watch: this.watch,
    });

    this.watches.set(bucketName as SimS3BucketName, watch);
    watch.start();
  }

  /**
   * The mounted directories being watched, as absolute paths.
   */
  paths(): readonly string[] {
    return [
      ...new Set(this.watches.values().map((watch) => watch.directoryPath)),
    ];
  }

  /**
   * Stop watching everything, so nothing is left holding the process open.
   */
  stopAll(): void {
    for (const watch of this.watches.values()) {
      watch.close();
    }

    this.watches.clear();
  }

  private remove(bucketName: SimS3BucketName | string): void {
    const key = bucketName as SimS3BucketName;
    this.watches.get(key)?.close();
    this.watches.delete(key);
  }
}
