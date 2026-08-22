import { SimStatesUnsimulatedInput } from "../../error/sim-step-functions.error.js";
import type { SimStatesTaskTarget } from "../sim-states-task-target.js";
import { simStatesOptimizedIntegrations } from "./sim-states-optimized-integrations.js";
import {
  simStatesCommandName,
  simStatesSdkService,
  simStatesSdkServiceNames,
  simStatesServiceOf,
} from "./sim-states-service-name.js";
import { SimStatesServiceTarget } from "./sim-states-service-target.js";

/**
 * What a `Resource` writes in front of an SDK integration's service.
 */
const sdkIntegration = "aws-sdk:";

/**
 * The patterns that hold a `Task` state open, which this simulator has no
 * implementation for.
 */
const heldPatterns = [".sync", ".waitForTaskToken"];

/**
 * Read a `Task` state's `Resource` as a call on a simulated service.
 *
 * `call` is what the `Resource` wrote after `arn:aws:states:::`. It is either
 * `aws-sdk:<service>:<operation>` or one of the integrations Step Functions
 * optimises.
 */
export function parseSimStatesServiceResource(
  stateName: string,
  resource: string,
  call: string,
): SimStatesTaskTarget {
  const held = heldPatterns.find((pattern) => call.includes(pattern));

  if (held !== undefined) {
    throw new SimStatesUnsimulatedInput(
      `The Task state ${stateName} has a Resource of ${resource}, which asks ` +
        `for ${held}. This simulator runs a task that calls and answers, and ` +
        "has no way to hold a state open until a job finishes or until a " +
        "task token comes back.",
    );
  }

  if (call.startsWith(sdkIntegration)) {
    return sdkTarget(stateName, resource, call.slice(sdkIntegration.length));
  }

  const optimized = simStatesOptimizedIntegrations.get(call);

  if (optimized === undefined) {
    throw new SimStatesUnsimulatedInput(
      `The Task state ${stateName} has a Resource of ${resource}, which this ` +
        `simulator does not run. It runs ${integrationNames().join(", ")}, ` +
        "and any operation of a simulated service through " +
        "arn:aws:states:::aws-sdk:<service>:<operation>.",
    );
  }

  return new SimStatesServiceTarget({
    service: simStatesServiceOf(optimized.serviceId),
    operation: optimized.operation,
    commandName: simStatesCommandName(optimized.operation),
    ...(optimized.shape !== undefined && { shape: optimized.shape }),
  });
}

/**
 * Read the service and the operation an `aws-sdk` integration names.
 *
 * A service this simulation does not have is refused here, when the state
 * machine is created, rather than at the task that would have called it. The
 * operation is refused at the task instead, since the operations a service
 * runs belong to the simulated service and there is none to ask yet.
 */
function sdkTarget(
  stateName: string,
  resource: string,
  call: string,
): SimStatesTaskTarget {
  const [serviceName = "", operation = "", ...beyond] = call.split(":");

  if (serviceName === "" || operation === "" || beyond.length > 0) {
    throw new SimStatesUnsimulatedInput(
      `The Task state ${stateName} has a Resource of ${resource}, which is ` +
        "not an SDK integration. One names a service and an operation, as " +
        "arn:aws:states:::aws-sdk:dynamodb:putItem does.",
    );
  }

  const service = simStatesSdkService(serviceName);

  if (service === undefined) {
    throw new SimStatesUnsimulatedInput(
      `The Task state ${stateName} calls ${operation} on ${serviceName}, ` +
        `which this simulator has no simulation of. It calls ` +
        `${simStatesSdkServiceNames().join(", ")}.`,
    );
  }

  return new SimStatesServiceTarget({
    service,
    operation,
    commandName: simStatesCommandName(operation),
  });
}

/**
 * The optimized integrations this simulator runs, as a `Resource` writes them.
 */
function integrationNames(): readonly string[] {
  return simStatesOptimizedIntegrations.keys().toArray();
}
