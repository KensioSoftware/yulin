import { SimWatchFilePoll } from "../../src/watch/sim-watch-file-poll.js";
import { TemporaryDirectory } from "../../src/util/filesystem/temporary-directory.js";

const fileName = "Site.template.json";

/**
 * A real file with a real read on it.
 *
 * Reading a file for what it looks like on disk is the whole of what the poll
 * does, so a stand-in for the filesystem would leave nothing here worth
 * testing.
 */
export class PolledFile {
  private readonly poll: SimWatchFilePoll;
  private readonly changed: string[] = [];

  private constructor(private readonly directory: TemporaryDirectory) {
    this.poll = new SimWatchFilePoll({
      filePath: directory.join(fileName),
      // Short, so a test waits for a few turns of it rather than for the
      // interval a running simulation reads its templates on.
      intervalMs: 50,
      onChanged: (): void => {
        this.changed.push(fileName);
      },
    });
    this.poll.start();
  }

  /**
   * Write a file and start reading it.
   */
  static async of(): Promise<PolledFile> {
    const directory = new TemporaryDirectory();
    await directory.writeFile(fileName, "initial");

    return new PolledFile(directory);
  }

  /**
   * Save the file, as whatever writes it does.
   */
  async write(content: string): Promise<void> {
    await this.directory.writeFile(fileName, content);
  }

  /**
   * How many changes the read has reported.
   */
  changeCount(): number {
    return this.changed.length;
  }

  /**
   * Wait for the file to have been reported as changed so many times, rather
   * than waiting out how long a read takes on the machine running this.
   */
  async changes(count: number, withinMs = 5000): Promise<void> {
    const giveUpAt = Date.now() + withinMs;

    while (this.changed.length < count) {
      if (Date.now() >= giveUpAt) {
        throw new Error(
          `Polled file reported ${String(this.changed.length)} changes, expected ${String(count)}`,
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
}
