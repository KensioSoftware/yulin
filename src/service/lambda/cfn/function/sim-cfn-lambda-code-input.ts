import type { SimCfnBinding } from "../../../cloudformation/bind/sim-cfn-binding.js";
import { SimCfnExecBindingFinder } from "../../../cloudformation/bind/validate/sim-cfn-exec-binding-finder.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLambdaFunctionCode } from "../../command/create-function/create-function.command.js";
import type { SimLambdaContainerImages } from "../../function/code/image/sim-lambda-container-images.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { simLambdaFunctionArn } from "../../function/sim-lambda-function-configuration.js";
import type { SimLambdaHandler } from "../../function/sim-lambda-handler.type.js";
import type { SimCfnLambdaFunctionProperties } from "./sim-cfn-lambda-function-properties-parser.js";

interface SimCfnLambdaCodeInputProperties {
  readonly resource: SimCfnResource;
  readonly functionProperties: SimCfnLambdaFunctionProperties;
  readonly bindings?: readonly SimCfnBinding[] | undefined;
  readonly containerImages: SimLambdaContainerImages;
}

/**
 * The code a Resource's function will be created with, whether a real
 * in-process handler supplied it, and why an image supplied none.
 */
export interface SimCfnLambdaCodeInput {
  readonly code: SimLambdaFunctionCode | undefined;
  readonly bound: boolean;
  /**
   * Why the image this function names stands in for no handler, where it names
   * one and nothing resolved it. This is what the skip reason says, so a
   * reader is told whether the repository is missing or its image is.
   */
  readonly unsimulatedImageReason?: string | undefined;
}

/**
 * The CreateFunction code input for an AWS::Lambda::Function Resource: a real
 * in-process handler where one backs the function, otherwise the template
 * code.
 *
 * A handler can come from two places, and they are looked at in this order:
 *
 * 1. An executable binding given to this deploy, which is the more specific
 *    thing to have said, and can be about this one stack.
 * 2. A simulated ECR repository the function's `Code.ImageUri` names, which
 *    is a standing statement about what that image is, made once and good for
 *    every stack that runs it.
 *
 * Either way the handler rides the same stowaway Code.ZipFile input the SDK
 * path uses, so execution-role attribution and invocation behave identically.
 * A bound function may omit template Code and Handler entirely, as the handler
 * replaces the code wholesale. Bindings can target the logical ID (or CDK
 * construct ID), the resolved function name, the function ARN, or the
 * container image repository the function's Code.ImageUri names.
 */
export function simCfnLambdaCodeInput(
  properties: SimCfnLambdaCodeInputProperties,
): SimCfnLambdaCodeInput {
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
    imageUri: functionProperties.imageUri,
  });

  if (binding !== undefined) {
    return handlerCode(binding.handler);
  }

  return registeredImageCode(properties);
}

/**
 * The code input for a function whose image simulated ECR may hold.
 *
 * A function naming no image has no image to resolve, so it keeps its template
 * code and the image skip has nothing to say about it either.
 */
function registeredImageCode(
  properties: SimCfnLambdaCodeInputProperties,
): SimCfnLambdaCodeInput {
  const { functionProperties, containerImages } = properties;
  const { imageUri } = functionProperties;

  if (imageUri === undefined) {
    return { code: functionProperties.code, bound: false };
  }

  const image = containerImages.image(imageUri);

  if (image.handler === undefined) {
    return {
      code: functionProperties.code,
      bound: false,
      unsimulatedImageReason: image.unsimulatedReason(),
    };
  }

  return handlerCode(image.handler);
}

/**
 * The code input for a function a real in-process handler backs.
 */
function handlerCode(handler: SimLambdaHandler): SimCfnLambdaCodeInput {
  return { code: { ZipFile: makeLambdaZipFileInput(handler) }, bound: true };
}
