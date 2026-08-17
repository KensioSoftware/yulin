import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnSesResourceError } from "../sim-cfn-ses-resource-error.js";
import { sesEmailIdentityResourceType } from "../sim-cfn-ses-resource-types.js";
import { unsimulatedIdentityPropertyReasons } from "./sim-cfn-ses-identity-unsimulated-properties.js";

/** The one property an identity Resource is actually created from. */
const emailIdentityPropertyName = "EmailIdentity";

interface SimCfnSesIdentityPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::SES::EmailIdentity CloudFormation properties.
 *
 * There is only one property to read. Everything else an identity Resource can
 * say is about DKIM, a MAIL FROM domain, a configuration set or feedback
 * forwarding, none of which this simulation acts on, so each is recorded as
 * ignored and the identity is created without it.
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
   * Record the properties the identity is created without acting on.
   *
   * A property this Resource type does not have is recorded too, rather than
   * refused. Real CloudFormation refuses one, but the alternative here is a
   * stack that fails on a property AWS added after this was written, which is
   * a worse way to find out.
   */
  recordIgnoredProperties(): void {
    for (const name of Object.keys(this.#properties)) {
      if (name === emailIdentityPropertyName) {
        continue;
      }

      this.#ignorer.ignoreProperty(
        name,
        unsimulatedIdentityPropertyReasons.get(name) ??
          `${name} is not a property simulated SES reads from ${
            sesEmailIdentityResourceType
          }`,
      );
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
