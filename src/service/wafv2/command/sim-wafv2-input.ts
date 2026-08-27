import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
  SimWafValidationException,
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

/**
 * The shape WAFv2 documents for the description of a web ACL, an IP set and a
 * regex pattern set.
 *
 * The refusal below quotes this expression back, the way WAFv2 quotes its own.
 * WAFv2 writes the dots inside the character classes escaped and this does
 * not, which is the same set of characters written two ways.
 */
const descriptionExpression = /^[\w+=:#@/\-,.][\w+=:#@/\-,.\s]+[\w+=:#@/\-,.]$/;

const descriptionMaxLength = 256;

/**
 * Read the description a write gave, refusing one WAFv2 will not store.
 *
 * The empty string is the one worth catching. Code that reads a resource,
 * changes part of it and writes the rest back hands the description straight
 * through, and AWS answers `""` for some resources nobody has described. WAFv2
 * refuses that write. A simulation that took it would leave the failure for
 * the account to report.
 *
 * The two constraints are checked apart because AWS checks them apart. The
 * pattern matches three characters at the shortest. `ab` is long enough for
 * the length and still refused, and `""` fails both at once, which is how one
 * message comes to report two errors.
 */
export function checkedSimWafDescription(
  description: string | undefined,
): string | undefined {
  if (description === undefined) {
    return undefined;
  }

  const failures = [
    ...lengthFailures(description),
    ...patternFailures(description),
  ];

  if (failures.length === 0) {
    return description;
  }

  throw new SimWafValidationException(
    `${failures.length} validation error${
      failures.length === 1 ? "" : "s"
    } detected: ${failures
      .map(
        (failure) =>
          `Value '${description}' at 'description' failed to satisfy ` +
          `constraint: ${failure}`,
      )
      .join("; ")}`,
  );
}

/**
 * What the length of a description falls foul of, if anything.
 */
function lengthFailures(description: string): readonly string[] {
  if (description.length === 0) {
    return ["Member must have length greater than or equal to 1"];
  }

  if (description.length > descriptionMaxLength) {
    return [
      `Member must have length less than or equal to ${descriptionMaxLength}`,
    ];
  }

  return [];
}

/**
 * What the shape of a description falls foul of, if anything.
 */
function patternFailures(description: string): readonly string[] {
  if (descriptionExpression.test(description)) {
    return [];
  }

  return [
    `Member must satisfy regular expression pattern: ${
      descriptionExpression.source
    }`,
  ];
}
