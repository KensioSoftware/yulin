import type {
  JSONObject,
  JSONValue,
} from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimStatesServiceShape } from "./sim-states-service-shape.js";

/**
 * One of the integrations Step Functions optimises, and the call it makes.
 */
export interface SimStatesOptimizedIntegration {
  /**
   * The AWS SDK service the integration calls. A `Resource` can name it by
   * another.
   */
  readonly serviceId: string;

  /**
   * The operation as the API writes it.
   */
  readonly operation: string;

  /**
   * What the integration does to the request and the result, where its shape
   * is not the API's own.
   */
  readonly shape?: SimStatesServiceShape;
}

/**
 * The integrations Step Functions optimises, by what a `Resource` writes after
 * `arn:aws:states:::`.
 *
 * An optimized integration is the same call an `aws-sdk` integration makes,
 * with a shape of its own around it. The three that carry a message let it be
 * written as JSON rather than as a string, and `states:startExecution` writes
 * the request in the capitals Amazon States Language uses rather than the ones
 * the Step Functions API does.
 *
 * `lambda:invoke` is not here. A `Task` state invoking a function talks to the
 * function rather than to a simulated service, and reads a handler raising as
 * a task failure of its own.
 */
export const simStatesOptimizedIntegrations: ReadonlyMap<
  string,
  SimStatesOptimizedIntegration
> = new Map<string, SimStatesOptimizedIntegration>([
  ["dynamodb:putItem", { serviceId: "DynamoDB", operation: "putItem" }],
  ["dynamodb:getItem", { serviceId: "DynamoDB", operation: "getItem" }],
  ["dynamodb:updateItem", { serviceId: "DynamoDB", operation: "updateItem" }],
  ["dynamodb:deleteItem", { serviceId: "DynamoDB", operation: "deleteItem" }],
  [
    "sns:publish",
    {
      serviceId: "SNS",
      operation: "publish",
      shape: { request: (parameters) => serialised(parameters, "Message") },
    },
  ],
  [
    "sqs:sendMessage",
    {
      serviceId: "SQS",
      operation: "sendMessage",
      shape: { request: (parameters) => serialised(parameters, "MessageBody") },
    },
  ],
  [
    "events:putEvents",
    {
      serviceId: "EventBridge",
      operation: "putEvents",
      shape: { request: putEventsRequest },
    },
  ],
  [
    "states:startExecution",
    {
      serviceId: "SFN",
      operation: "startExecution",
      shape: { request: startExecutionRequest, answer: startExecutionAnswer },
    },
  ],
]);

/**
 * Write a field that carries a message as the string the API takes.
 *
 * An optimized integration lets the message be built as JSON, the way
 * `Parameters` build anything else, and sends it as the string a real call
 * carries.
 */
function serialised(parameters: JSONObject, field: string): JSONObject {
  // The field is one of this file's own, rather than anything a definition
  // wrote.
  // oxlint-disable-next-line security/detect-object-injection
  const value = parameters[field];

  if (value === undefined || typeof value === "string") {
    return parameters;
  }

  return { ...parameters, [field]: JSON.stringify(value) };
}

/**
 * Serialise the `Detail` of every entry. That is where a `PutEvents` carries
 * its message.
 */
function putEventsRequest(parameters: JSONObject): JSONObject {
  const entries = parameters["Entries"];

  if (!Array.isArray(entries)) {
    return parameters;
  }

  return {
    ...parameters,
    Entries: entries.map((entry) =>
      isRecord(entry) ? serialised(entry, "Detail") : entry,
    ),
  };
}

/**
 * Write a `StartExecution` the way the Step Functions API takes it.
 *
 * The integration names the fields with a capital and the API does not, and
 * the input can be written as JSON rather than as the string a real call
 * carries.
 */
function startExecutionRequest(parameters: JSONObject): JSONObject {
  const input = parameters["Input"];

  return {
    stateMachineArn: parameters["StateMachineArn"] ?? null,
    ...(parameters["Name"] !== undefined && { name: parameters["Name"] }),
    ...(input !== undefined && {
      input: typeof input === "string" ? input : JSON.stringify(input),
    }),
  };
}

/**
 * Answer the way the integration does. The result is the execution that
 * started, and when it started.
 */
function startExecutionAnswer(result: JSONValue): JSONValue {
  if (!isRecord(result)) {
    return result;
  }

  return {
    ExecutionArn: result["executionArn"] ?? null,
    StartDate: result["startDate"] ?? null,
  };
}
