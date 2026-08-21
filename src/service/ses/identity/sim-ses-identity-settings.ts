import type { SimSesIdentityType } from "./sim-ses-identity-name.js";

/**
 * Where the key signing a domain's mail came from.
 *
 * `AWS_SES` is Easy DKIM, where SES holds the key and publishes three CNAME
 * records naming it. `EXTERNAL` is Bring Your Own DKIM, where the caller
 * supplies a selector and a private key. Neither signs anything here.
 */
export type SimSesDkimSigningOrigin = "AWS_SES" | "EXTERNAL";

/**
 * What SES does with a message when the custom MAIL FROM domain's MX record
 * cannot be found.
 */
export type SimSesMailFromBehaviour = "USE_DEFAULT_VALUE" | "REJECT_MESSAGE";

/** One tag on an identity, in the shape both SES and CloudFormation use. */
export interface SimSesIdentityTag {
  readonly Key: string;
  readonly Value: string;
}

/**
 * How an identity's mail is signed, as far as this simulation records it.
 *
 * Nothing here signs a message and nothing checks a signature on one. What
 * this holds is the configuration a stack asked for, so a test can assert the
 * identity it deployed is the one it described.
 */
export interface SimSesDkimSettings {
  readonly signingEnabled: boolean;
  readonly signingOrigin: SimSesDkimSigningOrigin;
  readonly domainSigningSelector?: string | undefined;
  readonly nextSigningKeyLength?: string | undefined;
}

/** The custom envelope sender domain an identity was configured with. */
export interface SimSesMailFromSettings {
  readonly mailFromDomain: string;
  readonly behaviourOnMxFailure: SimSesMailFromBehaviour;
}

/**
 * Everything an identity was configured with beyond the name it goes by.
 *
 * All of it is declarative. An identity reports these back through
 * `GetEmailIdentity` and acts on none of them, because acting on them means
 * signing keys, DNS lookups and bounce handling that a test process has no
 * way to do.
 */
export interface SimSesIdentitySettings {
  readonly dkim: SimSesDkimSettings;
  readonly mailFrom?: SimSesMailFromSettings | undefined;
  readonly feedbackForwardingEnabled: boolean;
  readonly configurationSetName?: string | undefined;
  readonly tags: readonly SimSesIdentityTag[];
}

/**
 * What an identity is configured with when nothing says otherwise.
 *
 * Easy DKIM is on for a domain, which is what real SES does for a domain
 * identity created through the v2 API. An email address identity gets no DKIM
 * at all, since the records that would carry it belong to the domain.
 *
 * Feedback forwarding is on, which is the account default for an identity
 * whose bounces and complaints have nowhere else to go.
 */
export function defaultSimSesIdentitySettings(
  identityType: SimSesIdentityType,
): SimSesIdentitySettings {
  return {
    dkim: {
      signingEnabled: identityType === "DOMAIN",
      signingOrigin: "AWS_SES",
    },
    feedbackForwardingEnabled: true,
    tags: [],
  };
}
