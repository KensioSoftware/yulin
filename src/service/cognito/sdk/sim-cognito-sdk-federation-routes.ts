import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../sdk/index.js";
import type {
  SimCreateUserPoolDomainCommand,
  SimDeleteUserPoolDomainCommand,
  SimDescribeUserPoolDomainCommand,
} from "../command/domain/user-pool-domain.command.js";
import type {
  SimCreateIdentityProviderCommand,
  SimDeleteIdentityProviderCommand,
  SimDescribeIdentityProviderCommand,
  SimListIdentityProvidersCommand,
  SimUpdateIdentityProviderCommand,
} from "../command/idp/identity-provider.command.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * The SDK Command routes for hosted domains and identity providers.
 */
export function simCognitoSdkFederationRoutes(
  simCognito: SimCognitoIdentityProvider,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  return [
    [
      "CreateUserPoolDomainCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.createUserPoolDomain(
          command as SimCreateUserPoolDomainCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeUserPoolDomainCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.describeUserPoolDomain(
          command as SimDescribeUserPoolDomainCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteUserPoolDomainCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.deleteUserPoolDomain(
          command as SimDeleteUserPoolDomainCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "CreateIdentityProviderCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.createIdentityProvider(
          command as SimCreateIdentityProviderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeIdentityProviderCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.describeIdentityProvider(
          command as SimDescribeIdentityProviderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UpdateIdentityProviderCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.updateIdentityProvider(
          command as SimUpdateIdentityProviderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteIdentityProviderCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.deleteIdentityProvider(
          command as SimDeleteIdentityProviderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListIdentityProvidersCommand",
      async (command, context): Promise<unknown> =>
        await simCognito.listIdentityProviders(
          command as SimListIdentityProvidersCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];
}
