import { faker } from "@faker-js/faker";
import type { Brand } from "../../../util/brand.type.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

export type SimOrganizationsRootId = Brand<string, "SimOrganizationsRootId">;
export type SimOrganizationsOrganizationalUnitId = Brand<
  string,
  "SimOrganizationsOrganizationalUnitId"
>;

/**
 * Anything a service control policy can hang on.
 *
 * AWS attaches a policy to the root, to an organizational unit, or to one
 * account, and an account inherits every policy on the path down to it.
 */
export type SimOrganizationsNodeId =
  | SimOrganizationsRootId
  | SimOrganizationsOrganizationalUnitId
  | SimAwsAccountId;

/**
 * Generate an AWS-shaped organization root id.
 */
export function makeSimOrganizationsRootId(): SimOrganizationsRootId {
  return `r-${faker.string.alphanumeric({
    length: 4,
    casing: "lower",
  })}` as SimOrganizationsRootId;
}

/**
 * Generate an AWS-shaped organizational unit id.
 */
export function makeSimOrganizationsOrganizationalUnitId(
  rootId: SimOrganizationsRootId,
): SimOrganizationsOrganizationalUnitId {
  const suffix = faker.string.alphanumeric({ length: 8, casing: "lower" });

  return `ou-${rootId.slice(2)}-${suffix}` as SimOrganizationsOrganizationalUnitId;
}

/**
 * An organizational unit in a simulated organization.
 *
 * This is the handle a test holds on to. Pass it where a policy is attached or
 * an Account is moved, so neither reads back as a bare string.
 */
export class SimOrganizationsOrganizationalUnit {
  constructor(
    public readonly id: SimOrganizationsOrganizationalUnitId,
    public readonly name: string,
    public readonly parentId: SimOrganizationsNodeId,
  ) {}
}

/**
 * The root of a simulated organization.
 */
export class SimOrganizationsRoot {
  public readonly name = "Root";

  constructor(public readonly id: SimOrganizationsRootId) {}
}

/**
 * Somewhere a policy can be attached, given either as a handle or as the
 * Account id of an Account.
 */
export type SimOrganizationsTarget =
  | SimOrganizationsRoot
  | SimOrganizationsOrganizationalUnit
  | string;
