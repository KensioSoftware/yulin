import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoRequestResolver } from "../sim-cognito-request-resolver.js";
import type { SimCognitoTokenUser } from "./sim-cognito-token-user.js";
import type {
  SimAdminSetUserMFAPreferenceCommand,
  SimAdminSetUserMFAPreferenceCommandOutput,
  SimAssociateSoftwareTokenCommand,
  SimAssociateSoftwareTokenCommandOutput,
  SimSetUserMFAPreferenceCommand,
  SimSetUserMFAPreferenceCommandOutput,
  SimVerifySoftwareTokenCommand,
  SimVerifySoftwareTokenCommandOutput,
} from "./user-mfa.command.js";

interface SimCognitoUserMfaCommandsProperties {
  readonly resolver: SimCognitoRequestResolver;
  readonly tokenUser: SimCognitoTokenUser;
  readonly clock: SimClock;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * What a software token operation carries that this simulation does not model.
 */
interface SimCognitoUnsimulatedTokenInput {
  readonly Session?: string | undefined;
  readonly FriendlyDeviceName?: string | undefined;
}

/**
 * What `VerifySoftwareToken` answers with when the code was the right one.
 */
const verifiedStatus = "SUCCESS";

/**
 * Refuse what a software token operation cannot be given here.
 *
 * A `Session` is how real Cognito registers a token part way through an
 * `MFA_SETUP` challenge. No challenge here issues one, so a session naming a
 * sign-in this simulation did start would be a session for something else.
 */
function refuseUnsimulatedToken(
  operation: string,
  input: SimCognitoUnsimulatedTokenInput,
): void {
  const unsimulated = new SimCognitoUnsimulatedInput(operation);

  unsimulated.refuse(
    "Session",
    input.Session,
    "registering a token part way through the MFA_SETUP challenge, which " +
      "this simulation does not issue",
  );
  unsimulated.refuse(
    "FriendlyDeviceName",
    input.FriendlyDeviceName,
    "naming the device a token was registered on, which needs the device " +
      "tracking this simulation does not model",
  );
}

/**
 * Refuse the factor sent by email, which no pool here could deliver.
 */
function refuseEmailFactor(
  operation: string,
  settings: object | undefined,
): void {
  new SimCognitoUnsimulatedInput(operation).refuse(
    "EmailMfaSettings",
    settings,
    "a second factor sent by email, which needs the pool's EmailConfiguration",
  );
}

/**
 * The commands that register a second factor for a user.
 *
 * Registering a factor and being challenged for one are separate. These are
 * what put a user in the state a challenge would read: a software token whose
 * secret the user's authenticator app holds, and which factors the user is
 * enabled for.
 *
 * Three of them are authorized by the user's own access token and evaluate no
 * IAM policy, as real Cognito evaluates none for them.
 * `AdminSetUserMFAPreference` is the administrative one, and authorizes
 * against the pool's ARN as every other admin operation does.
 */
export class SimCognitoUserMfaCommands {
  private readonly resolver: SimCognitoRequestResolver;
  private readonly tokenUser: SimCognitoTokenUser;
  private readonly clock: SimClock;

  constructor(properties: SimCognitoUserMfaCommandsProperties) {
    this.resolver = properties.resolver;
    this.tokenUser = properties.tokenUser;
    this.clock = properties.clock;
  }

  /**
   * Issue the signed-in user a shared secret for an authenticator app.
   *
   * The `SecretCode` is a real RFC 6238 shared secret, so an app or a library
   * given it produces the codes `VerifySoftwareToken` accepts. Calling this
   * again issues another one, as real Cognito does, and the secret the user
   * was part way through registering is forgotten.
   */
  associateSoftwareToken(
    command: SimAssociateSoftwareTokenCommand,
  ): SimAssociateSoftwareTokenCommandOutput {
    const { input } = command;

    refuseUnsimulatedToken("AssociateSoftwareToken", input);

    const { user } = this.tokenUser.require(
      input.AccessToken,
      "AssociateSoftwareToken",
    );

    return { $metadata: {}, SecretCode: user.mfa.associate() };
  }

  /**
   * Register the associated software token against a code from the user's app.
   */
  verifySoftwareToken(
    command: SimVerifySoftwareTokenCommand,
  ): SimVerifySoftwareTokenCommandOutput {
    const { input } = command;

    refuseUnsimulatedToken("VerifySoftwareToken", input);

    const { user } = this.tokenUser.require(
      input.AccessToken,
      "VerifySoftwareToken",
    );

    user.mfa.verify(input.UserCode, this.clock.now());

    return { $metadata: {}, Status: verifiedStatus };
  }

  /**
   * Set which factors the signed-in user is challenged with.
   */
  setUserMfaPreference(
    command: SimSetUserMFAPreferenceCommand,
  ): SimSetUserMFAPreferenceCommandOutput {
    const { input } = command;

    refuseEmailFactor("SetUserMFAPreference", input.EmailMfaSettings);

    const { user } = this.tokenUser.require(
      input.AccessToken,
      "SetUserMFAPreference",
    );

    user.mfa.set(input);

    return { $metadata: {} };
  }

  /**
   * Set which factors a user an administrator names is challenged with.
   */
  adminSetUserMfaPreference(
    command: SimAdminSetUserMFAPreferenceCommand,
    options?: SimCognitoCommandOptions,
  ): SimAdminSetUserMFAPreferenceCommandOutput {
    const { input } = command;

    refuseEmailFactor("AdminSetUserMFAPreference", input.EmailMfaSettings);

    const user = this.resolver.user(
      "cognito-idp:AdminSetUserMFAPreference",
      input,
      options,
    );

    user.mfa.set(input);

    return { $metadata: {} };
  }
}
