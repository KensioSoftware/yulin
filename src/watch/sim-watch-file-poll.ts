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
 * A save the watch did report is the same save this finds a moment later, and
 * acting on it twice is two updates for one change. `reported()` is how the
 * watch says it got there first, and the next read to find the file changed
 * stays quiet about it.
 */
export class SimWatchFilePoll {
  private readonly filePath: string;
  private readonly intervalMs: number;
  private readonly onChanged: () => void;
  private reportedElsewhere = false;

  // Held as one function so it can be taken off the file again. Node keys
  // polled files by path and by listener, which is what lets two Stacks
  // deployed from one file each stop reading it without stopping the other.
  private readonly onPolled = (): void => {
    if (this.reportedElsewhere) {
      this.reportedElsewhere = false;

      return;
    }

    this.onChanged();
  };

  constructor(properties: SimWatchFilePollProperties) {
    this.filePath = properties.filePath;
    this.intervalMs = properties.intervalMs;
    this.onChanged = properties.onChanged;
  }

  /**
   * Start reading the file, and report it changing.
   *
   * Starting is asking for a first look rather than taking one, and a save
   * landing before that look is part of the state the file is found in. The
   * deployment that starts a watch has just read the template, so the save this
   * would miss is one it already has.
   */
  start(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    watchFile(this.filePath, { interval: this.intervalMs }, this.onPolled);
  }

  /**
   * Say that a save has been reported by whatever this stands behind, so the
   * next change found here is taken as that same save.
   *
   * Only the next one. Two saves inside a single interval, where the watch
   * reported the first and lost the second, leave the second for the save after
   * it to carry, because one read of the file cannot tell two writes apart.
   */
  reported(): void {
    this.reportedElsewhere = true;
  }

  /**
   * Stop reading it, so nothing is left holding the process open.
   */
  close(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    unwatchFile(this.filePath, this.onPolled);
  }
}
