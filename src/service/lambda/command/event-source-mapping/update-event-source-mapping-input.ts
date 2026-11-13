import { simLambdaStreamDestinationConfig } from "../../event-source/sim-lambda-stream-destination-config.js";
import { SimLambdaFilterCriteria } from "../../event-source/filter/sim-lambda-filter-criteria.js";
import { simLambdaEventSourceArnOf } from "../../event-source/sim-lambda-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceMappingUpdate } from "../../event-source/sim-lambda-event-source-mapping-update.js";
import {
  refuseUnsimulatedInput,
  refuseUnsupportedEventSourceInput,
} from "./create-event-source-mapping-refusals.js";
import {
  enabledIn,
  functionResponseTypesIn,
} from "./create-event-source-mapping-values.js";
import type { SimUpdateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * Read an UpdateEventSourceMapping request against the mapping it names,
 * checking each change with the rules of that mapping's event source.
 */
export function simLambdaEventSourceMappingUpdateOf(
  input: SimUpdateEventSourceMappingCommandInput,
  mapping: SimLambdaEventSourceMapping,
  updatedAt: Date,
): SimLambdaEventSourceMappingUpdate {
  refuseUnsupportedEventSourceInput(input);
  refuseUnsimulatedInput(input);

  const eventSourceArn = simLambdaEventSourceArnOf(mapping.eventSourceArn);
  const retryLimits = {
    maximumRetryAttempts: input.MaximumRetryAttempts,
    maximumRecordAgeInSeconds: input.MaximumRecordAgeInSeconds,
    bisectBatchOnFunctionError: input.BisectBatchOnFunctionError,
  };

  // Checked by the source's own rules, which refuse all three for a queue.
  eventSourceArn.retryLimitRules.limitsIn(retryLimits);

  const { batchRules } = eventSourceArn;
  const batchSize =
    input.BatchSize === undefined
      ? undefined
      : batchRules.sizeIn(input.BatchSize);

  return {
    batchSize,
    batchingWindowSeconds: batchRules.windowIn(
      input.MaximumBatchingWindowInSeconds ?? mapping.batchingWindowSeconds,
      batchSize ?? mapping.batchSize,
    ),
    enabled: enabledIn(input.Enabled),
    // An empty FilterCriteria is how real Lambda is told to drop the filters,
    // which the criteria reader answers with no criteria at all.
    filterCriteria:
      input.FilterCriteria === undefined
        ? undefined
        : (SimLambdaFilterCriteria.of(
            input.FilterCriteria,
            eventSourceArn.kind,
          ) ?? null),
    functionResponseTypes:
      input.FunctionResponseTypes === undefined
        ? undefined
        : functionResponseTypesIn(input),
    destinationConfig: simLambdaStreamDestinationConfig(
      input.DestinationConfig,
      eventSourceArn.kind,
    ),
    retryLimits,
    updatedAt,
  };
}
