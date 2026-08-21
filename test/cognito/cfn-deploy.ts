/**
 * Deployment helpers the Cognito CloudFormation test files share.
 *
 * Both the property-shape and the validation suites deploy a template that is
 * meant to fail and then read the error, and each was carrying the same
 * arrangement. This lives under `test/` for the same reasons as `test/kms/`:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../src/service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";

/**
 * A simulated AWS in the region the Cognito CloudFormation tests deploy into.
 */
export function simAwsInEuWest2(): SimAws {
  return new SimAws({ defaultRegionName: "eu-west-2" });
}

/**
 * Deploy a template that is expected to fail, and give back the error.
 */
export async function deployFailure(
  simAws: SimAws,
  resources: SimCfnTemplateValueRecord,
  outputs?: SimCfnTemplateValueRecord,
): Promise<Error> {
  const error = await assertThrowsErrorAsync(async () => {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: resources,
        ...(outputs !== undefined && { Outputs: outputs }),
      },
    });
    await stack.waitForDeployComplete();
  });

  assertInstanceOf(error, Error);

  return error;
}

/**
 * Deploy a template that is expected to succeed, and give back the stack.
 */
export async function deploySuccess(
  simAws: SimAws,
  resources: SimCfnTemplateValueRecord,
  outputs?: SimCfnTemplateValueRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "app-stack",
    template: {
      Resources: resources,
      ...(outputs !== undefined && { Outputs: outputs }),
    },
  });
  await stack.waitForDeployComplete();

  return stack;
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
