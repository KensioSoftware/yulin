import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { parseEventBusArn } from "../../bus/sim-event-bus-arn.js";
import { SimEventBusName } from "../../bus/sim-event-bus-name.js";
import {
  SimEventBridgeUnsimulatedInputException,
  SimEventBridgeValidationException,
} from "../../error/sim-event-bridge.error.js";

const arnPrefix = "arn:";

/**
 * Read the bus name out of the name or ARN a request carries.
 *
 * DescribeEventBus and a PutEvents entry both take either form, so both arrive
 * here. A value that is not an ARN is read as a name and validated as one.
 *
 * An ARN naming another Account or Region is refused rather than having its
 * name read out and looked up locally. Real EventBridge does deliver an event
 * across Accounts that way, but nothing here can reach another simulation's
 * bus, and quietly treating a foreign ARN as local would let a test pass while
 * the real call crossed a boundary it has no permission for.
 */
export function simEventBridgeRequestBusName(
  value: string | undefined,
  scope: SimAwsAccountRegionScope,
): SimEventBusName {
  if (value === undefined || value === "") {
    return SimEventBusName.default();
  }

  if (!value.startsWith(arnPrefix)) {
    return SimEventBusName.of(value);
  }

  return busNameFromArn(value, scope);
}

/**
 * Read the bus name out of an ARN, refusing one this scope cannot reach.
 */
function busNameFromArn(
  value: string,
  scope: SimAwsAccountRegionScope,
): SimEventBusName {
  const parts = parseEventBusArn(value);

  if (parts === undefined) {
    throw new SimEventBridgeValidationException(
      `Invalid parameter: ${value} is not an event bus ARN, which is ` +
        `arn:aws:events:<region>:<account-id>:event-bus/<name>`,
    );
  }

  if (
    parts.accountId !== scope.accountId ||
    parts.regionName !== scope.regionName
  ) {
    throw new SimEventBridgeUnsimulatedInputException(
      `${value} names Account ${parts.accountId} in ${parts.regionName}, and ` +
        `this simulated EventBridge is Account ${scope.accountId} in ` +
        `${scope.regionName}. Sending events to another Account's event bus ` +
        `is not simulated.`,
    );
  }

  return SimEventBusName.of(parts.name);
}
