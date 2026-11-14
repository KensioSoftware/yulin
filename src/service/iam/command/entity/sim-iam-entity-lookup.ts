import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type {
  SimIamPolicyHolder,
  SimIamPolicyHolderKind,
} from "../../policy/sim-iam-policy-holder.js";
import type { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";
import { simIamFound } from "../sim-iam-found.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";

export interface SimIamEntityLookupProperties {
  readonly kind: SimIamPolicyHolderKind;
  readonly identity: SimIamIdentityAuthorizer;
  readonly find: (name: string) => SimIamPolicyHolder | undefined;
  readonly background: BackgroundScheduler;
}

/**
 * A Role, User or group a policy command names, found once the caller is
 * allowed the command's action on it.
 */
export interface SimIamFoundEntity {
  readonly name: string;
  readonly entity: SimIamPolicyHolder;
}

/**
 * Finds the Role, User or group a policy command names.
 *
 * IAM authorizes before it looks the entity up, so a caller denied the action
 * learns nothing about whether the entity exists.
 */
export class SimIamEntityLookup {
  constructor(readonly properties: SimIamEntityLookupProperties) {}

  /**
   * Wait for the simulation's sequencing point. A command waits here first,
   * so authorizing, finding and changing its entity then run with nothing
   * in between.
   */
  async sequence(): Promise<void> {
    await this.properties.background.sequence();
  }

  /**
   * Authorize an action on the named entity, and find it.
   */
  authorized(
    action: string,
    name: string | undefined,
    options: SimIamRequestOptions | undefined,
    conditions: Readonly<Record<string, string>> = {},
  ): SimIamFoundEntity {
    const { kind, identity, find } = this.properties;
    const lower = kind.toLowerCase();
    const required = simIamRequired(name, `${lower}Name`);
    identity.authorize(
      `iam:${action}${kind}${actionSuffix(action)}`,
      required,
      options,
      conditions,
    );

    return {
      name: required,
      entity: simIamFound(find(required), lower, required),
    };
  }
}

function actionSuffix(action: string): string {
  return action === "List" || action === "ListAttached" ? "Policies" : "Policy";
}
