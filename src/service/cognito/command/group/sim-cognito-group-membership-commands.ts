import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoUserView } from "../user/sim-cognito-user-view.js";
import { SimCognitoGroupView } from "./sim-cognito-group-view.js";
import type {
  SimAdminAddUserToGroupCommand,
  SimAdminAddUserToGroupCommandOutput,
  SimAdminListGroupsForUserCommand,
  SimAdminListGroupsForUserCommandOutput,
  SimAdminRemoveUserFromGroupCommand,
  SimAdminRemoveUserFromGroupCommandOutput,
  SimListUsersInGroupCommand,
  SimListUsersInGroupCommandOutput,
} from "./group-membership.command.js";

interface SimCognitoGroupMembershipCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * How many entries a page holds when the request does not say.
 */
const defaultLimit = 60;

/**
 * The commands that put users in groups, take them out again, and read the
 * membership either way round.
 */
export class SimCognitoGroupMembershipCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly groupView = new SimCognitoGroupView();
  private readonly userView = new SimCognitoUserView();

  constructor(properties: SimCognitoGroupMembershipCommandsProperties) {
    this.resolver = properties.resolver;
  }

  /**
   * Put a user in a group.
   *
   * Adding a user already in the group succeeds and changes nothing, as it
   * does on real Cognito, so nothing has to check first.
   */
  addUserToGroup(
    command: SimAdminAddUserToGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminAddUserToGroupCommandOutput {
    const { group, user } = this.resolver.membership(
      "cognito-idp:AdminAddUserToGroup",
      command.input,
      options,
    );

    group.addMember(user.username);

    return { $metadata: {} };
  }

  /**
   * Take a user out of a group.
   *
   * Removing a user who is not in the group succeeds too, for the same
   * reason.
   */
  removeUserFromGroup(
    command: SimAdminRemoveUserFromGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminRemoveUserFromGroupCommandOutput {
    const { group, user } = this.resolver.membership(
      "cognito-idp:AdminRemoveUserFromGroup",
      command.input,
      options,
    );

    group.removeMember(user.username);

    return { $metadata: {} };
  }

  /**
   * List the groups a user belongs to, strongest precedence first.
   *
   * That order is what the `cognito:groups` claim will use, so the first
   * group is the one whose role would reach `cognito:preferred_role`.
   */
  listGroupsForUser(
    command: SimAdminListGroupsForUserCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminListGroupsForUserCommandOutput {
    const { input } = command;
    const { pool, user } = this.resolver.poolUser(
      "cognito-idp:AdminListGroupsForUser",
      input,
      options,
    );

    const page = new SimCognitoPage(pool.groupsOf(user.username), {
      maxResults: input.Limit ?? defaultLimit,
      nextToken: input.NextToken,
      maxResultsField: "Limit",
    });

    return {
      $metadata: {},
      Groups: page.items.map((group) => this.groupView.describe(group)),
      NextToken: page.nextToken,
    };
  }

  /**
   * List the users in a group, in the order they were created.
   */
  listUsersInGroup(
    command: SimListUsersInGroupCommand,
    options?: SimCognitoCommandOptions,
  ): SimListUsersInGroupCommandOutput {
    const { input } = command;
    const { pool, group } = this.resolver.poolGroup(
      "cognito-idp:ListUsersInGroup",
      input,
      options,
    );
    const members = pool.users.filter((user) => group.hasMember(user.username));

    const page = new SimCognitoPage(members, {
      maxResults: input.Limit ?? defaultLimit,
      nextToken: input.NextToken,
      maxResultsField: "Limit",
    });

    return {
      $metadata: {},
      Users: page.items.map((user) => this.userView.entry(user)),
      NextToken: page.nextToken,
    };
  }
}
