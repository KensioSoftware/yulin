import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { simScopeIamAuthZ } from "../../../iam/authorize/sim-iam-region-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimCloudFormationParsedResourceType } from "../../resource/factory/sim-cfn-resource-factory.type.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { simCdkProviderInvokeArn } from "./sim-cdk-provider-invoke-arn.js";

const customResourceProviderName = "Custom";
const invokeAction = "lambda:InvokeFunction";

/**
 * What authorizing one custom Resource's provider invoke needs.
 */
export interface SimCdkProviderInvokeAuthZProperties {
  readonly resourceType: SimCloudFormationParsedResourceType;
  readonly resource: SimCfnResource;
  readonly resolvedProperties: SimCfnTemplateValueRecord;
  readonly resources: ReadonlyMap<string, SimCfnResource>;
  readonly simAws: SimAws;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Authorize the invoke a custom Resource costs the deployment.
 *
 * Real CloudFormation answers a `Custom::` Resource by invoking the function
 * its `ServiceToken` names, as the Stack's execution role. That invoke is the
 * first thing a deployment pays for, and a role without `lambda:InvokeFunction`
 * on the provider fails the Stack there rather than at the work the provider
 * would have done.
 *
 * This simulator carries several custom Resources out itself instead of
 * running the provider, which leaves the invoke unpaid for unless it is
 * authorized here. A deploy Role standing in for a real CloudFormation
 * execution policy is meant to fail the same template the real one refuses.
 *
 * Only the caller's identity policies decide it. The provider function is
 * uncreated in the usual case, so there is no simulated function holding a
 * resource policy to consult, and CDK grants the invoke on the execution role
 * anyway.
 */
export function authorizeSimCdkProviderInvoke(
  properties: SimCdkProviderInvokeAuthZProperties,
): void {
  if (properties.resourceType.providerName !== customResourceProviderName) {
    return;
  }

  const functionArn = simCdkProviderInvokeArn(
    properties.resolvedProperties,
    properties.resources,
  );

  if (functionArn === undefined) {
    return;
  }

  const { accountId, regionName } = properties.resource.accountRegionScope;
  const decision = simScopeIamAuthZ(
    properties.simAws.accountRegionScope(accountId, regionName),
  ).authorize({
    action: invokeAction,
    resource: functionArn,
    caller: properties.caller,
  });

  if (decision.isDenied) {
    throw new SimIamAccessDenied({
      principal: decision.caller.principal,
      reason: decision.denialReason,
      action: invokeAction,
      resource: functionArn,
    });
  }
}
