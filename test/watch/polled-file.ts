import { rename } from "node:fs/promises";
import { SimWatchFilePoll } from "../../src/watch/sim-watch-file-poll.js";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";

const fileName = "Site.template.json";
const pendingName = "Site.template.json.pending";

/**
 * A real file with a real read on it.
 *
 * Reading a file for what it looks like on disk is the whole of what the poll
 * does, so a stand-in for the filesystem would leave nothing here worth
 * testing.
 */
export class PolledFile {
  readonly poll: SimWatchFilePoll;

  private changed = 0;
  private saves = 0;

  private constructor(private readonly directory: TemporaryDirectory) {
    this.poll = new SimWatchFilePoll({
      filePath: directory.join(fileName),
      // Short, so a test waits for a few turns of it rather than for the
      // interval a running simulation reads its templates on.
      intervalMs: 50,
      onChanged: (): void => {
        this.changed++;
      },
    });
    this.poll.start();
  }

  /**
   * Write a file, start reading it, and wait until the read is running.
   */
  static async of(): Promise<PolledFile> {
    const directory = new TemporaryDirectory();
    await directory.writeFile(fileName, "initial");
    const polled = new PolledFile(directory);

    try {
      await polled.running();
    } catch (error) {
      polled.close();

      throw error;
    }

    return polled;
  }

  /**
   * Save the file, in one move.
   *
   * Every save is a different length. A read comparing what the file looks like
   * has that to go on wherever the timestamps behind it are coarser than the
   * gap between two saves.
   *
   * The bytes go to a file beside it and are renamed over it, the way an editor
   * saves. Writing in place empties the file and fills it a moment later, and a
   * read landing between the two finds two changes in the one save.
   */
  async write(): Promise<void> {
    this.saves++;
    await this.directory.writeFile(pendingName, "save".repeat(this.saves));
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    await rename(
      this.directory.join(pendingName),
      this.directory.join(fileName),
    );
  }

  /**
   * How many changes the read has reported.
   */
  changeCount(): number {
    return this.changed;
  }

  /**
   * Wait for the file to have been reported as changed so many times, rather
   * than waiting out how long a read takes on the machine running this.
   */
  async changes(count: number, withinMs = 5000): Promise<void> {
    const giveUpAt = Date.now() + withinMs;

    while (this.changed < count) {
      if (Date.now() >= giveUpAt) {
        throw new Error(
          `Polled file reported ${String(this.changed)} changes, expected ${String(count)}`,
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- waiting on a real read
      await this.pause(20);
    }
  }

  /**
   * Give the read several turns to happen, for a test asserting it stayed
   * quiet.
   */
  async pause(milliseconds: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  /**
   * Stop reading it, so nothing is left holding the test process open.
   */
  close(): void {
    this.poll.close();
  }

  /**
   * Wait until the read has taken its first look at the file.
   *
   * Starting one asks for that look rather than taking it, and a save arriving
   * before it is part of the state the file is found in. A test about what a
   * save does starts from a read that has already looked, so it saves until one
   * is reported and then counts from zero again.
   */
  private async running(withinMs = 5000): Promise<void> {
    const giveUpAt = Date.now() + withinMs;

    while (this.changed === 0) {
      if (Date.now() >= giveUpAt) {
        throw new Error(
          "Polled file never reported the save it was started on",
        );
      }

      // oxlint-disable-next-line no-await-in-loop -- waiting on a real read
      await this.write();
      // oxlint-disable-next-line no-await-in-loop -- waiting on a real read
      await this.pause(20);
    }

    await this.quiet();
    this.changed = 0;
  }

  /**
   * Wait for the read to catch up with the saves that started it.
   *
   * The loop above saves faster than the read looks. The look that reports a
   * save can be one taken before the last of them, leaving a save for the look
   * after it to find. That one arrives in the middle of the test, as a change
   * the test did nothing to cause. Waiting for the count to hold still leaves
   * the read level with the file.
   */
  private async quiet(): Promise<void> {
    let seen = -1;

    while (seen !== this.changed) {
      seen = this.changed;
      // oxlint-disable-next-line no-await-in-loop -- waiting on a real read
      await this.pause(300);
    }
  }
}
