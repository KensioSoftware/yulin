import {
  DEFAULT_SIM_LAMBDA_EVENT_SOURCE_BATCH_SIZE,
  type SimLambdaFunctionResponseType,
} from "../../event-source/sim-lambda-event-source-mapping.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * The largest batch real Lambda delivers from a standard queue without a
 * batching window to fill it.
 */
const maximumBatchSize = 10;

/**
 * The batch size a mapping delivers with, refusing one a queue with no
 * batching window would never fill.
 */
export function batchSizeIn(
  input: SimCreateEventSourceMappingCommandInput,
): number {
  const batchSize =
    input.BatchSize ?? DEFAULT_SIM_LAMBDA_EVENT_SOURCE_BATCH_SIZE;

  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > maximumBatchSize
  ) {
    throw new SimLambdaInvalidParameterValueException(
      `BatchSize ${String(batchSize)} is out of range: a queue with no ` +
        `batching window delivers a whole number of messages between 1 and ` +
        `${String(maximumBatchSize)} at a time`,
    );
  }

  return batchSize;
}

/**
 * The response types the function reports, refusing one Lambda does not have.
 */
export function functionResponseTypesIn(
  input: SimCreateEventSourceMappingCommandInput,
): readonly SimLambdaFunctionResponseType[] {
  const responseTypes = input.FunctionResponseTypes ?? [];

  for (const responseType of responseTypes) {
    if (responseType !== "ReportBatchItemFailures") {
      throw new SimLambdaValidationException(
        `FunctionResponseTypes value ${responseType} is not a Lambda ` +
          "function response type. ReportBatchItemFailures is the only one",
      );
    }
  }

  return responseTypes as readonly SimLambdaFunctionResponseType[];
}

/**
 * A field a request has to carry, reported the way real Lambda reports a
 * missing one.
 */
export function requiredString(
  value: string | undefined,
  field: string,
): string {
  if (value === undefined || value === "") {
    throw new SimLambdaValidationException(
      `1 validation error detected: Value null at '${field}' failed to ` +
        "satisfy constraint: Member must not be null",
    );
  }

  return value;
}
