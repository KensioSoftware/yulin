import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import { makeSimUserArn } from "../../user/arn/sim-iam-user-arn.js";
import type { SimIamUsername } from "../../user/sim-iam-user.js";
import type { SimIamEmptyOutput } from "../entity/sim-iam-entity-policy.command.js";
import type { SimUpdateUserCommand } from "../entity/sim-iam-entity-update.command.js";
import { simIamRenamed } from "../entity/sim-iam-renamed.js";
import { assertSimIamEntityName } from "../group/sim-iam-group-name.js";
import { assertSimIamNameFree } from "../sim-iam-account-quota.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import type { SimIamUserLookup } from "./sim-iam-user-lookup.js";

/**
 * The command that renames a User or moves it to another path.
 *
 * The User keeps its ID, policies, groups and access keys. A rename needs
 * `iam:UpdateUser` on the User as it is and as it will be, as IAM asks.
 */
export class SimIamUserRenameCommands {
  constructor(
    private readonly authorizer: SimIamActionAuthorizer,
    private readonly lookup: SimIamUserLookup,
  ) {}

  /**
   * Rename a User or move it to another path. Requests signed with its
   * access keys are made as the User under its new name.
   */
  async updateUser(
    command: SimUpdateUserCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    await this.lookup.sequence();
    const { input } = command;
    const { accountId, users } = this.lookup.properties;
    const user = this.lookup.user("UpdateUser", input.UserName, options);
    const target = simIamRenamed(
      { name: user.userName, path: user.path },
      input.NewUserName,
      input.NewPath,
    );
    const username = target.name as SimIamUsername;
    assertSimIamEntityName(username, "newUserName", 64);
    const arn = makeSimUserArn({
      accountId,
      path: target.path,
      userName: username,
    });
    this.authorizer.authorize("iam:UpdateUser", arn, options?.caller);
    assertSimIamNameFree(
      users.keys().filter((name) => name !== user.userName),
      username,
      `User with name ${username} already exists.`,
    );

    users.delete(user.userName);
    Object.assign(user, {
      arn,
      name: username,
      userName: username,
      path: target.path,
    });
    users.set(username, user);
    const principal = { kind: "arn" as const, arn };
    for (const key of user.accessKeys.values()) {
      Object.assign(key, { principal, identityPolicyPrincipal: principal });
    }

    return {};
  }
}
