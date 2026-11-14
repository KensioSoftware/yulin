import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import { simIamFound } from "../sim-iam-found.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamUsernameOrCaller } from "./sim-iam-user-name.js";

export interface SimIamUserLookupProperties {
  readonly accountId: SimAwsAccountId;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly authorizer: SimIamActionAuthorizer;
  readonly identity: SimIamIdentityAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * Finds the User a command names, or the calling User where it names none,
 * once the caller is allowed the command's action on it.
 */
export class SimIamUserLookup {
  constructor(readonly properties: SimIamUserLookupProperties) {}

  /**
   * Authorize an action on the named User, or the caller, and find it.
   */
  async user(
    action: string,
    username: string | undefined,
    options: SimIamRequestOptions | undefined,
  ): Promise<SimIamUser> {
    const { accountId, authorizer, identity, users, background } =
      this.properties;
    const name = simIamUsernameOrCaller(username, {
      accountId,
      authorizer,
      options,
    });
    identity.authorize(`iam:${action}`, name, options);
    await background.sequence();

    return simIamFound(users.get(name as SimIamUsername), "user", name);
  }
}
