import { simSdkInterceptedServiceIds } from "../../../../sdk/router/resolve-sim-sdk-command-router.js";

/**
 * A simulated service a `Task` state calls, and what its failures are called.
 */
export interface SimStatesService {
  /**
   * The AWS SDK's own service id, and what finds the simulated service.
   */
  readonly serviceId: string;

  /**
   * The name Step Functions puts in front of an error the service raised, so
   * that a `Retry` or a `Catch` matching `DynamoDb.ConditionalCheckFailedException`
   * matches.
   */
  readonly errorPrefix: string;
}

/**
 * The simulated services an `aws-sdk` integration can name, by the name Amazon
 * States Language writes them under.
 *
 * `arn:aws:states:::aws-sdk:dynamodb:putItem` names the service the way the
 * AWS SDK does, in lower case and with nothing between the words. Every
 * service the SDK interception reaches is here, because a state machine
 * calling a service and a test calling it through an intercepted client are
 * reaching the same simulation.
 *
 * The table is built for each `Resource` that needs one. Reading the services
 * as this module loads would read them before the table they come from is
 * there, since a simulated service and the SDK interception that reaches it
 * know about each other. Nothing reads this after a state machine has been
 * created, so building it costs a definition rather than an execution.
 */
function servicesByName(): ReadonlyMap<string, SimStatesService> {
  return new Map<string, SimStatesService>(
    simSdkInterceptedServiceIds().map((serviceId) => [
      serviceId.toLowerCase().replaceAll(" ", ""),
      { serviceId, errorPrefix: errorPrefixOf(serviceId) },
    ]),
  );
}

/**
 * The service an `aws-sdk` integration named, when this simulation has one.
 */
export function simStatesSdkService(
  serviceName: string,
): SimStatesService | undefined {
  return servicesByName().get(serviceName);
}

/**
 * The names an `aws-sdk` integration can call a service, in the order they
 * read best in a refusal.
 */
export function simStatesSdkServiceNames(): readonly string[] {
  return servicesByName()
    .keys()
    .toArray()
    .toSorted((one, other) => one.localeCompare(other));
}

/**
 * The service one of the optimized integrations calls.
 *
 * The integration names its own SDK service, since the two do not always agree
 * on what a service is called: `arn:aws:states:::events:putEvents` calls
 * EventBridge and `arn:aws:states:::states:startExecution` calls Step
 * Functions itself.
 */
export function simStatesServiceOf(serviceId: string): SimStatesService {
  return { serviceId, errorPrefix: errorPrefixOf(serviceId) };
}

/**
 * The SDK Command an operation names.
 *
 * An integration writes the operation the way the API documents it, with a
 * lower-case first letter, and the SDK Command is the same word as a class
 * name.
 */
export function simStatesCommandName(operation: string): string {
  return `${operation.charAt(0).toUpperCase()}${operation.slice(1)}Command`;
}

/**
 * How Step Functions writes a service's name in an error.
 *
 * The SDK's own service id, with the runs of capitals it spells acronyms with
 * written as words. `DynamoDB` is `DynamoDb` and `SNS` is `Sns`, and a `Catch`
 * in a real definition matches on that.
 */
function errorPrefixOf(serviceId: string): string {
  const words = serviceId
    .replaceAll(" ", "")
    .replaceAll(/[A-Z]+/g, (run) => run.charAt(0) + run.slice(1).toLowerCase());

  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
