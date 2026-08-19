import { unwatchFile, watchFile } from "node:fs";

interface SimWatchFilePollProperties {
  readonly filePath: string;
  readonly intervalMs: number;
  readonly onChanged: () => void;
}

/**
 * Notices a file changing by reading it, rather than by being told.
 *
 * This stands behind a filesystem watch rather than replacing one. macOS hands
 * a process every event it asked for over a single FSEvents stream, and libuv
 * rebuilds that stream from the current instant whenever any watch in the
 * process is started or closed. A write that lands during the rebuild reaches
 * nothing: the watch stays open, reports no error, and simply never mentions
 * the save. A process that watches a template while it also mounts a directory
 * into a Bucket, deploys a second Stack from the same cloud assembly, or serves
 * with live reload is a process where that keeps happening.
 *
 * Reading the file asks the file rather than the platform, so it answers
 * whatever the stream is doing. It is the slower of the two and the one that
 * always works, which is why both are here: the event is what makes a save feel
 * immediate, and this is what makes sure it arrives.
 *
 * Nothing here tries to tell a save the watch reported from one it lost, and
 * every read that finds a change reports it. A settle window turns the two of
 * them into the one change they are, and it is the same window that already
 * turns one editor save into one change.
 */
export class SimWatchFilePoll {
  private readonly filePath: string;
  private readonly intervalMs: number;

  // Held as one function so it can be taken off the file again. Node keys
  // polled files by path and by listener, which is what lets two Stacks
  // deployed from one file each stop reading it without stopping the other.
  private readonly onPolled: () => void;

  constructor(properties: SimWatchFilePollProperties) {
    this.filePath = properties.filePath;
    this.intervalMs = properties.intervalMs;
    this.onPolled = properties.onChanged;
  }

  /**
   * Start reading the file, and report it changing.
   *
   * A file that is not there yet is read all the same, and reports itself once
   * it appears.
   */
  start(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    watchFile(this.filePath, { interval: this.intervalMs }, this.onPolled);
  }

  /**
   * Stop reading it, so nothing is left holding the process open.
   */
  close(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    unwatchFile(this.filePath, this.onPolled);
  }
}
