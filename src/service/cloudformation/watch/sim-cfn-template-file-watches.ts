import path from "node:path";
import type { SimCloudFormationDeployTemplateFileProperties } from "../deploy/sim-cfn-template-file-loader.js";
import type { SimCfnTemplateFileUpdating } from "../deploy/sim-cfn-template-file-updater.js";
import { SimCfnTemplateFileWatch } from "./sim-cfn-template-file-watch.js";
import { SimCfnTemplateWatchUpdate } from "./sim-cfn-template-watch-update.js";
import type { SimCfnTemplateFileWatchOptions } from "./sim-cfn-template-watch.type.js";

interface SimCfnTemplateFileWatchesProperties {
  readonly updater: SimCfnTemplateFileUpdating;
}

/**
 * The template files this simulated CloudFormation is watching.
 *
 * One watch per file, so a template deployed twice is watched once: the second
 * deployment is the live one, and the watch it replaces would be applying the
 * same file to a Stack that is no longer the one it deployed.
 *
 * A watch holds an open filesystem handle, which keeps the process alive, so
 * anything that starts one needs a way to let it go. `stopAll()` is that way,
 * and a long-running dev process simply never calls it.
 */
export class SimCfnTemplateFileWatches {
  private readonly updater: SimCfnTemplateFileUpdating;
  private readonly watches = new Map<string, SimCfnTemplateFileWatch>();

  constructor(properties: SimCfnTemplateFileWatchesProperties) {
    this.updater = properties.updater;
  }

  /**
   * Watch a deployed template file, if the deployment asked to keep reading it.
   */
  watchIfAsked(
    deployment: SimCloudFormationDeployTemplateFileProperties,
  ): void {
    const options = watchOptions(deployment.watch);

    if (options !== undefined) {
      this.add(deployment, options);
    }
  }

  /**
   * Watch a deployed template file, and update its Stack when it changes.
   */
  add(
    deployment: SimCloudFormationDeployTemplateFileProperties,
    options: SimCfnTemplateFileWatchOptions,
  ): void {
    const templatePath = path.resolve(deployment.templatePath);
    const update = new SimCfnTemplateWatchUpdate({
      templatePath,
      deployment,
      updater: this.updater,
      options,
    });

    this.remove(templatePath);

    const watch = new SimCfnTemplateFileWatch({
      templatePath,
      onChanged: async (): Promise<void> => {
        await update.apply();
      },
      settleMs: options.settleMs,
    });

    this.watches.set(templatePath, watch);
    watch.start();
  }

  /**
   * The template files being watched, as `yulin watch` is told about them.
   */
  paths(): readonly string[] {
    return this.watches.keys().toArray();
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

  private remove(templatePath: string): void {
    this.watches.get(templatePath)?.close();
    this.watches.delete(templatePath);
  }
}

/**
 * What a deployment asked for by way of watching, or nothing if it did not.
 */
function watchOptions(
  watch: boolean | SimCfnTemplateFileWatchOptions | undefined,
): SimCfnTemplateFileWatchOptions | undefined {
  if (watch === undefined || watch === false) {
    return undefined;
  }

  if (watch === true) {
    return {};
  }

  return watch;
}
