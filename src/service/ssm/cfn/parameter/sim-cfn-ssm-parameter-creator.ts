import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSsmParameter } from "../../parameter/sim-ssm-parameter.js";
import type { SimSsm } from "../../sim-ssm.js";
import { SimCfnSsmParameterProperties } from "./sim-cfn-ssm-parameter-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnSsmParameterCreatorProperties {
  readonly ssm: SimSsm;
}

/**
 * Creates simulated parameters from AWS::SSM::Parameter Resources.
 *
 * The parameter is written through the ordinary PutParameter command rather
 * than constructed directly, so a parameter a template deployed is the same
 * thing an SDK caller would have got: the same name validation, the same ARN,
 * the same refusals for the options this simulation does not model.
 *
 * The write is a create rather than an overwrite. Creating a Resource is always
 * a create in sim CloudFormation, because a stack update replaces a changed
 * Resource rather than writing over it, so a name already in use fails here as
 * a second stack claiming the same parameter name fails on real
 * CloudFormation.
 */
export class SimCfnSsmParameterCreator {
  private readonly ssm: SimSsm;

  constructor(properties: SimCfnSsmParameterCreatorProperties) {
    this.ssm = properties.ssm;
  }

  /**
   * Create a parameter from an AWS::SSM::Parameter Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimSsmParameter> {
    const parameterProperties = new SimCfnSsmParameterProperties({
      resource,
      properties,
    });
    const name = parameterProperties.name();

    await this.ssm.putParameter(
      {
        input: {
          Name: name,
          Type: parameterProperties.type(),
          Value: parameterProperties.value(),
          Description: parameterProperties.description(),
          Tier: parameterProperties.tier(),
          AllowedPattern: parameterProperties.allowedPattern(),
          DataType: parameterProperties.dataType(),
          Policies: parameterProperties.policies(),
          Tags: parameterProperties.tags(),
        },
      },
      options,
    );

    const parameter = this.ssm.findParameter(name);
    assertDefined(
      parameter,
      `sim SSM parameter ${name} after CloudFormation creation`,
    );

    return parameter;
  }
}
