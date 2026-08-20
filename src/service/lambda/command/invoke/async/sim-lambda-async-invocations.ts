import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimLambdaDestinationTargets } from "../../../destination/sim-lambda-destination-targets.js";
import type { SimLambdaEventInvokeConfigStore } from "../../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import { SimLambdaAsyncInvocation } from "./sim-lambda-async-invocation.js";
import { simLambdaAsyncInvocationSettings } from "./sim-lambda-async-invocation-settings.js";

interface SimLambdaAsyncInvocationsProperties {
  readonly background: BackgroundScheduler;
  readonly destinations: SimLambdaDestinationTargets;
  readonly eventInvokeConfigs: SimLambdaEventInvokeConfigStore | undefined;
}

/**
 * Where an accepted Event invocation goes to be run.
 *
 * The retry and destination settings are read at the moment the invocation
 * starts, so a config written afterwards leaves an invocation already running
 * under the one it began with.
 */
export class SimLambdaAsyncInvocations {
  private readonly properties: SimLambdaAsyncInvocationsProperties;

  constructor(properties: SimLambdaAsyncInvocationsProperties) {
    this.properties = properties;
  }

  /**
   * Start one asynchronous invocation behind the caller who asked for it.
   */
  start(
    simFunction: SimLambdaFunction,
    event: unknown,
    qualifier: string | undefined,
  ): void {
    const { background, destinations, eventInvokeConfigs } = this.properties;

    new SimLambdaAsyncInvocation({
      simFunction,
      event,
      settings: simLambdaAsyncInvocationSettings({
        simFunction,
        qualifier,
        configs: eventInvokeConfigs,
      }),
      background,
      destinations,
    }).start();
  }
}
