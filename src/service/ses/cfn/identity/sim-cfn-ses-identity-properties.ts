import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simSesIdentityType } from "../../identity/sim-ses-identity-name.js";
import type { SimSesIdentitySettings } from "../../identity/sim-ses-identity-settings.js";
import { simCfnSesResourceError } from "../sim-cfn-ses-resource-error.js";
import { sesEmailIdentityResourceType } from "../sim-cfn-ses-resource-types.js";
import { simCfnSesIdentitySettings } from "./sim-cfn-ses-identity-settings.js";

/** The one property an identity Resource is named from. */
const emailIdentityPropertyName = "EmailIdentity";

/** Everything an AWS::SES::EmailIdentity Resource is read from. */
const readProperties = new Set([
  emailIdentityPropertyName,
  "DkimAttributes",
  "DkimSigningAttributes",
  "MailFromAttributes",
  "FeedbackAttributes",
  "ConfigurationSetAttributes",
  "Tags",
]);

interface SimCfnSesIdentityPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SES::EmailIdentity CloudFormation properties.
 *
 * `EmailIdentity` names the identity. Everything else is configuration the
 * identity holds and reports back through `GetEmailIdentity` without acting
 * on it, because DKIM signing, a custom MAIL FROM domain and feedback
 * forwarding all decide what happens to a message after it leaves AWS.
 */
export class SimCfnSesIdentityProperties {
  readonly #resource: SimCfnResource;
  readonly #properties: SimCfnTemplateValueRecord;
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(properties: SimCfnSesIdentityPropertiesProperties) {
    this.#resource = properties.resource;
    this.#properties = properties.properties;
    this.#ignorer = properties.resource;
  }

  /**
   * The address or domain the identity names.
   *
   * Required, and with no name to fall back on: unlike a topic or a log group,
   * an identity is the thing it names, so CloudFormation cannot make one up.
   */
  emailIdentity(): string {
    const emailIdentity = this.#properties["EmailIdentity"];

    if (emailIdentity === undefined) {
      throw this.propertyError(
        `${emailIdentityPropertyName} is required, and there is no name ` +
          `CloudFormation could generate for an identity`,
      );
    }

    if (typeof emailIdentity !== "string") {
      throw this.propertyError(`${emailIdentityPropertyName} must be a string`);
    }

    return emailIdentity;
  }

  /**
   * What the Resource configures the identity with beyond its name.
   */
  settings(emailIdentity: string): SimSesIdentitySettings {
    return simCfnSesIdentitySettings(
      this.#properties,
      simSesIdentityType(emailIdentity),
      this.#ignorer,
    );
  }

  /**
   * Record the properties the identity is created without acting on.
   *
   * Every property this Resource type has is read now, so in practice this
   * catches a misspelling, and a property AWS adds after this was written.
   * Real CloudFormation refuses the second one, and a stack failing over a
   * property that arrived last week is a worse way to find out.
   */
  recordIgnoredProperties(): void {
    for (const name of Object.keys(this.#properties)) {
      if (!readProperties.has(name)) {
        this.#ignorer.ignoreProperty(
          name,
          `${name} is not a property simulated SES reads from ${
            sesEmailIdentityResourceType
          }`,
        );
      }
    }
  }

  private propertyError(reason: string): Error {
    return simCfnSesResourceError(
      sesEmailIdentityResourceType,
      this.#resource.logicalId,
      reason,
    );
  }
}
