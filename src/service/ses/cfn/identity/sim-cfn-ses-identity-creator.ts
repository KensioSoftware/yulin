import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesIdentity } from "../../identity/sim-ses-identity.js";
import type { SimSesV2 } from "../../sim-ses-v2.js";
import { simCfnSesResourceCreation } from "../sim-cfn-ses-resource-error.js";
import { sesEmailIdentityResourceType } from "../sim-cfn-ses-resource-types.js";
import { SimCfnSesIdentityProperties } from "./sim-cfn-ses-identity-properties.js";

interface SimCfnSesIdentityCreatorProperties {
  readonly ses: SimSesV2;
}

/**
 * Creates simulated email identities from AWS::SES::EmailIdentity Resources.
 *
 * The identity is created through the ordinary CreateEmailIdentity command
 * rather than constructed directly, so one a template deployed is the same
 * thing an SDK caller would have got: the same validation of what an identity
 * may be named, and the same refusal of a name that is neither an address nor
 * a domain.
 *
 * It deploys unverified, which is what real CloudFormation leaves behind: the
 * confirmation link or the DKIM records still have to be dealt with out of
 * band. A test verifies it afterwards with `verifyIdentity`, which finds the
 * one the stack made rather than creating a second.
 */
export class SimCfnSesIdentityCreator {
  readonly #ses: SimSesV2;

  constructor(properties: SimCfnSesIdentityCreatorProperties) {
    this.#ses = properties.ses;
  }

  /**
   * Create an identity from an AWS::SES::EmailIdentity Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimSesIdentity> {
    const identityProperties = new SimCfnSesIdentityProperties({
      resource,
      properties,
    });
    const emailIdentity = identityProperties.emailIdentity();

    identityProperties.recordIgnoredProperties();

    return await simCfnSesResourceCreation(
      sesEmailIdentityResourceType,
      resource.logicalId,
      async () => {
        await this.#ses.createEmailIdentity({
          input: { EmailIdentity: emailIdentity },
        });

        const identity = this.#ses.findIdentity(emailIdentity);

        assertDefined(
          identity,
          `sim SES identity ${emailIdentity} after CloudFormation creation`,
        );

        return identity;
      },
    );
  }

  /**
   * Delete an identity created from an AWS::SES::EmailIdentity Resource.
   */
  async delete(identity: SimSesIdentity): Promise<void> {
    await this.#ses.deleteEmailIdentity({
      input: { EmailIdentity: identity.emailIdentity },
    });
  }
}
