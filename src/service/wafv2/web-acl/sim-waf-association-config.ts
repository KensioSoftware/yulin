import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";

/**
 * A resource type whose body inspection limit a web ACL can set.
 *
 * Real WAF keys `AssociationConfig.RequestBody` by resource type, and these
 * three are the ones a web ACL goes in front of here. `APP_RUNNER_SERVICE` and
 * `VERIFIED_ACCESS_INSTANCE` are keys AWS takes for resources this simulation
 * has no association for.
 */
export type SimWafBodyInspectionResourceType =
  | "CLOUDFRONT"
  | "API_GATEWAY"
  | "COGNITO_USER_POOL";

/**
 * How much of a request body WAF reads for a resource type given no
 * `AssociationConfig`.
 *
 * CloudFront, API Gateway and Cognito all default to 16 KB. A load balancer
 * and an AppSync API are fixed at 8 KB, and a web ACL cannot be put in front
 * of either one here.
 */
export const simWafBodyInspectionLimitBytes = 16_384;

/**
 * The four sizes `DefaultSizeInspectionLimit` names, in bytes.
 */
const inspectionLimits = new Map<string, number>([
  ["KB_16", 16_384],
  ["KB_32", 32_768],
  ["KB_48", 49_152],
  ["KB_64", 65_536],
]);

const simulatedResourceTypes: readonly SimWafBodyInspectionResourceType[] = [
  "CLOUDFRONT",
  "API_GATEWAY",
  "COGNITO_USER_POOL",
];

/**
 * One resource type's entry under `AssociationConfig.RequestBody`.
 */
export interface SimWafRequestBodyConfigInput {
  readonly DefaultSizeInspectionLimit?: string | undefined;
}

/**
 * The `AssociationConfig` a web ACL is written with.
 */
export interface SimWafAssociationConfigInput {
  readonly RequestBody?:
    | Readonly<Record<string, SimWafRequestBodyConfigInput | undefined>>
    | undefined;
}

/**
 * How much of a request body a web ACL's rules read, by resource type.
 *
 * A web ACL holds one of these whether or not it was written with an
 * `AssociationConfig`, and a resource type the config left out reads the
 * default 16 KB.
 */
export class SimWafBodyInspectionLimits {
  private constructor(
    private readonly limits: ReadonlyMap<
      SimWafBodyInspectionResourceType,
      number
    >,
  ) {}

  /**
   * Read the limits an `AssociationConfig` sets, refusing anything WAF would
   * refuse and anything this simulation cannot apply.
   */
  static read(
    input: SimWafAssociationConfigInput | undefined,
  ): SimWafBodyInspectionLimits {
    const configured = Object.entries(input?.RequestBody ?? {});
    const limits = new Map<SimWafBodyInspectionResourceType, number>();

    for (const [resourceType, config] of configured) {
      limits.set(
        simulatedResourceType(resourceType),
        inspectionLimit(resourceType, config),
      );
    }

    return new SimWafBodyInspectionLimits(limits);
  }

  /**
   * How many bytes of a body a request reaching one resource type is inspected
   * for.
   *
   * A request evaluated against a web ACL that no resource holds names no
   * resource type, and reads the default.
   */
  bytesFor(resourceType: SimWafBodyInspectionResourceType | undefined): number {
    if (resourceType === undefined) {
      return simWafBodyInspectionLimitBytes;
    }

    return this.limits.get(resourceType) ?? simWafBodyInspectionLimitBytes;
  }
}

/**
 * Hold a `RequestBody` key to the resource types this simulation associates.
 */
function simulatedResourceType(
  resourceType: string,
): SimWafBodyInspectionResourceType {
  const simulated = simulatedResourceTypes.find(
    (candidate) => candidate === resourceType,
  );

  if (simulated === undefined) {
    throw new SimWafUnsimulatedInputException(
      `AssociationConfig sets the body inspection limit for ${resourceType} ` +
        `resources, and ${simulatedResourceTypes.join(" and ")} are the ` +
        `types a web ACL goes in front of in Yulin`,
    );
  }

  return simulated;
}

/**
 * Read one resource type's `DefaultSizeInspectionLimit`.
 *
 * An entry carrying no size is refused the same way one carrying a size WAF
 * has no setting for is. A template writes this part of a web ACL by hand, and
 * an entry that says nothing about the limit it is there to set is a mistake
 * worth reporting as one.
 */
function inspectionLimit(
  resourceType: string,
  config: SimWafRequestBodyConfigInput | undefined,
): number {
  const limit = config?.DefaultSizeInspectionLimit;
  const bytes = limit === undefined ? undefined : inspectionLimits.get(limit);

  if (bytes === undefined) {
    throw new SimWafInvalidParameterException(
      `Error reason: The DefaultSizeInspectionLimit ${String(limit)} is one ` +
        `of ${inspectionLimits.keys().toArray().join(", ")}, field: ` +
        `ASSOCIATION_CONFIG, parameter: ${resourceType}`,
    );
  }

  return bytes;
}
