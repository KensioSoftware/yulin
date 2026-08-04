import type { SimLambdaFunctionResponseType } from "../../event-source/sim-lambda-event-source-mapping.js";
import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * The response types the function reports, refusing one Lambda does not have.
 *
 * Both event sources take a batch item failure report, and each does its own
 * thing with it: a queue takes back the messages a report names, and a stream
 * goes back to the record it names and delivers everything from there again.
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
