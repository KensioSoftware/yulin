import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamIdentityTags } from "../tag/sim-iam-identity-tags.js";

export type SimIamInstanceProfileName = Brand<
  string,
  "SimIamInstanceProfileName"
>;
export type SimIamInstanceProfileId = Brand<string, "SimIamInstanceProfileId">;

/**
 * Account-scoped simulated IAM instance profile.
 *
 * An instance profile is how EC2 hands a Role to an instance. It holds one
 * Role at most, by name, and is never a principal itself.
 */
export interface SimIamInstanceProfile {
  readonly arn: SimArn;
  readonly instanceProfileId: SimIamInstanceProfileId;
  readonly instanceProfileName: SimIamInstanceProfileName;
  readonly path: string;
  readonly creationDate: Date;

  /**
   * The Role in this instance profile, where it holds one.
   */
  roleName: SimIamRoleName | undefined;

  readonly tags: SimIamIdentityTags;
}

/**
 * Generate an AWS-shaped IAM instance profile ID.
 */
export function makeSimIamInstanceProfileId(): SimIamInstanceProfileId {
  return `AIPA${faker.string
    .alphanumeric({ length: 17 })
    .toUpperCase()}` as SimIamInstanceProfileId;
}
