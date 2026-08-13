import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEventBusName } from "./sim-event-bus-name.js";

/**
 * The number of colon separated parts in an event bus ARN.
 *
 * The resource part carries a type separator, so the sixth part is
 * `event-bus/<name>` rather than the name on its own. That is what keeps an
 * event bus ARN from being read as a rule ARN, which carries `rule/` instead.
 */
const eventBusArnParts = 6;

const eventBusArnPartition = "aws";

const eventBusArnService = "events";

const eventBusResourceType = "event-bus";

/**
 * The part of an event bus ARN that comes before the bus's own name.
 */
export function eventBusArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
): string {
  const { regionName, accountId } = accountRegionScope;

  return `arn:aws:events:${regionName}:${accountId}:${eventBusResourceType}/`;
}

/**
 * Where one event bus is, in the three facts its ARN carries.
 *
 * The strings are unbranded because the callers that have only read an ARN,
 * rather than been handed a scope, have nothing but strings to offer.
 */
export interface SimEventBusLocation {
  readonly regionName: string;
  readonly accountId: string;
  readonly name: string;
}

/**
 * Read an event bus ARN into the Region, Account and name it carries.
 *
 * All three matter. An ARN naming another Account or Region reaches nothing in
 * a simulated EventBridge scope rather than having its name read out and
 * looked up locally, and treating a foreign one as local would let a test pass
 * while the real call crossed a boundary it has no permission for.
 *
 * Nothing is returned for a string that is not an event bus ARN.
 */
export function parseEventBusArn(
  value: string,
): SimEventBusLocation | undefined {
  const parts = value.split(":");

  if (parts.length !== eventBusArnParts) {
    return undefined;
  }

  const [prefix, partition, service, regionName, accountId, resource] = parts;

  if (
    prefix !== "arn" ||
    partition !== eventBusArnPartition ||
    service !== eventBusArnService ||
    regionName === undefined ||
    regionName === "" ||
    accountId === undefined ||
    accountId === "" ||
    resource === undefined
  ) {
    return undefined;
  }

  return busLocation(resource, regionName, accountId);
}

/**
 * Read the name out of an ARN's `event-bus/<name>` resource part.
 */
function busLocation(
  resource: string,
  regionName: string,
  accountId: string,
): SimEventBusLocation | undefined {
  const separatorIndex = resource.indexOf("/");

  if (resource.slice(0, separatorIndex) !== eventBusResourceType) {
    return undefined;
  }

  const name = resource.slice(separatorIndex + 1);

  if (name === "") {
    return undefined;
  }

  return { regionName, accountId, name };
}

interface SimEventBusArnProperties {
  readonly name: SimEventBusName;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The ARN of one simulated event bus.
 *
 * A request names a bus by name rather than by ARN in most places, but the ARN
 * is what IAM authorizes against, and what a rule or a CloudFormation template
 * refers to.
 */
export class SimEventBusArn {
  public readonly name: string;
  public readonly value: string;

  constructor(properties: SimEventBusArnProperties) {
    const { name, accountRegionScope } = properties;

    this.name = name.value;
    this.value = eventBusArnPrefix(accountRegionScope) + name.value;
  }
}
