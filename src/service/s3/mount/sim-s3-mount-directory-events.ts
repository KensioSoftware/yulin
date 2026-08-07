import fs, { type FSWatcher } from "node:fs";
import path from "node:path";

interface SimS3MountDirectoryEventsProperties {
  readonly directoryPath: string;
  readonly onEvent: () => void;
}

/**
 * Filesystem events for everything under a mounted directory.
 *
 * The watch is recursive, because a site generator writes into whatever nested
 * directories its output has and the Bucket serves all of them. Which file
 * changed does not matter here: any of them is the mounted content changing.
 */
export class SimS3MountDirectoryEvents {
  private readonly directoryPath: string;
  private readonly directoryName: string;
  private readonly onEvent: () => void;
  private watcher: FSWatcher | undefined;

  constructor(properties: SimS3MountDirectoryEventsProperties) {
    this.directoryPath = path.resolve(properties.directoryPath);
    this.directoryName = path.basename(this.directoryPath);
    this.onEvent = properties.onEvent;
  }

  /**
   * Start listening for writes under the directory.
   */
  start(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const watcher = fs.watch(
      this.directoryPath,
      { recursive: true },
      (_event, fileName) => {
        if (this.namesTheDirectoryItself(fileName)) {
          return;
        }

        this.onEvent();
      },
    );

    // The directory can be deleted or replaced, and a watcher with no error
    // listener throws. Nothing here can put it back.
    /* v8 ignore next 4 -- raised where the platform reports a watch going away,
     * which macOS does not do for a deleted directory, so nothing here can make
     * it happen on the machine this suite runs on. */
    watcher.on("error", () => {
      watcher.close();
      this.watcher = undefined;
    });

    this.watcher = watcher;
  }

  /**
   * Stop listening.
   */
  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  /**
   * Whether an event is macOS replaying the directory's own creation.
   *
   * A recursive watch started moments after the directory was made is handed a
   * `change` naming the directory itself, which is the platform catching the
   * watch up on what it just missed rather than anything having been written.
   * Reloading for it would reload the browser for nothing every time a process
   * that builds before it mounts starts up. An established directory never
   * reports this, and a real event under the mount always names a file inside
   * it, so dropping it costs nothing.
   */
  private namesTheDirectoryItself(fileName: string | null): boolean {
    return fileName === this.directoryName;
  }
}
