/**
 * The Resource types belonging to the parts of a REST API this simulation
 * leaves alone, and what a reader should know about each group.
 */
const unsupportedReasons = new Map([
  ["ApiKey", "API keys and usage plans are not simulated"],
  ["UsagePlan", "API keys and usage plans are not simulated"],
  ["UsagePlanKey", "API keys and usage plans are not simulated"],
  ["RequestValidator", "request validation is not simulated"],
  ["Model", "request and response models are not simulated"],
  ["DomainName", "custom domain names are not simulated"],
  ["DomainNameV2", "custom domain names are not simulated"],
  ["BasePathMapping", "custom domain names are not simulated"],
  ["BasePathMappingV2", "custom domain names are not simulated"],
  [
    "Account",
    "the Account-wide CloudWatch role is not simulated, and nothing here " +
      "logs a request to CloudWatch",
  ],
]);

/**
 * Say why a Resource type is unsupported when there is more to say than that
 * nothing creates it yet.
 */
export function simCfnApiGatewayUnsupportedReason(
  resourceTypeName: string,
): string {
  const reason = unsupportedReasons.get(resourceTypeName);

  return reason === undefined ? "" : `, because ${reason}`;
}
