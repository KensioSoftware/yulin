import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { SimCreateStackParameter } from "../create-stack/create-stack.command.js";
import type {
  SimUpdateStackCommandInput,
  SimUpdateStackParameter,
} from "./update-stack.command.js";

interface SimCfnUpdateStackParametersProperties {
  readonly input: SimUpdateStackCommandInput;

  /** The Parameters of the template the Stack is deployed from. */
  readonly deployed: SimCfnParameters;
}

/**
 * Refuse an update that says where its template comes from twice.
 *
 * `UsePreviousTemplate` reads the template off the Stack, so a body alongside
 * it leaves nothing to say which one is being applied. CloudFormation refuses
 * the pair rather than choosing, and so does this.
 */
export function assertSimCfnUpdateStackTemplateSource(
  input: SimUpdateStackCommandInput,
): void {
  if (input.UsePreviousTemplate === true && input.TemplateBody !== undefined) {
    throw new SimCloudFormationValidationError(
      "You cannot specify both TemplateBody and UsePreviousTemplate",
    );
  }
}

/**
 * The Parameter values an update is applying, with the previous ones filled in.
 *
 * An update names every Parameter its template declares, so one whose value has
 * not changed is carried as `UsePreviousValue: true` rather than written out
 * again. Each of those takes the value the Stack was deployed with. A Parameter
 * the Stack was deployed without is left out, which takes the template Default
 * again as the deployment did.
 *
 * A Parameter carrying `UsePreviousValue: true` and a `ParameterValue` is
 * refused, for the same reason the template pair is: it says two things about
 * one value.
 */
export function simCfnUpdateStackParameters(
  properties: SimCfnUpdateStackParametersProperties,
): readonly SimCreateStackParameter[] | undefined {
  const { input, deployed } = properties;

  if (input.Parameters === undefined) {
    return undefined;
  }

  return input.Parameters.flatMap((parameter) => {
    const { ParameterKey: key, ParameterValue: value } = parameter;

    if (parameter.UsePreviousValue !== true) {
      return [{ ParameterKey: key, ParameterValue: value }];
    }

    assertNoValueAlongsidePrevious(parameter);

    const previous =
      key === undefined ? undefined : deployed.suppliedValue(key);

    return previous === undefined
      ? []
      : [{ ParameterKey: key, ParameterValue: previous }];
  });
}

function assertNoValueAlongsidePrevious(
  parameter: SimUpdateStackParameter,
): void {
  // An empty string is no value, which is what an SDK writes for a Parameter
  // carrying UsePreviousValue and nothing else.
  if (
    parameter.ParameterValue === undefined ||
    parameter.ParameterValue === ""
  ) {
    return;
  }

  throw new SimCloudFormationValidationError(
    `Invalid input for parameter key ${parameter.ParameterKey ?? "unknown"}. Cannot specify usePreviousValue as true and non empty value for a parameter.`,
  );
}
