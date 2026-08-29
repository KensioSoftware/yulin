import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

const logGroupName = "/aws/lambda/orders";

/** What the Resource says unless a test is about setting something else. */
const retainedForAFortnight: SimCfnTemplateValueRecord = {
  LogGroupName: logGroupName,
  RetentionInDays: 14,
};

/**
 * Deploy a Stack holding one log group, as the caller it is given.
 */
async function deployAsCaller(
  simAws: SimAws,
  caller: SimAwsCaller,
  properties: SimCfnTemplateValueRecord = retainedForAFortnight,
): Promise<SimCfnDeployedStack> {
  return await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        OrdersLogs: { Type: "AWS::Logs::LogGroup", Properties: properties },
      },
    },
    caller,
  });
}

/**
 * A Role allowed the actions it is given, as a caller a deployment can name.
 */
async function roleAllowing(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName, actions },
    simAws,
  );

  return { kind: "arn", arn: role.Arn };
}

describe("the principal an AWS::Logs::LogGroup Resource is created as", () => {
  it("fails the Resource under a caller that may not create log groups", async () => {
    // Given a Role that may read log groups and not make them.
    const simAws = new SimAws();
    const reader = await roleAllowing(simAws, "Reader", [
      "logs:DescribeLogGroups",
    ]);

    // When a Stack declaring a log group is deployed as it.
    const error = await assertThrowsErrorAsync(
      async () => await deployAsCaller(simAws, reader),
    );

    // Then the deploy is refused by name, and no group was made behind the
    // refusal.
    assertStringIncludes(error.message, "logs:CreateLogGroup");
    assertStringIncludes(error.message, "role/Reader");
    assertUndefined(simAws.logs().findLogGroup(logGroupName));
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("orders")
        ?.getResource("OrdersLogs")?.status,
      "CREATE_FAILED",
    );
  });

  it("takes over a group a function already made, under a caller allowed the creation", async () => {
    // Given a log group a Lambda function created by logging during setup, and
    // a Role allowed to make one and set its retention.
    const simAws = new SimAws();
    const deployer = await roleAllowing(simAws, "Deployer", [
      "logs:CreateLogGroup",
      "logs:PutRetentionPolicy",
    ]);

    simAws.logs().serviceWriter().write(logGroupName, "stream-a", ["ran"]);

    // When a Stack declaring that same group is deployed as the Role.
    await deployAsCaller(simAws, deployer);

    // Then the group is adopted rather than refused, with the retention the
    // template asked for and the events it already held.
    const group = simAws.logs().findLogGroup(logGroupName);

    assertNonNullable(group);
    assertIdentical(group.retentionInDays, 14);
    assertArrayEquals(
      group.findStream("stream-a")?.events.map((event) => event.message),
      ["ran"],
    );
  });

  it("fails a Resource setting retention the caller may not put", async () => {
    // Given a Role allowed to make log groups and nothing else.
    const simAws = new SimAws();
    const maker = await roleAllowing(simAws, "Maker", ["logs:CreateLogGroup"]);

    // When it deploys a group the template asks to keep events for a fortnight.
    const error = await assertThrowsErrorAsync(
      async () => await deployAsCaller(simAws, maker),
    );

    // Then setting the retention was refused, rather than done as nobody in
    // particular.
    assertStringIncludes(error.message, "logs:PutRetentionPolicy");
  });

  it("deploys a Resource setting no retention without a caller allowed to put one", async () => {
    // Given the same Role, allowed to make log groups and nothing else.
    const simAws = new SimAws();
    const maker = await roleAllowing(simAws, "Maker", ["logs:CreateLogGroup"]);

    // When it deploys a group the template sets no retention on.
    await deployAsCaller(simAws, maker, { LogGroupName: logGroupName });

    // Then nothing asked for a retention policy it does not have, which is
    // what a real deploy of that template needs too.
    assertNonNullable(simAws.logs().findLogGroup(logGroupName));
  });

  it("tears the log group down as the principal the Stack was deployed as", async () => {
    // Given a Stack deployed by a Role that may make a log group and not
    // remove one.
    const simAws = new SimAws();
    const maker = await roleAllowing(simAws, "Maker", [
      "logs:CreateLogGroup",
      "logs:PutRetentionPolicy",
    ]);
    const stack = await deployAsCaller(simAws, maker);

    // When the Stack is torn down.
    const error = await assertThrowsErrorAsync(async () => {
      await stack.teardown();
    });

    // Then the deletion was refused by name, and the group is where it was.
    assertStringIncludes(error.message, "logs:DeleteLogGroup");
    assertNonNullable(simAws.logs().findLogGroup(logGroupName));
  });
});
