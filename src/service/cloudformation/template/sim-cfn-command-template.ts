import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import type { SimCloudFormationParameterInput } from "../parameters/sim-cfn-parameters.type.js";
import { makeSimCfnParameterStore } from "../parameters/store/sim-cfn-parameter-store.js";
import { SimCfnTemplate } from "./sim-cfn-template.js";

interface SimCfnCommandTemplateProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stackName: SimCloudFormationStackName;
  readonly templateBody: string;

  /** The command input the template's Parameter values are read from. */
  readonly input: SimCloudFormationParameterInput;

  readonly exports?: SimCfnExports | undefined;
}

/**
 * The template a Stack command was sent, parsed against its Parameter values.
 *
 * A Parameter of type `AWS::SSM::Parameter::Value` reads simulated Parameter
 * Store, so parsing needs the simulation the command arrived at as well as the
 * body it carried.
 */
export function simCfnCommandTemplate(
  properties: SimCfnCommandTemplateProperties,
): SimCfnTemplate {
  const { simAws, accountRegionScope, stackName, exports } = properties;

  return SimCfnTemplate.fromTemplateBody(properties.templateBody, {
    stackName,
    parameters: SimCfnParameters.fromInput(properties.input, {
      stackName,
      parameterStore: makeSimCfnParameterStore({ simAws, accountRegionScope }),
    }),
    accountRegionScope,
    exports,
  });
}
