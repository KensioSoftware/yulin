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

import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";

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

/**
 * The reason a deployed stack gave for one property it created a Resource
 * without, found by the property's path.
 */
export function ignoredReason(
  stack: SimCfnDeployedStack,
  path: string,
): string {
  const ignored = stack.ignoredProperties.find(
    (property) => property.path === path,
  );
  assertNonNullable(ignored);

  return ignored.reason;
}

/**
 * What CreateUserPool refuses one pool input with.
 *
 * A test comparing the CloudFormation record against this compares the two
 * paths, rather than comparing both against a sentence the test wrote down.
 */
export async function createUserPoolRefusal(
  option: string,
  value: unknown,
): Promise<string> {
  const cognito = new SimAws().cognitoIdentityProvider();

  const error = await assertThrowsErrorAsync(async () => {
    await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users", [option]: value }),
    );
  });
  assertInstanceOf(error, Error);

  return error.message;
}
