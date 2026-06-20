/**
 * Minimal shape a created sim Resource may implement to control its
 * CloudFormation Ref value.
 */
interface SimCfnResourceRefValueProvider {
  refValue(): string;
}

function hasRefValue(
  value: object | undefined,
): value is SimCfnResourceRefValueProvider {
  return (
    value !== undefined &&
    "refValue" in value &&
    typeof (value as SimCfnResourceRefValueProvider).refValue === "function"
  );
}

/**
 * Resolve the value returned by { "Ref": logicalId } for a Resource.
 *
 * CloudFormation Ref values are Resource-type specific. A created simulated AWS
 * object can expose refValue() to provide that service-specific value. If it
 * does not, the Resource logical ID is used as a stable physical-ID stand-in.
 */
export function simCfnResourceRefValue(
  logicalId: string,
  simResource: object | undefined,
): string {
  if (hasRefValue(simResource)) {
    return simResource.refValue();
  }

  return logicalId;
}
