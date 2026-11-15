import type { SimIamAuthorizationInput } from "../authorize/context/sim-iam-auth-z-input.js";
import type {
  SimIamAuthorizationDecision,
  SimIamInterServiceAuthZ,
} from "../authorize/sim-iam-inter-service-auth-z.js";

/**
 * The tags of the resource an ARN names, or `undefined` where it names no
 * resource the service holds, such as `*` or a resource not created yet.
 */
export type SimIamResourceTagLookup = (
  resource: string,
) => Readonly<Record<string, string>> | undefined;

/**
 * Tags held as a list of `Key` and `Value` pairs, the shape most AWS APIs
 * take them in, as a value by key.
 */
export function simIamTagRecord(
  tags:
    | readonly {
        readonly Key?: string | undefined;
        readonly Value?: string | undefined;
      }[]
    | undefined,
): Readonly<Record<string, string>> | undefined {
  return tags === undefined
    ? undefined
    : Object.fromEntries(tags.map((tag) => [tag.Key ?? "", tag.Value ?? ""]));
}

/**
 * Whether an authorized resource is the one an ARN names, or a part of it
 * whose ARN extends that one past the separator given, such as a DynamoDB
 * table's index under `/index/`.
 */
export function simIamNamesResource(
  arn: string,
  resource: string,
  separator?: string,
): boolean {
  return (
    resource === arn ||
    (separator !== undefined && resource.startsWith(`${arn}${separator}`))
  );
}

/**
 * IAM authorization that gives a policy the tags of the resource a request
 * acts on, as `aws:ResourceTag/<key>`.
 *
 * A service whose condition keys include a prefixed variant, such as
 * `secretsmanager:ResourceTag/<key>`, names its prefix, and each tag is
 * supplied under both. A value the request already supplies under the same
 * key wins, the way `simIamInRegion` leaves a Region the request named alone.
 */
export class SimIamResourceTagAuthZ implements SimIamInterServiceAuthZ {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #tagsOf: SimIamResourceTagLookup;
  readonly #prefixes: readonly string[];

  constructor(
    iam: SimIamInterServiceAuthZ,
    tagsOf: SimIamResourceTagLookup,
    servicePrefix?: string,
  ) {
    this.#iam = iam;
    this.#tagsOf = tagsOf;
    this.#prefixes =
      servicePrefix === undefined ? ["aws"] : ["aws", servicePrefix];
  }

  /**
   * Evaluate an authorization request with the tags of the resource it names.
   */
  authorize(input: SimIamAuthorizationInput): SimIamAuthorizationDecision {
    return this.#iam.authorize({
      ...input,
      conditionContext: {
        ...this.conditions(input.resource),
        ...input.conditionContext,
      },
    });
  }

  private conditions(resource: string): Record<string, string> {
    const tags = Object.entries(this.#tagsOf(resource) ?? {});

    return Object.fromEntries(
      this.#prefixes.flatMap((prefix) =>
        tags.map(([key, value]) => [`${prefix}:ResourceTag/${key}`, value]),
      ),
    );
  }
}
