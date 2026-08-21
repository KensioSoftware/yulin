import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoWebAuthnConfigurationMissingException } from "../../error/sim-cognito-web-authn.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import { SimCognitoPage } from "../sim-cognito-page.js";
import type { SimCognitoTokenUser } from "./sim-cognito-token-user.js";
import type {
  SimCompleteWebAuthnRegistrationCommand,
  SimCompleteWebAuthnRegistrationCommandOutput,
  SimDeleteWebAuthnCredentialCommand,
  SimDeleteWebAuthnCredentialCommandOutput,
  SimListWebAuthnCredentialsCommand,
  SimListWebAuthnCredentialsCommandOutput,
  SimStartWebAuthnRegistrationCommand,
  SimStartWebAuthnRegistrationCommandOutput,
} from "./web-authn.command.js";

interface SimCognitoWebAuthnCommandsProperties {
  readonly tokenUser: SimCognitoTokenUser;
  readonly clock: SimClock;
}

/**
 * How many credentials a page holds when the request does not say, which is
 * also the most Cognito will return. Cognito documents this listing as taking
 * a `MaxResults` of between zero and twenty, and a zero is read as the whole
 * page.
 */
const defaultMaxResults = 20;

/**
 * What an authenticator is asked to check when the pool has said nothing,
 * which is the value real Cognito applies.
 */
const defaultUserVerification = "preferred";

/**
 * The relying party a pool registers passkeys against.
 *
 * A passkey belongs to a domain. A pool that configured a `RelyingPartyId`
 * uses that, and one that did not falls back to its own hosted domain, which
 * is what real Cognito falls back to. A pool with neither has nothing to
 * register a passkey against, and real Cognito refuses that with
 * `WebAuthnConfigurationMissingException`.
 */
function requireRelyingParty(pool: SimCognitoUserPool): string {
  const relyingPartyId =
    pool.settings.mfa.webAuthn?.relyingPartyId ?? pool.auth.domain?.hostname;

  if (relyingPartyId === undefined) {
    throw new SimCognitoWebAuthnConfigurationMissingException(
      `The user pool ${pool.id} registers passkeys against no relying party: ` +
        `give it a hosted domain with CreateUserPoolDomain, or set one with ` +
        `SetUserPoolMfaConfig WebAuthnConfiguration RelyingPartyId, which an ` +
        `AWS::Cognito::UserPool Resource deploys as WebAuthnRelyingPartyID.`,
    );
  }

  return relyingPartyId;
}

/**
 * The commands a signed-in user registers and manages its passkeys with.
 *
 * All four are authorized by the user's own access token and evaluate no IAM
 * policy, as real Cognito evaluates none for them. That is what makes a
 * passkey a thing a user adds to an account it is already signed in to: the
 * first one has to be registered from a session some other factor started.
 *
 * The pool's `WebAuthnConfiguration` is what a credential is registered
 * against, and the pool's `AllowedFirstAuthFactors` are what decide whether it
 * can then be presented at a sign-in.
 */
export class SimCognitoWebAuthnCommands {
  private readonly tokenUser: SimCognitoTokenUser;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoWebAuthnCommandsProperties) {
    this.tokenUser = properties.tokenUser;
    this.clock = properties.clock;
  }

  /**
   * Answer the signed-in user with the options its authenticator creates a
   * passkey from.
   *
   * Calling this again issues another challenge, as real Cognito does, and the
   * one the user was part way through answering is spent.
   */
  startWebAuthnRegistration(
    command: SimStartWebAuthnRegistrationCommand,
  ): SimStartWebAuthnRegistrationCommandOutput {
    const { pool, user } = this.tokenUser.require(
      command.input.AccessToken,
      "StartWebAuthnRegistration",
    );

    return {
      $metadata: {},
      CredentialCreationOptions: user.webAuthn.startRegistration({
        relyingPartyId: requireRelyingParty(pool),
        relyingPartyName: pool.name,
        userHandle: user.sub,
        username: user.username,
        userVerification:
          pool.settings.mfa.webAuthn?.userVerification ??
          defaultUserVerification,
      }),
    };
  }

  /**
   * Register the passkey the user's authenticator created.
   */
  completeWebAuthnRegistration(
    command: SimCompleteWebAuthnRegistrationCommand,
  ): SimCompleteWebAuthnRegistrationCommandOutput {
    const { user } = this.tokenUser.require(
      command.input.AccessToken,
      "CompleteWebAuthnRegistration",
    );

    user.webAuthn.completeRegistration(
      command.input.Credential,
      this.clock.now(),
    );

    return { $metadata: {} };
  }

  /**
   * List the passkeys the signed-in user has registered, oldest first.
   *
   * Real Cognito chooses its own order and does not promise one, so nothing
   * should depend on this order beyond a test reading back what it registered.
   */
  listWebAuthnCredentials(
    command: SimListWebAuthnCredentialsCommand,
  ): SimListWebAuthnCredentialsCommandOutput {
    const { input } = command;
    const { user } = this.tokenUser.require(
      input.AccessToken,
      "ListWebAuthnCredentials",
    );
    const page = new SimCognitoPage(user.webAuthn.credentials, {
      maxResults: input.MaxResults ?? defaultMaxResults,
      leastResults: 0,
      mostResults: defaultMaxResults,
      nextToken: input.NextToken,
    });

    return {
      $metadata: {},
      Credentials: page.items.map((credential) => credential.toOutput()),
      NextToken: page.nextToken,
    };
  }

  /**
   * Forget one of the signed-in user's passkeys.
   */
  deleteWebAuthnCredential(
    command: SimDeleteWebAuthnCredentialCommand,
  ): SimDeleteWebAuthnCredentialCommandOutput {
    const { input } = command;
    const { user } = this.tokenUser.require(
      input.AccessToken,
      "DeleteWebAuthnCredential",
    );

    user.webAuthn.remove(input.CredentialId);

    return { $metadata: {} };
  }
}
