import type { SimSesIdentity } from "../../identity/sim-ses-identity.js";
import type {
  SimGetEmailIdentityCommandOutput,
  SimSesDkimAttributes,
  SimSesMailFromAttributes,
} from "./identity.command.js";

/** Everything GetEmailIdentity reports, apart from the response metadata. */
type SimSesIdentityDetails = Omit<
  SimGetEmailIdentityCommandOutput,
  "$metadata"
>;

/**
 * The whole of what GetEmailIdentity says about one identity.
 *
 * Assembled here rather than at the command, so that the command stays the
 * three steps it is about: name the identity, authorize the caller, find it.
 */
export function simSesIdentityDetails(
  identity: SimSesIdentity,
): SimSesIdentityDetails {
  const mailFrom = simSesMailFromAttributes(identity);
  const settings = identity.settings;

  return {
    IdentityType: identity.identityType,
    VerifiedForSendingStatus: identity.isVerified,
    VerificationStatus: identity.verificationStatus,
    FeedbackForwardingStatus: settings.feedbackForwardingEnabled,
    DkimAttributes: simSesDkimAttributes(identity),
    ...(mailFrom !== undefined && { MailFromAttributes: mailFrom }),
    ...(settings.configurationSetName !== undefined && {
      ConfigurationSetName: settings.configurationSetName,
    }),
    Tags: settings.tags,
  };
}

/**
 * What GetEmailIdentity reports about an identity's DKIM signing.
 *
 * Every field here is the configuration the identity was created with, read
 * straight back. Nothing signs a message and nothing checks a signature on
 * one, so what a test gets is the answer to "is the identity configured the
 * way the stack said" and nothing about deliverability.
 */
export function simSesDkimAttributes(
  identity: SimSesIdentity,
): SimSesDkimAttributes {
  const { dkim } = identity.settings;

  return {
    SigningEnabled: dkim.signingEnabled,
    Status: identity.dkimStatus,
    SigningAttributesOrigin: dkim.signingOrigin,
    ...(identity.dkimTokens !== undefined && { Tokens: identity.dkimTokens }),
    ...(dkim.nextSigningKeyLength !== undefined && {
      NextSigningKeyLength: dkim.nextSigningKeyLength,
    }),
  };
}

/**
 * What GetEmailIdentity reports about a custom MAIL FROM domain.
 *
 * Absent where the identity was configured without one, which is how real SES
 * answers for an identity sending from the default `amazonses.com` envelope.
 */
export function simSesMailFromAttributes(
  identity: SimSesIdentity,
): SimSesMailFromAttributes | undefined {
  const { mailFrom } = identity.settings;

  if (mailFrom === undefined) {
    return undefined;
  }

  return {
    MailFromDomain: mailFrom.mailFromDomain,
    MailFromDomainStatus: identity.verificationStatus,
    BehaviorOnMxFailure: mailFrom.behaviourOnMxFailure,
  };
}
