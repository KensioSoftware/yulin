import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../error/sim-iam.error.js";
import type {
  SimIamGroup,
  SimIamGroupName,
} from "../../group/sim-iam-group.js";
import type { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";

export interface SimIamGroupLookupProperties {
  readonly groups: Map<SimIamGroupName, SimIamGroup>;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly groupIdentity: SimIamIdentityAuthorizer;
  readonly userIdentity: SimIamIdentityAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * Finds the group or User a group command names, once the caller is allowed
 * the command's action on it.
 *
 * A group's membership is held on its Users, so its members are found by
 * looking through the Account's Users.
 */
export class SimIamGroupLookup {
  constructor(readonly properties: SimIamGroupLookupProperties) {}

  /**
   * Authorize an action on the named group, and find it.
   */
  async group(
    action: string,
    groupName: string | undefined,
    options: SimIamRequestOptions | undefined,
  ): Promise<SimIamGroup> {
    const { groupIdentity, groups, background } = this.properties;
    const name = simIamRequired(groupName, "groupName");
    groupIdentity.authorize(`iam:${action}`, name, options);
    await background.sequence();

    return found(groups.get(name as SimIamGroupName), "group", name);
  }

  /**
   * Authorize an action on the named User, and find it.
   */
  async user(
    action: string,
    username: string | undefined,
    options: SimIamRequestOptions | undefined,
  ): Promise<SimIamUser> {
    const { userIdentity, background } = this.properties;
    const name = simIamRequired(username, "userName");
    userIdentity.authorize(`iam:${action}`, name, options);
    await background.sequence();

    return this.existingUser(name);
  }

  /**
   * Find a User already authorized through the group it is joining or
   * leaving.
   */
  existingUser(username: string | undefined): SimIamUser {
    const name = simIamRequired(username, "userName");

    return found(
      this.properties.users.get(name as SimIamUsername),
      "user",
      name,
    );
  }

  /**
   * The Users in a group, in name order.
   */
  members(group: SimIamGroup): readonly SimIamUser[] {
    return this.properties.users
      .values()
      .filter((user) => user.groups.get(group.groupName) === group)
      .toArray()
      .toSorted((a, b) => a.userName.localeCompare(b.userName));
  }
}

function found<T>(entity: T | undefined, kind: string, name: string): T {
  if (entity === undefined) {
    throw new SimIamNoSuchEntity(
      `The ${kind} with name ${name} cannot be found.`,
    );
  }

  return entity;
}
