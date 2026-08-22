import { resolveSimSdkCommandRouter } from "../../../../sdk/router/resolve-sim-sdk-command-router.js";
import type { SimSdkCommandRoute } from "../../../../sdk/router/sim-sdk-command-router.type.js";
import type { JSONValue } from "../../../../util/type-guard/json.js";
import { isRecord } from "../../../../util/type-guard/record.js";
import { SimStatesTaskFailure } from "../../error/sim-step-functions.error.js";
import type { SimStatesTaskRequest } from "../sim-states-task-target.js";
import type { SimStatesServiceCall } from "./sim-states-service-shape.js";

/**
 * Find one operation on a simulated service, in the state machine's own
 * Account and Region.
 *
 * The service comes into existence here, on the first task that calls it, so a
 * state machine that is never run reaches nothing. An operation the simulated
 * service has no implementation for is refused here rather than when the state
 * machine was created, because the operations a service runs belong to the
 * service and there was none to ask then.
 */
export function simStatesServiceRoute(
  task: SimStatesTaskRequest,
  call: SimStatesServiceCall,
): SimSdkCommandRoute {
  const { serviceId } = call.service;
  const router = resolveSimSdkCommandRouter(
    task.simAws,
    serviceId,
    task.scope.accountId,
    task.scope.regionName,
  );
  const route = router.route(call.commandName);

  if (route === undefined) {
    throw new SimStatesTaskFailure(
      `The Task state ${task.stateName} calls ${call.operation} on ` +
        `${serviceId}, which this simulator does not run. It runs ` +
        `${operationNames(router.supportedCommandNames()).join(", ")}.`,
    );
  }

  return route;
}

/**
 * Read what the service answered as the JSON the execution carries on with.
 *
 * The SDK's own response metadata is dropped, because a task's result is the
 * API's answer rather than the client's. The rest crosses the same JSON
 * serialisation a real response does, so a date the service stamped reaches
 * the next state as the string it would there.
 */
export function simStatesServiceResult(answered: unknown): JSONValue {
  if (!isRecord(answered)) {
    return (answered ?? null) as JSONValue;
  }

  const { $metadata: _metadata, ...rest } = answered;
  const serialised = JSON.stringify(rest);

  return JSON.parse(serialised) as JSONValue;
}

/**
 * The operations a simulated service runs, written the way an integration
 * names them.
 */
function operationNames(commandNames: readonly string[]): readonly string[] {
  return commandNames
    .map((name) => name.replace(/Command$/, ""))
    .map((name) => `${name.charAt(0).toLowerCase()}${name.slice(1)}`)
    .toSorted((one, other) => one.localeCompare(other));
}
