import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";

const regionName = "us-east-1";

/**
 * The stack of the deployment this is all about, whose name is 26 characters,
 * one more than a rule name leaves the stack half of a generated name.
 */
const stackName = "ChineseboostAnalyticsStack";

const scheduledRule = {
  Resources: {
    RainlyticsSummariesJobFunction: {
      Type: "AWS::Events::Rule",
      Properties: { ScheduleExpression: "rate(1 hour)" },
    },
  },
};

describe("a Resource named under a policy scoped to a name prefix", () => {
  it("creates a rule the prefix real CloudFormation produces allows", async () => {
    // Given a deploy Role allowed EventBridge on the prefix a real deployment
    // of this stack produces, which trims the stack name to 25 characters.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
      defaultRegionName: regionName,
    });
    const deployer = await deployRole(
      simAws,
      accountId,
      "allowed-deployer",
      "ChineseboostAnalyticsStac-*",
    );

    // When the stack is deployed as that Role.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: scheduledRule,
      caller: deployer,
    });

    // Then the rule was created, because the name generated for it starts with
    // the prefix an account would have put the rule under.
    assertIdentical(
      stack.getResource("RainlyticsSummariesJobFunction")?.status,
      "CREATE_COMPLETE",
    );
  });

  it("refuses a rule under the untrimmed stack name", async () => {
    // Given the same deployment under a Role scoped to the whole stack name,
    // which a real deployment is refused by, since CloudFormation trims the
    // stack name to fit a rule name.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
      defaultRegionName: regionName,
    });
    const deployer = await deployRole(
      simAws,
      accountId,
      "refused-deployer",
      `${stackName}-*`,
    );

    // When the stack is deployed as that Role, then the rule is refused.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName,
        template: scheduledRule,
        caller: deployer,
      });
    });

    assertStringIncludes(error.message, "events:PutRule");
    assertStringIncludes(error.message, "rule/ChineseboostAnalyticsStac-");
  });
});

/**
 * A Role a deployment can run as, allowed EventBridge on the rules of one name
 * prefix and nothing else.
 */
async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
  namePrefix: string,
): Promise<SimAwsCaller> {
  const iam = simAws.account(accountId).iam();

  await iam.createRole({
    input: {
      RoleName: roleName,
      AssumeRolePolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await iam.putRolePolicy({
    input: {
      RoleName: roleName,
      PolicyName: `${roleName}-policy`,
      PolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "events:*",
          Resource: `arn:aws:events:${regionName}:${accountId}:rule/${namePrefix}`,
        },
      }),
    },
  });

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/${roleName}` };
}
