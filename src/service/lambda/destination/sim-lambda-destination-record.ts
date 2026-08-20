import type { SimLambdaInvocationCondition } from "../function/event-invoke/sim-lambda-event-invoke-config.js";

/**
 * What Lambda reports about the invocation that produced a destination
 * record.
 */
export interface SimLambdaDestinationRequestContext {
  requestId: string;
  functionArn: string;
  condition: SimLambdaInvocationCondition;
  approximateInvokeCount: number;
}

/**
 * What Lambda reports about the attempt that ended the invocation.
 *
 * An invocation abandoned for age never ran a final attempt, so it carries no
 * response context.
 */
export interface SimLambdaDestinationResponseContext {
  statusCode: number;
  executedVersion: string;
  functionError?: string | undefined;
}

/**
 * The document Lambda sends to an OnSuccess or OnFailure destination.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-retain-records.html
 */
export interface SimLambdaDestinationRecord {
  version: string;
  timestamp: string;
  requestContext: SimLambdaDestinationRequestContext;
  requestPayload: unknown;
  responseContext?: SimLambdaDestinationResponseContext | undefined;
  responsePayload: unknown;
}

interface MakeSimLambdaDestinationRecordProperties {
  readonly requestId: string;
  readonly functionArn: string;
  readonly executedVersion: string;
  readonly condition: SimLambdaInvocationCondition;
  readonly approximateInvokeCount: number;
  readonly timestamp: Date;
  readonly requestPayload: unknown;
  readonly responsePayload: unknown;
  readonly functionError?: string | undefined;
  readonly ran: boolean;
}

/**
 * Build the record one asynchronous invocation sends to its destination.
 */
export function makeSimLambdaDestinationRecord(
  properties: MakeSimLambdaDestinationRecordProperties,
): SimLambdaDestinationRecord {
  const record: SimLambdaDestinationRecord = {
    version: "1.0",
    timestamp: properties.timestamp.toISOString(),
    requestContext: {
      requestId: properties.requestId,
      functionArn: properties.functionArn,
      condition: properties.condition,
      approximateInvokeCount: properties.approximateInvokeCount,
    },
    requestPayload: properties.requestPayload,
    responsePayload: properties.responsePayload,
  };

  if (properties.ran) {
    record.responseContext = {
      statusCode: 200,
      executedVersion: properties.executedVersion,
      functionError: properties.functionError,
    };
  }

  return record;
}
