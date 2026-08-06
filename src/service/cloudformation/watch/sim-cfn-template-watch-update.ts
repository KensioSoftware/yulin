import type { SimCloudFormationDeployTemplateFileProperties } from "../deploy/sim-cfn-template-file-loader.js";
import type { SimCfnTemplateFileUpdating } from "../deploy/sim-cfn-template-file-updater.js";
import { simCfnNoUpdatesMessage } from "../stack/update/sim-cfn-stack-updater.js";
import { SimCfnTemplateWatchReport } from "./sim-cfn-template-watch-report.js";
import type { SimCfnTemplateFileWatchOptions } from "./sim-cfn-template-watch.type.js";

interface SimCfnTemplateWatchUpdateProperties {
  readonly templatePath: string;
  readonly deployment: SimCloudFormationDeployTemplateFileProperties;
  readonly updater: SimCfnTemplateFileUpdating;
  readonly options: SimCfnTemplateFileWatchOptions;
  readonly report?: SimCfnTemplateWatchReport | undefined;
}

/**
 * One application of a changed template file, and what to make of how it went.
 *
 * Three things can come of a save, and only one of them is an update. A file
 * written without being changed is refused by the Stack and is a no-op here,
 * since a template is written far more often than it is changed. An update that
 * failed is reported and left there: the Stack keeps the Resources it had, and
 * a browser looking at them is not told anything changed, because nothing did.
 *
 * Nothing thrown gets past this, because the watch applies changes one after
 * another and a rejection would stop it applying any more.
 */
export class SimCfnTemplateWatchUpdate {
  private readonly properties: SimCfnTemplateWatchUpdateProperties;
  private readonly report: SimCfnTemplateWatchReport;

  constructor(properties: SimCfnTemplateWatchUpdateProperties) {
    this.properties = properties;
    this.report = properties.report ?? new SimCfnTemplateWatchReport();
  }

  /**
   * Apply the template file to its Stack, and answer for the result.
   */
  async apply(): Promise<void> {
    const { deployment, updater } = this.properties;

    try {
      await updater.update(deployment);
    } catch (error) {
      this.refused(watchUpdateError(error));

      return;
    }

    this.updated();
  }

  private refused(error: Error): void {
    if (error.message === simCfnNoUpdatesMessage) {
      return;
    }

    const { templatePath, options } = this.properties;

    if (options.onFailed === undefined) {
      this.report.failed(templatePath, error);

      return;
    }

    this.notify("onFailed", () => {
      options.onFailed?.(error);
    });
  }

  private updated(): void {
    this.notify("onUpdated", this.properties.options.onUpdated);
  }

  /**
   * Run a callback the watch was given, without letting it break the watch.
   *
   * A callback that throws is the caller's own code failing, and it says so
   * rather than being passed on: a throw from here would go on to be the
   * rejection that stops every save after it being applied.
   */
  private notify(listener: string, run: (() => void) | undefined): void {
    try {
      run?.();
    } catch (error) {
      this.report.listenerFailed(
        this.properties.templatePath,
        listener,
        watchUpdateError(error),
      );
    }
  }
}

function watchUpdateError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  /* v8 ignore next -- redundant fallback */
  return new Error(String(error));
}
