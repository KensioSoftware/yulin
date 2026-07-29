import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../sdk/index.js";
import type {
  SimAdminAddUserToGroupCommand,
  SimAdminListGroupsForUserCommand,
  SimAdminRemoveUserFromGroupCommand,
  SimListUsersInGroupCommand,
} from "../command/group/group-membership.command.js";
import type {
  SimCreateGroupCommand,
  SimDeleteGroupCommand,
  SimGetGroupCommand,
  SimListGroupsCommand,
  SimUpdateGroupCommand,
} from "../command/group/group.command.js";
import type { SimListUsersCommand } from "../command/user/list-users.command.js";
import type {
  SimAdminCreateUserCommand,
  SimAdminDeleteUserCommand,
  SimAdminDisableUserCommand,
  SimAdminEnableUserCommand,
  SimAdminGetUserCommand,
  SimAdminSetUserPasswordCommand,
  SimAdminUpdateUserAttributesCommand,
} from "../command/user/user.command.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * The SDK Command routes for the users and groups in a pool.
 */
export function simCognitoSdkDirectoryRoutes(
  simCognito: SimCognitoIdentityProvider,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "AdminCreateUserCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminCreateUser(
          command as SimAdminCreateUserCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminGetUserCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminGetUser(
          command as SimAdminGetUserCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminDeleteUserCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminDeleteUser(
          command as SimAdminDeleteUserCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminSetUserPasswordCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminSetUserPassword(
          command as SimAdminSetUserPasswordCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminUpdateUserAttributesCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminUpdateUserAttributes(
          command as SimAdminUpdateUserAttributesCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminDisableUserCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminDisableUser(
          command as SimAdminDisableUserCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminEnableUserCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminEnableUser(
          command as SimAdminEnableUserCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListUsersCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.listUsers(
          command as SimListUsersCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "CreateGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.createGroup(
          command as SimCreateGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.getGroup(
          command as SimGetGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UpdateGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.updateGroup(
          command as SimUpdateGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.deleteGroup(
          command as SimDeleteGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListGroupsCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.listGroups(
          command as SimListGroupsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminAddUserToGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminAddUserToGroup(
          command as SimAdminAddUserToGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminRemoveUserFromGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminRemoveUserFromGroup(
          command as SimAdminRemoveUserFromGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "AdminListGroupsForUserCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminListGroupsForUser(
          command as SimAdminListGroupsForUserCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListUsersInGroupCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.listUsersInGroup(
          command as SimListUsersInGroupCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
