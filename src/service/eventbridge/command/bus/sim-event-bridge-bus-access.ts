import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { eventBusArnPrefix } from "../../bus/sim-event-bus-arn.js";
import type { SimEventBusName } from "../../bus/sim-event-bus-name.js";
import type { SimEventBus } from "../../bus/sim-event-bus.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import type { SimEventBridgeAuthorizer } from "../authorize/sim-event-bridge-authorizer.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import { simEventBridgeRequestBusName } from "./sim-event-bridge-request-bus-name.js";

interface SimEventBridgeBusAccessProperties {
  readonly buses: SimEventBusStore;
  readonly authorizer: SimEventBridgeAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a request reaches the event bus it names.
 *
 * Every operation but ListEventBuses starts the same way: read the name or ARN
 * the request carries, authorize the action against the ARN that name implies,
 * then look the bus up.
 *
 * Authorizing before looking the bus up is deliberate. A caller with no
 * permission is refused for a bus that does not exist rather than told the bus
 * is missing, which is what keeps a listing of an Account's buses from leaking
 * out of a permission error.
 */
export class SimEventBridgeBusAccess {
  private readonly buses: SimEventBusStore;
  private readonly authorizer: SimEventBridgeAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgeBusAccessProperties) {
    this.buses = properties.buses;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * The ARN a bus of this name has, or would have.
   */
  arnFor(name: SimEventBusName): string {
    return eventBusArnPrefix(this.accountRegionScope) + name.value;
  }

  /**
   * Read the bus name a request names, as a name or an ARN.
   */
  requestedName(value: string | undefined): SimEventBusName {
    return simEventBridgeRequestBusName(value, this.accountRegionScope);
  }

  /**
   * Ensure the caller may perform an action on the bus of a given name.
   *
   * The bus need not exist, which is what CreateEventBus and PutEvents both
   * need: they authorize against the ARN a bus of that name has.
   */
  authorizeName(
    action: string,
    name: SimEventBusName,
    options?: SimEventBridgeRequestOptions,
  ): void {
    this.authorizer.authorizeBus(action, this.arnFor(name), options);
  }

  /**
   * Ensure the caller may perform an action naming no particular bus.
   */
  authorizeAnyBus(
    action: string,
    options?: SimEventBridgeRequestOptions,
  ): void {
    this.authorizer.authorizeAnyBus(action, options);
  }

  /**
   * Resolve the bus a request names, authorizing the action first.
   */
  require(
    action: string,
    requested: string | undefined,
    options?: SimEventBridgeRequestOptions,
  ): SimEventBus {
    const name = this.requestedName(requested);

    this.authorizeName(action, name, options);

    return this.buses.require(name.value);
  }

  /**
   * Resolve the bus a request names, or nothing when there is none.
   *
   * This is what DeleteEventBus needs. Real EventBridge documents no
   * not-found error for it, so deleting a bus that is not there succeeds, and
   * the caller still has to be allowed to delete it.
   */
  find(
    action: string,
    name: SimEventBusName,
    options?: SimEventBridgeRequestOptions,
  ): SimEventBus | undefined {
    this.authorizeName(action, name, options);

    return this.buses.find(name.value);
  }
}
