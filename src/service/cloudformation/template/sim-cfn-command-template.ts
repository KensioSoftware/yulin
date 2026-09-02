import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import { SimCfnParameters } from "../parameters/sim-cfn-parameters.js";
import type { SimCloudFormationParameterInput } from "../parameters/sim-cfn-parameters.type.js";
import { makeSimCfnParameterStore } from "../parameters/store/sim-cfn-parameter-store.js";
import {
  type CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "./sim-cfn-template.js";

interface SimCfnCommandTemplateContext {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stackName: SimCloudFormationStackName;

  /** The ID of the Stack the template is for, where the Stack has one yet. */
  readonly stackId?: string | undefined;

  /** The command input the template's Parameter values are read from. */
  readonly input: SimCloudFormationParameterInput;

  readonly exports?: SimCfnExports | undefined;
}

interface SimCfnCommandTemplateProperties extends SimCfnCommandTemplateContext {
  readonly templateBody: string;
}

interface SimCfnHeldTemplateProperties extends SimCfnCommandTemplateContext {
  /** The parsed template the Stack is already deployed from. */
  readonly template: CfnTemplateBodyRecord;
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
  const { stackName, stackId, accountRegionScope, exports } = properties;

  return SimCfnTemplate.fromTemplateBody(properties.templateBody, {
    stackName,
    stackId,
    parameters: commandParameters(properties),
    accountRegionScope,
    exports,
  });
}

/**
 * The template a Stack already holds, read against new Parameter values.
 *
 * What `UsePreviousTemplate` updates from. The Stack holds the template parsed
 * rather than as a body, so this takes the parsed one straight back rather than
 * putting it through the parsing and SAM expansion it has already been through.
 */
export function simCfnHeldTemplate(
  properties: SimCfnHeldTemplateProperties,
): SimCfnTemplate {
  const { template, stackName, stackId, accountRegionScope, exports } =
    properties;

  return new SimCfnTemplate({
    template,
    stackName,
    stackId,
    parameters: commandParameters(properties),
    accountRegionScope,
    exports,
  });
}

function commandParameters(
  properties: SimCfnCommandTemplateContext,
): SimCfnParameters {
  const { simAws, accountRegionScope, stackName } = properties;

  return SimCfnParameters.fromInput(properties.input, {
    stackName,
    parameterStore: makeSimCfnParameterStore({ simAws, accountRegionScope }),
  });
}
