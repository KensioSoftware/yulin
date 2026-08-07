import fs, { type FSWatcher } from "node:fs";
import path from "node:path";

interface SimCfnTemplateFileEventsProperties {
  readonly templatePath: string;
  readonly onEvent: () => void;
}

/**
 * Filesystem events for one template file.
 *
 * The directory is what gets watched, not the file. A synthesis writes a
 * temporary file and renames it over the template, so a watch on the file
 * itself is left holding the file that was replaced. Events for anything else
 * in the directory, which for a cloud assembly is every other stack in it and
 * every staged asset, are dropped by name.
 */
export class SimCfnTemplateFileEvents {
  private readonly directoryPath: string;
  private readonly fileName: string;
  private readonly onEvent: () => void;
  private watcher: FSWatcher | undefined;

  constructor(properties: SimCfnTemplateFileEventsProperties) {
    this.directoryPath = path.dirname(properties.templatePath);
    this.fileName = path.basename(properties.templatePath);
    this.onEvent = properties.onEvent;
  }

  /**
   * Start listening for writes to the template file.
   */
  start(): void {
    // oxlint-disable-next-line security/detect-non-literal-fs-filename
    const watcher = fs.watch(this.directoryPath, (_event, fileName) => {
      if (fileName === this.fileName) {
        this.onEvent();
      }
    });

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
}
