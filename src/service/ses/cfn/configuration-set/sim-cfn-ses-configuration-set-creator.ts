import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSesConfigurationSet } from "../../configuration-set/sim-ses-configuration-set.js";
import type { SimSesV2 } from "../../sim-ses-v2.js";
import { simCfnSesResourceCreation } from "../sim-cfn-ses-resource-error.js";
import { sesConfigurationSetResourceType } from "../sim-cfn-ses-resource-types.js";
import { SimCfnSesConfigurationSetProperties } from "./sim-cfn-ses-configuration-set-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnSesConfigurationSetCreatorProperties {
  readonly ses: SimSesV2;
}

/**
 * Creates simulated configuration sets from AWS::SES::ConfigurationSet
 * Resources.
 *
 * The set goes through the ordinary CreateConfigurationSet command, so one a
 * stack deployed is the same thing an SDK caller would have got, validated the
 * same way.
 */
export class SimCfnSesConfigurationSetCreator {
  readonly #ses: SimSesV2;

  constructor(properties: SimCfnSesConfigurationSetCreatorProperties) {
    this.#ses = properties.ses;
  }

  /**
   * Create a configuration set from an AWS::SES::ConfigurationSet Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimSesConfigurationSet> {
    const setProperties = new SimCfnSesConfigurationSetProperties({
      resource,
      properties,
    });
    const input = setProperties.input();

    setProperties.recordIgnoredProperties();

    return await simCfnSesResourceCreation(
      sesConfigurationSetResourceType,
      resource.logicalId,
      async () => {
        await this.#ses.createConfigurationSet({ input }, options);

        const name = input.ConfigurationSetName;

        assertDefined(
          name,
          `sim SES configuration set name for ${resource.logicalId}`,
        );

        const configurationSet = this.#ses.findConfigurationSet(name);

        assertDefined(
          configurationSet,
          `sim SES configuration set ${name} after CloudFormation creation`,
        );

        return configurationSet;
      },
    );
  }

  /**
   * Delete a configuration set created from an AWS::SES::ConfigurationSet
   * Resource.
   */
  async delete(
    configurationSet: SimSesConfigurationSet,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#ses.deleteConfigurationSet(
      {
        input: { ConfigurationSetName: configurationSet.configurationSetName },
      },
      options,
    );
  }
}
