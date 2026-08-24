/**
 * A refusal for a CloudWatch Logs Resource type this simulation has no
 * implementation for.
 *
 * The Stack lifecycle reads this differently from an ordinary failure. The
 * Resource is recorded as a skip and stepped over, and the rest of the Stack
 * still deploys and still tears down.
 */
export function unsupportedSimLogsResourceType(
  resourceTypeName: string,
  operationSuffix: string,
): Error {
  return new Error(
    `Unsupported sim CloudWatch Logs CloudFormation Resource ` +
      `${resourceTypeName}${operationSuffix}`,
  );
}
