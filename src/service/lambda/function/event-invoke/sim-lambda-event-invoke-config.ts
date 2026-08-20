import { SIM_LAMBDA_LATEST_VERSION } from "../sim-lambda-function-configuration.js";
import type { SimLambdaFunctionName } from "../sim-lambda-function.type.js";

/**
 * How many times real Lambda retries a failed asynchronous invocation when
 * nothing says otherwise.
 */
export const DEFAULT_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS = 2;

/**
 * The most retries real Lambda will make, which is also the most an event
 * invoke config may ask for.
 */
export const MAX_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS = 2;

/**
 * How long real Lambda keeps trying an asynchronous event by default, which is
 * six hours.
 */
export const DEFAULT_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS = 21_600;

export const MIN_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS = 60;
export const MAX_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS = 21_600;

/**
 * How long each retry of a failed asynchronous invocation waits before it
 * runs.
 *
 * Real Lambda leaves about a minute before the first retry and about two
 * before the second. The waits happen on the simulation's own clock, so a test
 * reaches a retry by advancing time rather than by waiting for it.
 */
export const SIM_LAMBDA_RETRY_DELAYS_SECONDS: readonly number[] = [60, 120];

/**
 * Why an asynchronous invocation ended up at the destination it did.
 */
export type SimLambdaInvocationCondition =
  | "Success"
  | "RetriesExhausted"
  | "EventAgeExceeded";

/**
 * One end of a destination config, which is a destination or the absence of
 * one.
 *
 * `Destination` is optional because AWS takes a destination away by sending
 * the member with nothing in it.
 */
export interface SimLambdaDestination {
  Destination?: string | undefined;
}

/**
 * Where the results of a function's asynchronous invocations are sent.
 */
export interface SimLambdaDestinationConfiguration {
  OnSuccess?: SimLambdaDestination | undefined;
  OnFailure?: SimLambdaDestination | undefined;
}

/**
 * How a function handles one asynchronous invocation.
 */
export interface SimLambdaEventInvokeSettings {
  readonly maximumRetryAttempts: number;
  readonly maximumEventAgeInSeconds: number;
  readonly onSuccessArn?: string | undefined;
  readonly onFailureArn?: string | undefined;
}

/**
 * What a caller may set on an event invoke config.
 *
 * Every setting is optional because both commands that write one may leave any
 * of them out. Put takes the ones it was given and returns the rest to their
 * defaults, and Update leaves an omitted one as it stands.
 */
export interface SimLambdaEventInvokeConfigUpdate {
  readonly maximumRetryAttempts?: number | undefined;
  readonly maximumEventAgeInSeconds?: number | undefined;
  readonly onSuccessArn?: string | undefined;
  readonly onFailureArn?: string | undefined;
}

/**
 * How one function, version or alias handles its asynchronous invocations.
 *
 * The retry settings and the destinations live together because that is how
 * AWS holds them: one config per qualifier, written by one command.
 */
export interface SimLambdaEventInvokeConfig {
  readonly functionName: SimLambdaFunctionName | string;
  readonly qualifier: string | undefined;
  readonly functionArn: string;
  readonly settings: SimLambdaEventInvokeSettings;
  readonly lastModified: Date;
}

/**
 * Minimal structural event invoke configuration, as returned by the
 * PutFunctionEventInvokeConfig, GetFunctionEventInvokeConfig and
 * UpdateFunctionEventInvokeConfig commands.
 */
export interface SimLambdaEventInvokeConfiguration {
  FunctionArn: string;
  MaximumRetryAttempts: number;
  MaximumEventAgeInSeconds: number;
  DestinationConfig: SimLambdaDestinationConfiguration;
  LastModified: Date;
}

/**
 * Which function and qualifier a config belongs to.
 */
export interface SimLambdaEventInvokeConfigKey {
  readonly functionName: SimLambdaFunctionName | string;
  readonly qualifier?: string | undefined;
}

/**
 * One config to write, and what to write into it.
 */
export interface SimLambdaEventInvokeConfigWrite extends SimLambdaEventInvokeConfigKey {
  readonly functionArn: string;
  readonly update: SimLambdaEventInvokeConfigUpdate;
}

/**
 * What one config is held under, which is its function and its qualifier.
 *
 * A config written without a qualifier belongs to `$LATEST`, which is how AWS
 * addresses the function itself.
 */
export function simLambdaEventInvokeStoreKey(
  key: SimLambdaEventInvokeConfigKey,
): string {
  return `${key.functionName}:${key.qualifier ?? SIM_LAMBDA_LATEST_VERSION}`;
}
