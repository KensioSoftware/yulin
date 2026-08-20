import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimWafV2 } from "../../sim-wafv2.js";
import type { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";
import { simCfnWafResourceCommand } from "../sim-cfn-waf-resource-error.js";
import { wafWebAclResourceType } from "../sim-cfn-waf-resource-types.js";
import { SimCfnWafWebAclConfig } from "./sim-cfn-waf-web-acl-config.js";

interface SimCfnWafWebAclCreatorProperties {
  readonly wafV2: SimWafV2;
}

/**
 * Creates simulated web ACLs from AWS::WAFv2::WebACL Resources.
 *
 * The web ACL is created through the ordinary CreateWebACL command rather than
 * constructed directly, so one a template deployed is the same thing an SDK
 * caller would have got: the same compilation of every rule, and the same
 * refusal of a statement kind this simulation cannot evaluate.
 *
 * What the two do with that refusal differs. An SDK caller is told and has the
 * web ACL refused; a template has this Resource skipped, so the rest of it
 * still deploys and `stack.skippedResources` says which web ACL is missing and
 * why.
 */
export class SimCfnWafWebAclCreator {
  readonly #wafV2: SimWafV2;

  constructor(properties: SimCfnWafWebAclCreatorProperties) {
    this.#wafV2 = properties.wafV2;
  }

  /**
   * Create the web ACL an AWS::WAFv2::WebACL Resource describes.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimWafWebAcl> {
    const input = new SimCfnWafWebAclConfig({
      resource,
      properties,
    }).createInput();

    return await simCfnWafResourceCommand(
      wafWebAclResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#wafV2.createWebAcl({ input });
        const arn = created.Summary?.ARN;

        assertDefined(
          arn,
          `sim WAFv2 web ACL ARN for CloudFormation Resource ${
            resource.logicalId
          }`,
        );

        const webAcl = this.#wafV2.findWebAclByArn(arn);

        assertDefined(
          webAcl,
          `sim WAFv2 web ACL ${arn} after CloudFormation creation`,
        );

        return webAcl;
      },
    );
  }

  /**
   * Delete the web ACL an AWS::WAFv2::WebACL Resource created.
   *
   * DeleteWebACL refuses a web ACL something is still in front of, and a
   * teardown reaches the associations first because each one names the web ACL
   * it holds. A template that associates without naming it keeps that refusal,
   * which says which resources are still pointing at the ACL.
   */
  async delete(resource: SimCfnResource, webAcl: SimWafWebAcl): Promise<void> {
    await simCfnWafResourceCommand(
      wafWebAclResourceType,
      resource.logicalId,
      async () =>
        await this.#wafV2.deleteWebAcl({
          input: {
            Name: webAcl.name,
            Scope: webAcl.scope,
            Id: webAcl.id,
            LockToken: webAcl.lockToken,
          },
        }),
    );
  }
}
