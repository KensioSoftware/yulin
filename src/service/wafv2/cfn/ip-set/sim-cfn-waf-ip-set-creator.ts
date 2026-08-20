import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimWafIpSet } from "../../ip-set/sim-waf-ip-set.js";
import type { SimWafV2 } from "../../sim-wafv2.js";
import { simCfnWafResourceCommand } from "../sim-cfn-waf-resource-error.js";
import { wafIpSetResourceType } from "../sim-cfn-waf-resource-types.js";
import { SimCfnWafIpSetConfig } from "./sim-cfn-waf-ip-set-config.js";

interface SimCfnWafIpSetCreatorProperties {
  readonly wafV2: SimWafV2;
}

/**
 * Creates simulated IP sets from AWS::WAFv2::IPSet Resources.
 *
 * Nothing evaluates an IP set here, because a rule referring to one is
 * refused: every request in this simulation comes from 127.0.0.1. The set is
 * still deployed, so a stack that declares one deploys whole and a test can
 * read back the ranges it was written with.
 */
export class SimCfnWafIpSetCreator {
  readonly #wafV2: SimWafV2;

  constructor(properties: SimCfnWafIpSetCreatorProperties) {
    this.#wafV2 = properties.wafV2;
  }

  /**
   * Create the IP set an AWS::WAFv2::IPSet Resource describes.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimWafIpSet> {
    const input = new SimCfnWafIpSetConfig({
      resource,
      properties,
    }).createInput();

    return await simCfnWafResourceCommand(
      wafIpSetResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#wafV2.createIpSet({ input });
        const arn = created.Summary?.ARN;

        assertDefined(
          arn,
          `sim WAFv2 IP set ARN for CloudFormation Resource ${
            resource.logicalId
          }`,
        );

        const ipSet = this.#wafV2.findIpSetByArn(arn);

        assertDefined(
          ipSet,
          `sim WAFv2 IP set ${arn} after CloudFormation creation`,
        );

        return ipSet;
      },
    );
  }

  /**
   * Delete the IP set an AWS::WAFv2::IPSet Resource created.
   */
  async delete(resource: SimCfnResource, ipSet: SimWafIpSet): Promise<void> {
    await simCfnWafResourceCommand(
      wafIpSetResourceType,
      resource.logicalId,
      async () =>
        await this.#wafV2.deleteIpSet({
          input: {
            Name: ipSet.name,
            Scope: ipSet.scope,
            Id: ipSet.id,
            LockToken: ipSet.lockToken,
          },
        }),
    );
  }
}
