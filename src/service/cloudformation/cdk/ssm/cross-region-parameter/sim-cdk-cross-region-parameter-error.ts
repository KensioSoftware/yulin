/**
 * The Resource type CDK reads a parameter from another Region through.
 */
export const crossRegionParameterResourceTypeName =
  "CrossRegionStringParameterReader";

/**
 * Build the error a Custom::CrossRegionStringParameterReader Resource is
 * refused with.
 *
 * Sim CloudFormation turns a failure whose message reads as an unsupported
 * Resource type into a skip, so none of these says `Unsupported sim`. A reader
 * that was refused rather than skipped is one whose properties this simulation
 * did not recognise, and a Stack should stop on that.
 */
export function crossRegionParameterError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid Custom::${crossRegionParameterResourceTypeName} Resource ` +
      `${logicalId}: ${reason}`,
  );
}
