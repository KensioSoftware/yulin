import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimWafUnavailableEntityException } from "../../error/sim-wafv2.error.js";
import type { SimWafV2 } from "../../sim-wafv2.js";
import {
  simCfnWafResourceCommand,
  simCfnWafSkippedResourceError,
} from "../sim-cfn-waf-resource-error.js";
import { wafWebAclAssociationResourceType } from "../sim-cfn-waf-resource-types.js";
import { SimCfnWafAssociationConfig } from "./sim-cfn-waf-association-config.js";
import { skippedSimCfnWafWebAcl } from "./sim-cfn-waf-skipped-web-acl.js";
import { SimWafCfnWebAclAssociation } from "./sim-cfn-waf-web-acl-association.js";

interface SimCfnWafAssociationCreatorProperties {
  readonly wafV2: SimWafV2;
}

/**
 * Puts a web ACL in front of a resource from an AWS::WAFv2::WebACLAssociation
 * Resource.
 *
 * The association is made through AssociateWebACL and taken off through
 * DisassociateWebACL, so a template gets the same association an SDK caller
 * gets, and the same refusals: a resource type WAF does not protect, a
 * resource this simulation does not hold, and a `CLOUDFRONT` scope web ACL,
 * which reaches a distribution through the distribution's own `WebACLId`
 * rather than through an association.
 *
 * A resource type AWS WAF protects and this simulation does not is a skip
 * rather than a failure, and so is an association whose web ACL was skipped.
 */
export class SimCfnWafAssociationCreator {
  readonly #wafV2: SimWafV2;

  constructor(properties: SimCfnWafAssociationCreatorProperties) {
    this.#wafV2 = properties.wafV2;
  }

  /**
   * Make the association an AWS::WAFv2::WebACLAssociation Resource describes.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    resources: ReadonlyMap<string, SimCfnResource>,
  ): Promise<SimWafCfnWebAclAssociation> {
    const skippedWebAcl = skippedSimCfnWafWebAcl(resource, resources);

    if (skippedWebAcl !== undefined) {
      throw simCfnWafSkippedResourceError(
        wafWebAclAssociationResourceType,
        resource.logicalId,
        `the web ACL it names, ${skippedWebAcl.logicalId}, was skipped, so ` +
          `there is nothing to put in front of the resource`,
      );
    }

    const config = new SimCfnWafAssociationConfig({ resource, properties });
    const association = new SimWafCfnWebAclAssociation({
      resourceArn: config.resourceArn(),
      webAclArn: config.webAclArn(),
    });

    return await simCfnWafResourceCommand(
      wafWebAclAssociationResourceType,
      resource.logicalId,
      async () => {
        await this.#wafV2.associateWebAcl({
          input: {
            ResourceArn: association.resourceArn,
            WebACLArn: association.webAclArn,
          },
        });

        return association;
      },
    );
  }

  /**
   * Take the association an AWS::WAFv2::WebACLAssociation Resource made off
   * again.
   *
   * The web ACL and the resource are both left as they are. Deleting the
   * association is only ever about the association, which is why a teardown
   * reaches it before the web ACL it names.
   *
   * A stage or a user pool that has gone already is not an error. A template
   * whose `ResourceArn` is a literal rather than a reference gives
   * CloudFormation no reason to bring the association down first, and deleting
   * the stage took the association with it, so there is nothing left to undo.
   */
  async delete(
    resource: SimCfnResource,
    association: SimWafCfnWebAclAssociation,
  ): Promise<void> {
    await simCfnWafResourceCommand(
      wafWebAclAssociationResourceType,
      resource.logicalId,
      async () => {
        try {
          await this.#wafV2.disassociateWebAcl({
            input: { ResourceArn: association.resourceArn },
          });
        } catch (error) {
          if (!(error instanceof SimWafUnavailableEntityException)) {
            throw error;
          }
        }
      },
    );
  }
}
