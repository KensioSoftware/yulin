import type { SimLambdaFunctionArn } from "../function/sim-lambda-function-configuration.js";
import type { SimLambdaFilterCriteria } from "./filter/sim-lambda-filter-criteria.js";
import type {
  SimLambdaEventSourceMappingState,
  SimLambdaFunctionResponseType,
} from "./sim-lambda-event-source-mapping.js";
import type { SimLambdaStreamDestinationConfiguration } from "./sim-lambda-stream-destination-config.js";
import type { SimLambdaEventSourceRetryLimitsInput } from "./sim-lambda-stream-retry-limits.js";

/**
 * The function an update moves a mapping onto.
 */
export interface SimLambdaEventSourceMappingTarget {
  readonly functionName: string;
  readonly qualifier: string | undefined;
  readonly functionArn: SimLambdaFunctionArn;
}

/**
 * What UpdateEventSourceMapping changes about a mapping, each member already
 * checked against the event source's own rules. A member left undefined keeps
 * its value, and a `filterCriteria` of null removes the filters.
 */
export interface SimLambdaEventSourceMappingUpdate {
  readonly batchSize?: number | undefined;
  readonly batchingWindowSeconds?: number | undefined;
  readonly enabled?: boolean | undefined;
  readonly filterCriteria?: SimLambdaFilterCriteria | null | undefined;
  readonly functionResponseTypes?:
    | readonly SimLambdaFunctionResponseType[]
    | undefined;
  readonly destinationConfig?:
    | SimLambdaStreamDestinationConfiguration
    | undefined;
  readonly retryLimits?: SimLambdaEventSourceRetryLimitsInput | undefined;
  readonly target?: SimLambdaEventSourceMappingTarget | undefined;
  readonly updatedAt: Date;
}

/**
 * What a mapping holds now, of the members an update can change.
 */
interface SimLambdaEventSourceMappingCurrent {
  readonly batchSize: number;
  readonly batchingWindowSeconds: number;
  readonly filterCriteria: SimLambdaFilterCriteria | undefined;
}

/**
 * What a mapping holds once an update is applied, and the state it reports
 * on the way there.
 */
interface SimLambdaEventSourceMappingNext {
  readonly batchSize: number;
  readonly batchingWindowSeconds: number;
  readonly filterCriteria: SimLambdaFilterCriteria | undefined;
  readonly enabled: boolean;
  readonly state: SimLambdaEventSourceMappingState;
}

/**
 * Apply an update to what a mapping holds. A member the update leaves out
 * keeps its value, and a null `filterCriteria` removes the filters.
 */
export function simLambdaEventSourceMappingNext(
  current: SimLambdaEventSourceMappingCurrent,
  enabled: boolean,
  update: SimLambdaEventSourceMappingUpdate,
): SimLambdaEventSourceMappingNext {
  const enabling = update.enabled ?? enabled;

  return {
    batchSize: update.batchSize ?? current.batchSize,
    batchingWindowSeconds:
      update.batchingWindowSeconds ?? current.batchingWindowSeconds,
    filterCriteria:
      update.filterCriteria === undefined
        ? current.filterCriteria
        : (update.filterCriteria ?? undefined),
    enabled: enabling,
    state: transitionState(enabled, enabling),
  };
}

/**
 * Whether a mapping in this state is between changes, which is when real
 * Lambda refuses another one with ResourceInUseException.
 */
export function simLambdaEventSourceMappingSettled(
  state: SimLambdaEventSourceMappingState,
): boolean {
  return state === "Enabled" || state === "Disabled";
}

/**
 * The state a mapping passes through on its way from one enabled setting to
 * another.
 */
function transitionState(
  enabled: boolean,
  enabling: boolean,
): SimLambdaEventSourceMappingState {
  if (enabled === enabling) {
    return "Updating";
  }

  return enabling ? "Enabling" : "Disabling";
}
