import { SimLambdaResourceNotFoundException } from "../../error/sim-lambda.error.js";
import {
  DEFAULT_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS,
  DEFAULT_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS,
  type SimLambdaEventInvokeConfig,
  type SimLambdaEventInvokeConfigUpdate,
  type SimLambdaEventInvokeConfiguration,
  type SimLambdaEventInvokeSettings,
  SIM_LAMBDA_RETRY_DELAYS_SECONDS,
} from "./sim-lambda-event-invoke-config.js";

const millisecondsPerSecond = 1000;

/**
 * How a function with no event invoke config of its own behaves.
 */
export function defaultSimLambdaEventInvokeSettings(): SimLambdaEventInvokeSettings {
  return {
    maximumRetryAttempts: DEFAULT_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS,
    maximumEventAgeInSeconds: DEFAULT_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS,
  };
}

/**
 * Write settings over the ones a config holds now.
 *
 * A setting the caller left out arrives as `undefined`, and spreading that
 * over what is there would take it away rather than leave it alone, so the
 * absent ones are dropped first.
 */
export function writtenSimLambdaEventInvokeSettings(
  base: SimLambdaEventInvokeSettings,
  update: SimLambdaEventInvokeConfigUpdate,
): SimLambdaEventInvokeSettings {
  const named = Object.entries(update).filter(
    ([, value]) => value !== undefined,
  );

  return { ...base, ...Object.fromEntries(named) };
}

/**
 * One config as the SDK commands report it.
 */
export function simLambdaEventInvokeConfiguration(
  config: SimLambdaEventInvokeConfig,
): SimLambdaEventInvokeConfiguration {
  const { onSuccessArn, onFailureArn } = config.settings;

  return {
    FunctionArn: config.functionArn,
    MaximumRetryAttempts: config.settings.maximumRetryAttempts,
    MaximumEventAgeInSeconds: config.settings.maximumEventAgeInSeconds,
    DestinationConfig: {
      OnSuccess:
        onSuccessArn === undefined ? undefined : { Destination: onSuccessArn },
      OnFailure:
        onFailureArn === undefined ? undefined : { Destination: onFailureArn },
    },
    LastModified: config.lastModified,
  };
}

/**
 * Answer with a config, or fail as AWS does when there is none.
 */
export function requireSimLambdaEventInvokeConfig(
  config: SimLambdaEventInvokeConfig | undefined,
  functionArn: string,
): SimLambdaEventInvokeConfig {
  if (config === undefined) {
    throw new SimLambdaResourceNotFoundException(
      `The function ${functionArn} doesn't have an EventInvokeConfig`,
    );
  }

  return config;
}

/**
 * When the next retry of a failed asynchronous invocation falls due.
 *
 * Real Lambda leaves about a minute before the first retry and about two
 * before the second. An attempt past those waits as long as the last one,
 * which is only reachable where a config asks for more retries than AWS
 * allows.
 */
export function simLambdaRetryDueTime(now: Date, attemptCount: number): Date {
  const seconds =
    SIM_LAMBDA_RETRY_DELAYS_SECONDS[attemptCount - 1] ??
    SIM_LAMBDA_RETRY_DELAYS_SECONDS.at(-1) ??
    0;

  return new Date(now.getTime() + seconds * millisecondsPerSecond);
}

/**
 * Whether an event has been waiting longer than its function keeps trying.
 */
export function simLambdaEventTooOld(
  startedAt: Date,
  now: Date,
  settings: SimLambdaEventInvokeSettings,
): boolean {
  const waited = (now.getTime() - startedAt.getTime()) / millisecondsPerSecond;

  return waited >= settings.maximumEventAgeInSeconds;
}
