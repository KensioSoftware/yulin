import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import { SimLambdaFilterCriteria } from "../../event-source/filter/sim-lambda-filter-criteria.js";
import { simLambdaEventSourceArnOf } from "../../event-source/sim-lambda-event-source-arn.js";
import type { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceMappingUpdate } from "../../event-source/sim-lambda-event-source-mapping-update.js";
import {
  refuseUnsimulatedInput,
  refuseUnsupportedEventSourceInput,
} from "./create-event-source-mapping-refusals.js";
import { enabledIn } from "./create-event-source-mapping-values.js";
import type { SimUpdateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * The members real Lambda lets an update change that this simulation keeps as
 * they were created.
 *
 * Each of them is wired into a poller when the mapping is made, so changing one
 * would mean rebuilding the poller mid-stream. Refusing one says so, rather
 * than reporting a change the mapping goes on ignoring.
 */
const fixedAtCreation: ReadonlySet<string> = new Set([
  "FunctionName",
  "FunctionResponseTypes",
  "DestinationConfig",
  "MaximumRetryAttempts",
  "MaximumRecordAgeInSeconds",
  "BisectBatchOnFunctionError",
]);

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

  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined && fixedAtCreation.has(name)) {
      throw new SimLambdaInvalidParameterValueException(
        `${name} cannot be changed on a simulated event source mapping. ` +
          "Delete the mapping and create it again with the new value",
      );
    }
  }

  const eventSourceArn = simLambdaEventSourceArnOf(mapping.eventSourceArn);

  return {
    batchSize:
      input.BatchSize === undefined
        ? undefined
        : eventSourceArn.batchRules.sizeIn(input.BatchSize),
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
    updatedAt,
  };
}
