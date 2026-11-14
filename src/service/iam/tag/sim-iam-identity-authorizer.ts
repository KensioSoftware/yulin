import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../authorize/sim-iam-action-authorizer.js";
import type { SimIamRequestOptions } from "../command/sim-iam-request-options.js";
import type {
  SimIamIdentityTags,
  SimIamTagsInput,
} from "./sim-iam-identity-tags.js";
import {
  simIamRequestTagConditions,
  simIamResourceTagConditions,
  type SimIamConditions,
} from "./sim-iam-tag-conditions.js";

/**
 * A Role or a User, as far as authorizing a request on it goes.
 */
export interface SimIamAuthorizedIdentity {
  readonly arn: string;
  readonly tags: SimIamIdentityTags;
}

interface SimIamIdentityAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly authorizer: SimIamActionAuthorizer;

  /**
   * `Role` or `User`, as IAM names the entity in its actions.
   */
  readonly entity: "Role" | "User";

  /**
   * Find an existing entity by name.
   */
  readonly find: (name: string) => SimIamAuthorizedIdentity | undefined;
}

/**
 * Authorizes the requests IAM receives about one kind of identity.
 *
 * An existing Role or User is authorized as its stored ARN, which carries its
 * path, and with its tags as `iam:ResourceTag/` and `aws:ResourceTag/`. One
 * that does not exist yet is named by the ARN it would have, at the path a
 * create request gives or at `/`, and has no tags.
 */
export class SimIamIdentityAuthorizer {
  constructor(
    private readonly properties: SimIamIdentityAuthorizerProperties,
  ) {}

  /**
   * Find an existing entity by name.
   */
  find(name: string): SimIamAuthorizedIdentity | undefined {
    return this.properties.find(name);
  }

  /**
   * Authorize one action on a named entity.
   */
  authorize(
    action: string,
    name: string | undefined,
    options: SimIamRequestOptions | undefined,
    conditions: SimIamConditions = {},
    path = "/",
  ): void {
    const { accountId, authorizer, entity, find } = this.properties;
    const target = name ?? "*";
    const existing = find(target);

    authorizer.authorize(
      action,
      existing?.arn ??
        `arn:aws:iam::${accountId}:${entity.toLowerCase()}${path}${target}`,
      options?.caller,
      { ...conditions, ...simIamResourceTagConditions(existing?.tags) },
    );
  }

  /**
   * Authorize creating an entity at a normalised path, which needs the
   * tagging action as well when the request carries tags.
   */
  authorizeCreate(
    name: string | undefined,
    path: string,
    tags: SimIamTagsInput,
    options: SimIamRequestOptions | undefined,
    conditions: SimIamConditions = {},
  ): void {
    const { entity } = this.properties;
    const requestTags = simIamRequestTagConditions(tags);
    const create = { ...conditions, ...requestTags };

    this.authorize(`iam:Create${entity}`, name, options, create, path);

    if ((tags?.length ?? 0) > 0) {
      this.authorize(`iam:Tag${entity}`, name, options, requestTags, path);
    }
  }
}
