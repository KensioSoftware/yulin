/**
 * Deployment helpers the API Gateway v2 CloudFormation test files share.
 *
 * Both the deployment and the validation suites deploy a template and then
 * read either the stack or the error it failed with. This lives under `test/`
 * for the same reasons as `test/cognito/`: eslint rejects a test file that
 * exports helpers alongside its own `describe` calls, and `test/**` is
 * type-checked with everything else, excluded from the published build, not
 * collected as a suite, and not counted in coverage.
 */

import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../src/service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";

/**
 * A simulated AWS in the region the API Gateway CloudFormation tests deploy
 * into, which is not the default one, so a region reaching an endpoint is a
 * region the template put there.
 */
export function simAwsInEuWest2(): SimAws {
  return new SimAws({ defaultRegionName: "eu-west-2" });
}

/**
 * Deploy a template and wait for it to finish.
 */
export async function deployHttpApi(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "orders-stack", template });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * Deploy a template that is expected to fail, and give back the error.
 */
export async function deployHttpApiFailure(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<Error> {
  const error = await assertThrowsErrorAsync(async () => {
    await deployHttpApi(simAws, template);
  });

  assertInstanceOf(error, Error);

  return error;
}

/**
 * The reasons a deployed stack gave for the properties it created Resources
 * without, as one string per ignored property.
 */
export function ignoredReasons(stack: SimCfnDeployedStack): string[] {
  return stack.ignoredProperties.map((ignored) => {
    return `${ignored.logicalId} ${ignored.reason}`;
  });
}
