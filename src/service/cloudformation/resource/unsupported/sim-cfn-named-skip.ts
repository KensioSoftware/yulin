/**
 * A refusal from a service that had already worked out the name real
 * CloudFormation would give the Resource.
 *
 * The logical ID a skipped Resource answers `Ref` with stands in for a value
 * the simulation does not hold. Where a service names a Resource before
 * refusing it, the simulation does hold one, so raising this carries the name
 * through the refusal and the Resource answers `Ref` with it. Sim Lambda
 * declining a function on its Runtime is the case that needs it: CDK writes a
 * log group name as `/aws/lambda/` joined to a `Ref` of the function, and a
 * logical ID there produces a log group under a name no account would hold.
 *
 * Nothing else about the refusal changes. The message still decides whether
 * the Stack records a skip or fails. A service raising this says "Unsupported
 * sim ... CloudFormation" as it would in an ordinary Error.
 */
export class SimCfnNamedSkip extends Error {
  public override readonly name = "SimCfnNamedSkip";

  constructor(
    message: string,
    public readonly physicalName: string,
  ) {
    super(message);
  }
}

/**
 * The name a refusal carries, or nothing where the service had not named the
 * Resource before refusing it.
 */
export function simCfnSkippedPhysicalName(error: unknown): string | undefined {
  return error instanceof SimCfnNamedSkip ? error.physicalName : undefined;
}
