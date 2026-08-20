import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";

/**
 * Read the name a request named, refusing a request with none.
 */
export function requiredSimWafName(name: string | undefined): string {
  if (name === undefined || name === "") {
    throw new SimWafInvalidParameterException(
      "Error reason: A WAFv2 resource is named, field: NAME, parameter: Name",
    );
  }

  return name;
}

/**
 * Read the id a request named, refusing a request with none.
 *
 * A name is unique within a scope, so the id looks redundant until two
 * resources have carried the name over time. WAFv2 asks for both on every
 * read, and so does this.
 */
export function requiredSimWafId(id: string | undefined): string {
  if (id === undefined || id === "") {
    throw new SimWafInvalidParameterException(
      "Error reason: A WAFv2 resource read names its Id, field: RESOURCE_ID, " +
        "parameter: Id",
    );
  }

  return id;
}

/**
 * Refuse tags on a WAFv2 resource.
 *
 * Nothing here reads a tag, and a resource that reported tags it was never
 * asked about would be worse than one that says it does not carry them.
 */
export function refuseSimWafTags(
  tags: readonly unknown[] | undefined,
  operation: string,
): void {
  if (tags !== undefined && tags.length > 0) {
    throw new SimWafUnsimulatedInputException(
      `WAFv2 resource tags are not simulated, so ${operation} refuses them ` +
        `rather than dropping them`,
    );
  }
}

/**
 * Read an ARN a request named, refusing a request with none.
 *
 * An association names both the web ACL and the resource it goes in front of
 * by ARN, and neither has anything else to fall back on.
 */
export function requiredSimWafArn(
  arn: string | undefined,
  parameter: string,
): string {
  if (arn === undefined || arn === "") {
    throw new SimWafInvalidParameterException(
      `Error reason: A WAFv2 association names an ARN, ` +
        `field: RESOURCE_ARN, parameter: ${parameter}`,
    );
  }

  return arn;
}
