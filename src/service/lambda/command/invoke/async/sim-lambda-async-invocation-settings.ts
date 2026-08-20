import type { SimLambdaEventInvokeConfigStore } from "../../../function/event-invoke/sim-lambda-event-invoke-config-store.js";
import type { SimLambdaEventInvokeSettings } from "../../../function/event-invoke/sim-lambda-event-invoke-config.js";
import { defaultSimLambdaEventInvokeSettings } from "../../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";

/**
 * Everything one asynchronous invocation needs to know about how its function
 * handles failure.
 */
export interface SimLambdaAsyncInvocationSettings extends SimLambdaEventInvokeSettings {
  readonly deadLetterArn?: string | undefined;
}

interface SimLambdaAsyncInvocationSettingsProperties {
  readonly simFunction: SimLambdaFunction;
  readonly qualifier: string | undefined;
  readonly configs: SimLambdaEventInvokeConfigStore | undefined;
}

/**
 * Read what an invocation should do from the function and the event invoke
 * config the qualifier it ran under holds.
 *
 * A qualified invocation uses the config of the version or alias it named, and
 * falls back to the function's own where that qualifier has none, so a
 * function configured once behaves the same however it is addressed. A
 * function with no config at all is retried the default number of times and
 * sends its results nowhere.
 *
 * The dead-letter target comes from the function itself, since that is where
 * AWS keeps it.
 */
export function simLambdaAsyncInvocationSettings(
  properties: SimLambdaAsyncInvocationSettingsProperties,
): SimLambdaAsyncInvocationSettings {
  const { simFunction, qualifier, configs } = properties;
  const functionName = simFunction.name;
  const config =
    configs?.get({ functionName, qualifier }) ?? configs?.get({ functionName });

  return {
    ...(config?.settings ?? defaultSimLambdaEventInvokeSettings()),
    deadLetterArn: simFunction.deadLetterTargetArn,
  };
}
