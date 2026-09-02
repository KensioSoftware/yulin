import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnExports } from "../../export/sim-cfn-exports.js";
import type { SimCfnStack } from "../../stack/sim-cfn-stack.js";
import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import {
  simCfnCommandTemplate,
  simCfnHeldTemplate,
} from "../../template/sim-cfn-command-template.js";
import { simCfnUpdateStackParameters } from "./update-stack-previous-values.js";
import type { SimUpdateStackCommandInput } from "./update-stack.command.js";

interface SimCfnUpdateStackTemplateProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stack: SimCfnStack;
  readonly input: SimUpdateStackCommandInput;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * The template an update applies, read against the Parameter values it carries.
 *
 * `UsePreviousTemplate` takes the template the Stack already holds, which is
 * how an update changes nothing but a Parameter value. Every other update is
 * given the body it is to apply.
 */
export function simCfnUpdateStackTemplate(
  properties: SimCfnUpdateStackTemplateProperties,
): SimCfnTemplate {
  const { simAws, accountRegionScope, stack, input, exports } = properties;
  const context = {
    simAws,
    accountRegionScope,
    stackName: stack.stackName,
    stackId: stack.stackId,
    input: {
      Parameters: simCfnUpdateStackParameters({
        input,
        deployed: stack.currentTemplate.parameters,
      }),
    },
    exports,
  };

  if (input.UsePreviousTemplate === true) {
    return simCfnHeldTemplate({ ...context, template: stack.template });
  }

  assertDefined(input.TemplateBody, "UpdateStackCommand.input.TemplateBody");

  return simCfnCommandTemplate({
    ...context,
    templateBody: input.TemplateBody,
  });
}
