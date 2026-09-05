import { randomUUID } from "node:crypto";
import type {
  SimLambdaStreamFailureRecord,
  StreamFailureRecordProperties,
} from "./sim-lambda-stream-failure-record.js";

/** Build invocation metadata for a stream failure notification. */
export function streamFailureContext(
  properties: StreamFailureRecordProperties,
): Pick<SimLambdaStreamFailureRecord, "requestContext" | "responseContext"> {
  return {
    requestContext: {
      requestId: randomUUID(),
      functionArn: properties.mapping.functionArn,
      condition: properties.discard.condition,
      approximateInvokeCount: properties.invokeCount,
    },
    ...(properties.invokeCount > 0 && {
      responseContext: {
        statusCode: 200,
        executedVersion: properties.simFunction.version,
        ...(properties.functionError && { functionError: "Unhandled" }),
      },
    }),
  };
}
