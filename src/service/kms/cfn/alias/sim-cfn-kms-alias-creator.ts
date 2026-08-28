import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimKmsAlias } from "../../key/sim-kms-alias.js";
import type { SimKms } from "../../sim-kms.js";
import { SimCfnKmsAliasProperties } from "./sim-cfn-kms-alias-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnKmsAliasCreatorProperties {
  readonly kms: SimKms;
}

/**
 * Creates simulated KMS aliases from AWS::KMS::Alias Resources.
 *
 * The alias goes through the ordinary CreateAlias command, so a template gets
 * the same name validation an SDK caller would: the `alias/` prefix is
 * required, the `alias/aws/` prefix is reserved, and a name already in use is
 * refused.
 */
export class SimCfnKmsAliasCreator {
  private readonly kms: SimKms;

  constructor(properties: SimCfnKmsAliasCreatorProperties) {
    this.kms = properties.kms;
  }

  /**
   * Create an alias from an AWS::KMS::Alias Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimKmsAlias> {
    const aliasProperties = new SimCfnKmsAliasProperties({
      resource,
      properties,
    });
    const aliasName = aliasProperties.aliasName();

    await this.kms.createAlias(
      {
        input: {
          AliasName: aliasName,
          TargetKeyId: aliasProperties.targetKeyId(),
        },
      },
      options,
    );

    const alias = this.kms.findAlias(aliasName);
    assertDefined(
      alias,
      `sim KMS alias ${aliasName} after CloudFormation creation`,
    );

    return alias;
  }
}
