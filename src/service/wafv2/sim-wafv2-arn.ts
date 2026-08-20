import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { type SimWafScope, simWafScopePath } from "./scope/sim-waf-scope.js";

/**
 * The three WAFv2 resource types this simulation holds, spelled as their ARNs
 * spell them.
 */
export type SimWafResourceKind = "webacl" | "ipset" | "regexpatternset";

/**
 * The start of every WAFv2 ARN in one account, region and scope.
 */
export function simWafArnPrefix(
  accountRegionScope: SimAwsAccountRegionScope,
  scope: SimWafScope,
): string {
  return (
    `arn:aws:wafv2:${accountRegionScope.regionName}:` +
    `${accountRegionScope.accountId}:${simWafScopePath(scope)}/`
  );
}

/**
 * The ARN of one WAFv2 resource.
 *
 * The id is part of the name, which is why every read takes both: two web ACLs
 * created under the same name at different times are different resources, and
 * only the id tells them apart.
 */
export function simWafArn(properties: {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly scope: SimWafScope;
  readonly kind: SimWafResourceKind;
  readonly name: string;
  readonly id: string;
}): string {
  const { accountRegionScope, scope, kind, name, id } = properties;

  return `${simWafArnPrefix(accountRegionScope, scope)}${kind}/${name}/${id}`;
}

/**
 * What a WAFv2 ARN says about the resource it names.
 */
export interface SimWafArnParts {
  readonly regionName: string;
  readonly accountId: string;
  readonly scope: SimWafScope;
  readonly kind: string;
  readonly name: string;
  readonly id: string;
}

const simWafArnPattern =
  /^arn:aws:wafv2:(?<regionName>[^:]*):(?<accountId>[^:]*):(?<scopePath>global|regional)\/(?<kind>[^/]+)\/(?<name>[^/]+)\/(?<id>[^/]+)$/u;

/**
 * Read a WAFv2 ARN, or nothing when the string is not one.
 *
 * An association carries the web ACL as an ARN and nothing else, so the scope
 * and the Region it was created in have to be read back out of it. A web ACL
 * in the wrong scope or the wrong Region is refused before anything looks for
 * it, which is what tells a caller the difference between an ACL that is
 * elsewhere and one that was never created.
 */
export function simWafArnParts(arn: string): SimWafArnParts | undefined {
  const { groups } = simWafArnPattern.exec(arn) ?? {};

  if (groups === undefined) {
    return undefined;
  }

  return {
    regionName: groups["regionName"] ?? "",
    accountId: groups["accountId"] ?? "",
    scope: groups["scopePath"] === "global" ? "CLOUDFRONT" : "REGIONAL",
    kind: groups["kind"] ?? "",
    name: groups["name"] ?? "",
    id: groups["id"] ?? "",
  };
}
