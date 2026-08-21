import type { SimSesIdentityType } from "../../identity/sim-ses-identity-name.js";
import {
  defaultSimSesIdentitySettings,
  type SimSesDkimSettings,
  type SimSesIdentitySettings,
  type SimSesIdentityTag,
} from "../../identity/sim-ses-identity-settings.js";
import type {
  SimCreateEmailIdentityCommandInput,
  SimSesDkimSigningAttributes,
  SimSesTagInput,
} from "./identity.command.js";

/**
 * Read the settings a CreateEmailIdentity request configures an identity with.
 *
 * The request is taken at its word. `DkimSigningAttributes`, `Tags` and
 * `ConfigurationSetName` are all held on the identity and read back by
 * `GetEmailIdentity`, so a caller that asks for one gets an identity that
 * agrees with the request that made it.
 *
 * A private signing key is the one input dropped. Nothing here signs a
 * message, and holding a secret for no reason is worse than forgetting it.
 */
export function simSesIdentityInputSettings(
  input: SimCreateEmailIdentityCommandInput,
  identityType: SimSesIdentityType,
): SimSesIdentitySettings {
  const defaults = defaultSimSesIdentitySettings(identityType);

  return {
    ...defaults,
    dkim: inputDkimSettings(
      input.DkimSigningAttributes,
      defaults.dkim,
      identityType,
    ),
    ...(input.ConfigurationSetName !== undefined && {
      configurationSetName: input.ConfigurationSetName,
    }),
    tags: inputTags(input.Tags),
  };
}

/**
 * The tags a request carries, keeping the ones that have both halves.
 *
 * Real SES refuses a tag with no key. Dropping it is the lesser divergence
 * here, since the alternative is failing a request over a tag nothing in this
 * simulation is billed or grouped by.
 */
function inputTags(
  tags: readonly SimSesTagInput[] | undefined,
): readonly SimSesIdentityTag[] {
  return (tags ?? []).flatMap((tag) =>
    tag.Key === undefined || tag.Value === undefined
      ? []
      : [{ Key: tag.Key, Value: tag.Value }],
  );
}

/**
 * How a request's signing attributes configure DKIM.
 *
 * A selector means Bring Your Own DKIM, which SES reports as an `EXTERNAL`
 * origin with no tokens of its own. Anything else leaves Easy DKIM in place
 * and only says which key length it rotates to next.
 */
function inputDkimSettings(
  signingAttributes: SimSesDkimSigningAttributes | undefined,
  defaults: SimSesDkimSettings,
  identityType: SimSesIdentityType,
): SimSesDkimSettings {
  if (signingAttributes === undefined) {
    return defaults;
  }

  const selector = signingAttributes.DomainSigningSelector;

  return {
    signingEnabled: identityType === "DOMAIN",
    signingOrigin: selector === undefined ? "AWS_SES" : "EXTERNAL",
    ...(selector !== undefined && { domainSigningSelector: selector }),
    ...(signingAttributes.NextSigningKeyLength !== undefined && {
      nextSigningKeyLength: signingAttributes.NextSigningKeyLength,
    }),
  };
}
