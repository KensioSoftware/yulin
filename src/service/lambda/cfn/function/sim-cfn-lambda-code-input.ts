import type { SimCfnExecutableResourceBinding } from "../../../cloudformation/bind/sim-cfn-exec-binding.type.js";
import { SimCfnExecBindingFinder } from "../../../cloudformation/bind/validate/sim-cfn-exec-binding-finder.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLambdaFunctionCode } from "../../command/create-function/create-function.command.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { simLambdaFunctionArn } from "../../function/sim-lambda-function.js";
import type { SimLambdaHandler } from "../../function/sim-lambda-handler.type.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";

interface SimCfnLambdaCodeInputProperties {
  readonly resource: SimCfnResource;
  readonly functionProperties: SimCfnLambdaFunctionProperties;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
}

/**
 * The CreateFunction code input for an AWS::Lambda::Function Resource: an
 * executable binding's real handler when one targets the Resource, otherwise
 * the template code.
 *
 * The bound handler rides the same stowaway Code.ZipFile input the SDK path
 * uses, so execution-role attribution and invocation behave identically. A
 * bound function may omit template Code and Handler entirely, as the binding
 * replaces the code wholesale. Bindings can target the logical ID (or CDK
 * construct ID), the resolved function name, or the function ARN.
 */
export function simCfnLambdaCodeInput(
  properties: SimCfnLambdaCodeInputProperties,
): SimLambdaFunctionCode | undefined {
  const { resource, functionProperties, bindings } = properties;

  const bindingFinder = new SimCfnExecBindingFinder<SimLambdaHandler>({
    resource,
    bindings,
  });
  const binding = bindingFinder.findBinding({
    functionName: functionProperties.functionName,
    arn: simLambdaFunctionArn(
      resource.accountRegionScope,
      functionProperties.functionName,
    ),
  });

  if (binding === undefined) {
    return functionProperties.code;
  }

  return { ZipFile: makeLambdaZipFileInput(binding.handler) };
}
