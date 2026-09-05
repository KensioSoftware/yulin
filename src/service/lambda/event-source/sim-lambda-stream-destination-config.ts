import { isRecord } from "../../../util/type-guard/record.js";
import { SimLambdaDestinationArn } from "../destination/sim-lambda-destination-arn.js";
import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

export interface SimLambdaStreamDestinationConfiguration {
  readonly OnFailure?:
    | { readonly Destination?: string | undefined }
    | undefined;
}

/** Validate the same destination shape for SDK and CloudFormation requests. */
export function simLambdaStreamDestinationConfig(
  value: unknown,
  sourceKind?: string,
): SimLambdaStreamDestinationConfiguration | undefined {
  if (value === undefined) return undefined;
  if (sourceKind === "sqs") {
    throw new SimLambdaInvalidParameterValueException(
      "DestinationConfig is not supported for SQS event source mappings.",
    );
  }
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "OnFailure")
  ) {
    throw invalid();
  }
  const failure = value["OnFailure"];
  if (failure === undefined) return {};
  if (
    !isRecord(failure) ||
    Object.keys(failure).some((key) => key !== "Destination")
  ) {
    throw invalid();
  }
  const destination = failure["Destination"];
  if (destination === undefined) return { OnFailure: {} };
  if (typeof destination !== "string") throw invalid();
  if (destination !== "") {
    const arn = SimLambdaDestinationArn.of(destination);
    if (
      (arn.service !== "sqs" && arn.service !== "sns") ||
      arn.resource.endsWith(".fifo")
    ) {
      throw invalid();
    }
  }
  return { OnFailure: { Destination: destination } };
}

function invalid(): Error {
  return new SimLambdaInvalidParameterValueException(
    "DestinationConfig supports only OnFailure with a standard SQS queue or SNS topic ARN.",
  );
}
