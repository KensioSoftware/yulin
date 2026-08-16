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
  SimAdminConfirmSignUpCommand,
  SimConfirmSignUpCommand,
  SimResendConfirmationCodeCommand,
  SimSignUpCommand,
} from "../command/user/sign-up.command.js";
import type {
  SimAdminSetUserMFAPreferenceCommand,
  SimAssociateSoftwareTokenCommand,
  SimGetUserCommand,
  SimSetUserMFAPreferenceCommand,
  SimVerifySoftwareTokenCommand,
} from "../command/user/user-mfa.command.js";
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
 *
 * The three sign-up routes read no caller from the SDK context, because real
 * Cognito authorizes them with no IAM policy: they are what an application
 * calls on behalf of someone signing themselves up, holding no AWS credentials
 * at all. `AdminConfirmSignUp` is the admin side of the same thing, and does
 * read one.
 */
export function simCognitoSdkDirectoryRoutes(
  simCognito: SimCognitoIdentityProvider,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "SignUpCommand",
      async (command): Promise<unknown> =>
        await simCognito.signUp(command as SimSignUpCommand),
    ],
    [
      "ConfirmSignUpCommand",
      async (command): Promise<unknown> =>
        await simCognito.confirmSignUp(command as SimConfirmSignUpCommand),
    ],
    [
      "ResendConfirmationCodeCommand",
      async (command): Promise<unknown> =>
        await simCognito.resendConfirmationCode(
          command as SimResendConfirmationCodeCommand,
        ),
    ],
    [
      "AdminConfirmSignUpCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminConfirmSignUp(
          command as SimAdminConfirmSignUpCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "GetUserCommand",
      async (command): Promise<unknown> =>
        await simCognito.getUser(command as SimGetUserCommand),
    ],
    [
      "AssociateSoftwareTokenCommand",
      async (command): Promise<unknown> =>
        await simCognito.associateSoftwareToken(
          command as SimAssociateSoftwareTokenCommand,
        ),
    ],
    [
      "VerifySoftwareTokenCommand",
      async (command): Promise<unknown> =>
        await simCognito.verifySoftwareToken(
          command as SimVerifySoftwareTokenCommand,
        ),
    ],
    [
      "SetUserMFAPreferenceCommand",
      async (command): Promise<unknown> =>
        await simCognito.setUserMFAPreference(
          command as SimSetUserMFAPreferenceCommand,
        ),
    ],
    [
      "AdminSetUserMFAPreferenceCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.adminSetUserMFAPreference(
          command as SimAdminSetUserMFAPreferenceCommand,
          simSdkCallerOptions(context),
        ),
    ],
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
