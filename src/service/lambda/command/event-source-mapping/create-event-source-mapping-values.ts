import type { SimLambdaEventSourceArn } from "../../event-source/sim-lambda-event-source-arn.js";
import type { SimLambdaFunctionResponseType } from "../../event-source/sim-lambda-event-source-mapping.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * The response types the function reports, refusing one Lambda does not have
 * and one the event source has no simulated rule for.
 *
 * A batch item failure report means different things to the two sources. A
 * queue takes back the messages a report names; a stream retries the batch from
 * the record it names onward, and a failing stream batch is retried whole here.
 * Accepting the flag on a stream mapping would be a mapping that says it does
 * one thing and does another, which is
 * https://github.com/KensioSoftware/yulin/issues/342.
 */
export function functionResponseTypesIn(
  input: SimCreateEventSourceMappingCommandInput,
  eventSourceArn: SimLambdaEventSourceArn,
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

  if (responseTypes.length > 0 && eventSourceArn.kind === "dynamodb-stream") {
    throw new SimLambdaInvalidParameterValueException(
      "FunctionResponseTypes on a DynamoDB stream event source mapping is " +
        "not simulated: a stream retries a batch from the record a report " +
        "names onward, rather than taking back the records it names, and a " +
        "failing batch is retried whole here",
    );
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
