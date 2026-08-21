import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesIdentityType } from "../../identity/sim-ses-identity-name.js";
import {
  defaultSimSesIdentitySettings,
  type SimSesDkimSettings,
  type SimSesIdentitySettings,
  type SimSesMailFromBehaviour,
  type SimSesMailFromSettings,
} from "../../identity/sim-ses-identity-settings.js";
import {
  optionalBoolean,
  optionalRecord,
  optionalString,
  tagList,
} from "./sim-cfn-ses-identity-values.js";

/** What CloudFormation falls back to when MAIL FROM says nothing about it. */
const defaultMxFailureBehaviour: SimSesMailFromBehaviour = "USE_DEFAULT_VALUE";

/**
 * Read the settings an AWS::SES::EmailIdentity Resource configures.
 *
 * Every one of these is held and reported rather than acted on. That is the
 * whole of what a simulator can offer for DKIM and a custom MAIL FROM domain,
 * since both decide whether a mailbox provider out on the internet trusts a
 * message and neither leaves a trace a test process could read.
 *
 * A property whose value is the wrong shape falls back to the default instead
 * of failing the deploy, which is the same call the rest of this Resource
 * makes: one property should not take a whole stack down.
 */
export function simCfnSesIdentitySettings(
  properties: SimCfnTemplateValueRecord,
  identityType: SimSesIdentityType,
  ignorer: SimCfnPropertyIgnorer,
): SimSesIdentitySettings {
  const defaults = defaultSimSesIdentitySettings(identityType);
  const configurationSet = optionalString(
    optionalRecord(properties["ConfigurationSetAttributes"])?.[
      "ConfigurationSetName"
    ],
  );

  return {
    dkim: dkimSettings(properties, defaults.dkim, ignorer),
    ...mailFromSettings(properties),
    feedbackForwardingEnabled:
      optionalBoolean(
        optionalRecord(properties["FeedbackAttributes"])?.[
          "EmailForwardingEnabled"
        ],
      ) ?? defaults.feedbackForwardingEnabled,
    ...(configurationSet !== undefined && {
      configurationSetName: configurationSet,
    }),
    tags: tagList(properties["Tags"]),
  };
}

/**
 * How the Resource's two DKIM properties configure signing.
 *
 * `DkimAttributes` says whether signing is on. `DkimSigningAttributes` says
 * where the key comes from: a selector means Bring Your Own DKIM, which SES
 * reports as an `EXTERNAL` origin publishing one record of the caller's own
 * rather than the three Easy DKIM tokens.
 */
function dkimSettings(
  properties: SimCfnTemplateValueRecord,
  defaults: SimSesDkimSettings,
  ignorer: SimCfnPropertyIgnorer,
): SimSesDkimSettings {
  const signing = optionalRecord(properties["DkimSigningAttributes"]);
  const selector = optionalString(signing?.["DomainSigningSelector"]);
  const keyLength = optionalString(signing?.["NextSigningKeyLength"]);

  if (signing?.["DomainSigningPrivateKey"] !== undefined) {
    ignorer.ignoreProperty(
      "DkimSigningAttributes.DomainSigningPrivateKey",
      "nothing here signs a message, so the private key is dropped rather " +
        "than held as a secret with no use",
    );
  }

  return {
    signingEnabled:
      optionalBoolean(
        optionalRecord(properties["DkimAttributes"])?.["SigningEnabled"],
      ) ?? defaults.signingEnabled,
    signingOrigin: selector === undefined ? defaults.signingOrigin : "EXTERNAL",
    ...(selector !== undefined && { domainSigningSelector: selector }),
    ...(keyLength !== undefined && { nextSigningKeyLength: keyLength }),
  };
}

/**
 * The custom envelope sender domain, where the Resource names one.
 *
 * `BehaviorOnMxFailure` defaults to `USE_DEFAULT_VALUE`, as it does on real
 * CloudFormation. CDK leaves it out, so the default is the common case.
 */
function mailFromSettings(properties: SimCfnTemplateValueRecord): {
  readonly mailFrom?: SimSesMailFromSettings;
} {
  const attributes = optionalRecord(properties["MailFromAttributes"]);
  const domain = optionalString(attributes?.["MailFromDomain"]);

  if (domain === undefined) {
    return {};
  }

  return {
    mailFrom: {
      mailFromDomain: domain,
      behaviourOnMxFailure: mxFailureBehaviour(
        attributes?.["BehaviorOnMxFailure"],
      ),
    },
  };
}

function mxFailureBehaviour(
  value: SimCfnTemplateValue | undefined,
): SimSesMailFromBehaviour {
  return optionalString(value) === "REJECT_MESSAGE"
    ? "REJECT_MESSAGE"
    : defaultMxFailureBehaviour;
}
