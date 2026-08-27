import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimWafRegexPatternSet } from "../../regex-pattern-set/sim-waf-regex-pattern-set.js";
import type { SimWafV2 } from "../../sim-wafv2.js";
import { simCfnWafResourceCommand } from "../sim-cfn-waf-resource-error.js";
import { wafRegexPatternSetResourceType } from "../sim-cfn-waf-resource-types.js";
import { SimCfnWafRegexPatternSetConfig } from "./sim-cfn-waf-regex-set-config.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnWafRegexPatternSetCreatorProperties {
  readonly wafV2: SimWafV2;
}

/**
 * Creates simulated regex pattern sets from AWS::WAFv2::RegexPatternSet
 * Resources.
 *
 * Every pattern is compiled by CreateRegexPatternSet, so an expression that
 * will not compile fails the deployment where it was written rather than
 * quietly matching nothing when a request arrives.
 */
export class SimCfnWafRegexPatternSetCreator {
  readonly #wafV2: SimWafV2;

  constructor(properties: SimCfnWafRegexPatternSetCreatorProperties) {
    this.#wafV2 = properties.wafV2;
  }

  /**
   * Create the pattern set an AWS::WAFv2::RegexPatternSet Resource describes.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimWafRegexPatternSet> {
    const input = new SimCfnWafRegexPatternSetConfig({
      resource,
      properties,
    }).createInput();

    return await simCfnWafResourceCommand(
      wafRegexPatternSetResourceType,
      resource.logicalId,
      async () => {
        const created = await this.#wafV2.createRegexPatternSet(
          { input },
          options,
        );
        const arn = created.Summary?.ARN;

        assertDefined(
          arn,
          `sim WAFv2 regex pattern set ARN for CloudFormation Resource ${
            resource.logicalId
          }`,
        );

        const patternSet = this.#wafV2.findRegexPatternSetByArn(arn);

        assertDefined(
          patternSet,
          `sim WAFv2 regex pattern set ${arn} after CloudFormation creation`,
        );

        return patternSet;
      },
    );
  }

  /**
   * Delete the pattern set an AWS::WAFv2::RegexPatternSet Resource created.
   */
  async delete(
    resource: SimCfnResource,
    patternSet: SimWafRegexPatternSet,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await simCfnWafResourceCommand(
      wafRegexPatternSetResourceType,
      resource.logicalId,
      async () =>
        await this.#wafV2.deleteRegexPatternSet(
          {
            input: {
              Name: patternSet.name,
              Scope: patternSet.scope,
              Id: patternSet.id,
              LockToken: patternSet.lockToken,
            },
          },
          options,
        ),
    );
  }
}
