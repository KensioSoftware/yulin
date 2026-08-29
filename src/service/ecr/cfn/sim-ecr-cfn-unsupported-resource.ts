/**
 * A refusal naming an ECR Resource type this simulation has no creator for.
 *
 * The wording is what a Stack reads to record the Resource as a skip rather
 * than failing the whole deployment over it.
 */
export function unsupportedSimEcrResourceType(
  resourceTypeName: string,
  suffix: string,
): Error {
  return new Error(
    `Unsupported sim ECR CloudFormation Resource ${resourceTypeName}${suffix}`,
  );
}
