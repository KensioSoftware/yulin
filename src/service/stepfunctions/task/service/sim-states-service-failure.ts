import {
  SimStatesServiceFailure,
  SimStatesTaskFailure,
} from "../../error/sim-step-functions.error.js";
import type { SimStatesServiceCall } from "./sim-states-service-shape.js";

/**
 * The error names JavaScript gives its own failures.
 *
 * A service names what it refused, and anything raising under one of these
 * names is not the service answering: it is something going wrong on the way
 * there.
 */
const javascriptErrorNames = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

/**
 * What a service refusing a task's call is called.
 *
 * Amazon States Language names a service error after the service and the error
 * together, so `Retry` and `Catch` can tell one refusal from another. A
 * conditional write that did not hold fails the task as
 * `DynamoDb.ConditionalCheckFailedException`, and a role that may not write
 * fails it as `DynamoDb.AccessDenied`, the name simulated IAM gives a
 * refusal.
 *
 * Anything raising under a JavaScript error name never reached the service, so
 * it fails the task as `States.TaskFailed` rather than being reported as
 * something the service said.
 */
export function simStatesServiceFailure(
  error: unknown,
  call: SimStatesServiceCall,
  stateName: string,
): Error {
  const raised = error instanceof Error ? error.name : "";
  const said = error instanceof Error ? error.message : String(error);
  const message =
    `The ${call.operation} call the Task state ${stateName} made was ` +
    `refused: ${said}`;

  if (raised === "" || javascriptErrorNames.has(raised)) {
    return new SimStatesTaskFailure(message);
  }

  return new SimStatesServiceFailure(
    message,
    `${call.service.errorPrefix}.${raised}`,
  );
}
