import {
  type SimClock,
  SimRealClock,
} from "../../../../util/clock/sim-clock.js";
import type { SimLambdaFunctionName } from "../sim-lambda-function.type.js";
import type {
  SimLambdaEventInvokeConfig,
  SimLambdaEventInvokeConfigKey,
  SimLambdaEventInvokeConfigWrite,
  SimLambdaEventInvokeSettings,
} from "./sim-lambda-event-invoke-config.js";
import { simLambdaEventInvokeStoreKey } from "./sim-lambda-event-invoke-config.js";
import {
  defaultSimLambdaEventInvokeSettings,
  requireSimLambdaEventInvokeConfig,
  writtenSimLambdaEventInvokeSettings,
} from "./sim-lambda-event-invoke-settings.js";

interface SimLambdaEventInvokeConfigStoreProperties {
  readonly clock?: SimClock | undefined;
}

/**
 * Event invoke config state for one Account/Region scope of simulated Lambda.
 *
 * A function has one config per qualifier, so `$LATEST`, a published version
 * and an alias each hold their own.
 */
export class SimLambdaEventInvokeConfigStore {
  private readonly configs = new Map<string, SimLambdaEventInvokeConfig>();
  private readonly clock: SimClock;

  constructor(properties: SimLambdaEventInvokeConfigStoreProperties = {}) {
    this.clock = properties.clock ?? new SimRealClock();
  }

  /**
   * Get the config a function name and qualifier together name, if there is
   * one.
   */
  get(
    key: SimLambdaEventInvokeConfigKey,
  ): SimLambdaEventInvokeConfig | undefined {
    return this.configs.get(simLambdaEventInvokeStoreKey(key));
  }

  /**
   * Get a config, or fail as AWS does when the qualifier has none.
   */
  require(
    key: SimLambdaEventInvokeConfigKey,
    functionArn: string,
  ): SimLambdaEventInvokeConfig {
    return requireSimLambdaEventInvokeConfig(this.get(key), functionArn);
  }

  /**
   * Every config a function holds, across its qualifiers.
   */
  allForFunction(
    functionName: SimLambdaFunctionName | string,
  ): readonly SimLambdaEventInvokeConfig[] {
    return this.configs
      .values()
      .filter((config) => config.functionName === functionName)
      .toArray();
  }

  /**
   * Write a whole config, as PutFunctionEventInvokeConfig does.
   *
   * A setting the caller left out goes back to its default, since Put writes
   * the whole config rather than part of it.
   */
  put(write: SimLambdaEventInvokeConfigWrite): SimLambdaEventInvokeConfig {
    return this.written(write, defaultSimLambdaEventInvokeSettings());
  }

  /**
   * Change the settings a request named, as UpdateFunctionEventInvokeConfig
   * does, leaving the rest alone and failing when there is no config to
   * change.
   */
  update(write: SimLambdaEventInvokeConfigWrite): SimLambdaEventInvokeConfig {
    return this.written(write, this.require(write, write.functionArn).settings);
  }

  /**
   * Delete a config, failing as AWS does when the qualifier has none.
   */
  delete(key: SimLambdaEventInvokeConfigKey, functionArn: string): void {
    this.require(key, functionArn);
    this.configs.delete(simLambdaEventInvokeStoreKey(key));
  }

  /**
   * Forget every config a function holds.
   *
   * Deleting a function takes its configs with it, and a function that never
   * had one is nothing to fail over, unlike a DeleteFunctionEventInvokeConfig
   * request.
   */
  deleteForFunction(functionName: SimLambdaFunctionName | string): void {
    for (const config of this.allForFunction(functionName)) {
      this.configs.delete(simLambdaEventInvokeStoreKey(config));
    }
  }

  private written(
    write: SimLambdaEventInvokeConfigWrite,
    base: SimLambdaEventInvokeSettings,
  ): SimLambdaEventInvokeConfig {
    const config: SimLambdaEventInvokeConfig = {
      functionName: write.functionName,
      qualifier: write.qualifier,
      functionArn: write.functionArn,
      settings: writtenSimLambdaEventInvokeSettings(base, write.update),
      lastModified: this.clock.now(),
    };
    this.configs.set(simLambdaEventInvokeStoreKey(write), config);

    return config;
  }
}
