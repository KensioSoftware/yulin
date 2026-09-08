import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { namesSimCfnUnansweredAttribute } from "../../resource/cfn/sim-cfn-unanswered-attribute.js";
import { parseSimLambdaFunctionArn } from "../../../lambda/function/sim-lambda-function-arn-parts.js";
import {
  type SimLambdaFunctionArn,
  simLambdaFunctionArn,
} from "../../../lambda/function/sim-lambda-function-configuration.js";

const lambdaFunctionResourceType = "AWS::Lambda::Function";

/**
 * The provider function a custom Resource's `ServiceToken` names, as an ARN.
 *
 * Nothing comes back where the Resource names no provider this Stack can put
 * an ARN to. A `ServiceToken` built from a Parameter, or one pointing at a
 * Resource type that is not a function, both leave the deployment with nothing
 * to authorize against, and inventing an ARN for it would refuse a template
 * over a permission real CloudFormation never asked for.
 */
export function simCdkProviderInvokeArn(
  resolvedProperties: SimCfnTemplateValueRecord,
  resources: ReadonlyMap<string, SimCfnResource>,
): SimLambdaFunctionArn | undefined {
  const serviceToken = resolvedProperties["ServiceToken"];

  if (typeof serviceToken !== "string" || serviceToken === "") {
    return undefined;
  }

  return (
    writtenFunctionArn(serviceToken) ??
    standInFunctionArn(serviceToken, resources)
  );
}

/**
 * The ARN a `ServiceToken` already carries.
 *
 * A provider deployed outside this Stack is named by its ARN outright, and a
 * template written by hand can name one in the same Stack that way too.
 */
function writtenFunctionArn(
  serviceToken: string,
): SimLambdaFunctionArn | undefined {
  return parseSimLambdaFunctionArn(serviceToken) === undefined
    ? undefined
    : (serviceToken as SimLambdaFunctionArn);
}

/**
 * The ARN behind a `ServiceToken` that resolved to an attribute stand-in.
 *
 * CDK writes `ServiceToken` as an `Fn::GetAtt` for the provider function's
 * `Arn`, and this simulator leaves that provider uncreated: the function is
 * declined on its Python runtime and then reported as scaffolding for the
 * custom Resource the simulator carries out itself. An uncreated Resource
 * answers `Fn::GetAtt` with {@link namesSimCfnUnansweredAttribute}'s stand-in
 * rather than an ARN.
 *
 * The name survives that refusal. Sim Lambda works out the name real
 * CloudFormation would have given the function before declining it, so the
 * Resource's `Ref` holds a function name to build the ARN from. A provider
 * that reached neither creation nor a name has only its logical ID behind
 * `Ref`, and an ARN built from that would be denied by a policy naming the
 * function real CloudFormation invokes.
 */
function standInFunctionArn(
  serviceToken: string,
  resources: ReadonlyMap<string, SimCfnResource>,
): SimLambdaFunctionArn | undefined {
  if (!namesSimCfnUnansweredAttribute(serviceToken, resources.keys())) {
    return undefined;
  }

  const provider = resources.get(serviceToken.split(".", 1)[0] ?? "");

  if (
    provider?.type !== lambdaFunctionResourceType ||
    (!provider.deployed && provider.uncreatedPhysicalName === undefined)
  ) {
    return undefined;
  }

  const { refValue } = provider;

  return typeof refValue === "string" && refValue !== ""
    ? simLambdaFunctionArn(provider.accountRegionScope, refValue)
    : undefined;
}
