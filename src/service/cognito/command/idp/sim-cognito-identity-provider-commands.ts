import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoIdentityProviderSettings } from "../../user-pool/idp/sim-cognito-identity-provider-settings.js";
import { SimCognitoUserPoolIdentityProvider } from "../../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import { SimCognitoIdentityProviderView } from "./sim-cognito-identity-provider-view.js";
import type {
  SimCreateIdentityProviderCommand,
  SimCreateIdentityProviderCommandOutput,
  SimDeleteIdentityProviderCommand,
  SimDeleteIdentityProviderCommandOutput,
  SimDescribeIdentityProviderCommand,
  SimDescribeIdentityProviderCommandOutput,
  SimListIdentityProvidersCommand,
  SimListIdentityProvidersCommandOutput,
  SimUpdateIdentityProviderCommand,
  SimUpdateIdentityProviderCommandOutput,
} from "./identity-provider.command.js";

/**
 * How many providers a page holds when the request does not say.
 */
const defaultLimit = 60;

interface SimCognitoIdentityProviderCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly clock: SimClock;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that configure the external identity providers of a pool.
 *
 * Each authorizes against the pool's ARN, because a provider has no ARN of its
 * own, in the same way an app client and a group have none.
 */
export class SimCognitoIdentityProviderCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly clock: SimClock;
  private readonly view = new SimCognitoIdentityProviderView();

  constructor(properties: SimCognitoIdentityProviderCommandsProperties) {
    this.resolver = properties.resolver;
    this.clock = properties.clock;
  }

  /**
   * Add an external identity provider to a pool.
   */
  create(
    command: SimCreateIdentityProviderCommand,
    options?: SimCognitoCommandOptions,
  ): SimCreateIdentityProviderCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:CreateIdentityProvider",
      input.UserPoolId,
      options,
    );

    const provider = new SimCognitoUserPoolIdentityProvider({
      userPoolId: pool.id,
      settings: new SimCognitoIdentityProviderSettings(input),
      createdAt: this.clock.now(),
    });

    pool.auth.identityProviders.add(provider);

    return { $metadata: {}, IdentityProvider: this.view.describe(provider) };
  }

  /**
   * Describe a provider, including the details it was configured with.
   */
  describe(
    command: SimDescribeIdentityProviderCommand,
    options?: SimCognitoCommandOptions,
  ): SimDescribeIdentityProviderCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:DescribeIdentityProvider",
      input.UserPoolId,
      options,
    );
    const provider = pool.auth.identityProviders.require(
      input.ProviderName ?? "",
    );

    return { $metadata: {}, IdentityProvider: this.view.describe(provider) };
  }

  /**
   * Change a provider's configuration.
   *
   * The settings are replaced by what the request holds, as they are for an
   * app client and a group, so a mapping the request leaves out is cleared
   * rather than kept. The provider's name and type are what identify it, and
   * neither can change.
   */
  update(
    command: SimUpdateIdentityProviderCommand,
    options?: SimCognitoCommandOptions,
  ): SimUpdateIdentityProviderCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:UpdateIdentityProvider",
      input.UserPoolId,
      options,
    );
    const provider = pool.auth.identityProviders.require(
      input.ProviderName ?? "",
    );

    provider.update(
      new SimCognitoIdentityProviderSettings({
        ...input,
        ProviderType: provider.type.value,
      }),
      this.clock.now(),
    );

    return { $metadata: {}, IdentityProvider: this.view.describe(provider) };
  }

  /**
   * Take a provider off a pool.
   *
   * The users it signed in stay where they are, as they do on real Cognito.
   * They keep their `identities` attribute naming a provider the pool no
   * longer has, and nothing can sign them in again until it is added back.
   */
  delete(
    command: SimDeleteIdentityProviderCommand,
    options?: SimCognitoCommandOptions,
  ): SimDeleteIdentityProviderCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:DeleteIdentityProvider",
      input.UserPoolId,
      options,
    );

    pool.auth.identityProviders.remove(
      pool.auth.identityProviders.require(input.ProviderName ?? ""),
    );

    return { $metadata: {} };
  }

  /**
   * List a pool's providers, in creation order.
   */
  list(
    command: SimListIdentityProvidersCommand,
    options?: SimCognitoCommandOptions,
  ): SimListIdentityProvidersCommandOutput {
    const { input } = command;
    const pool = this.resolver.pool(
      "cognito-idp:ListIdentityProviders",
      input.UserPoolId,
      options,
    );

    const page = new SimCognitoPage(pool.auth.identityProviders.all, {
      maxResults: input.MaxResults ?? defaultLimit,
      nextToken: input.NextToken,
    });

    return {
      $metadata: {},
      Providers: page.items.map((provider) => this.view.listEntry(provider)),
      NextToken: page.nextToken,
    };
  }
}
