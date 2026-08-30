import {
  DeleteStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

const logGroupName = "/aws/lambda/orders";

async function deployLogGroup(
  properties: SimCfnTemplateValueRecord,
  simAws: SimAws = new SimAws(),
): Promise<{ readonly simAws: SimAws; readonly stack: SimCfnDeployedStack }> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        OrdersLogs: { Type: "AWS::Logs::LogGroup", Properties: properties },
      },
      Outputs: {
        GroupName: { Value: { Ref: "OrdersLogs" } },
        GroupArn: { Value: { "Fn::GetAtt": ["OrdersLogs", "Arn"] } },
      },
    },
  });

  return { simAws, stack };
}

describe("AWS::Logs::LogGroup", () => {
  it("creates a log group a template declares", async () => {
    // Given a template declaring a log group with retention.
    const { simAws } = await deployLogGroup({
      LogGroupName: logGroupName,
      RetentionInDays: 14,
    });

    // When the log groups are described.
    const described = await simAws
      .logs()
      .describeLogGroups(new DescribeLogGroupsCommand({}));
    const group = described.logGroups?.at(0);

    // Then it is there, with the retention the template asked for, which is
    // the property worth asserting on: a group deployed with the wrong one
    // costs money quietly for years.
    assertNonNullable(group);
    assertIdentical(group.logGroupName, logGroupName);
    assertIdentical(group.retentionInDays, 14);
  });

  it("keeps events forever where the template sets no retention", async () => {
    // Given a template declaring a log group and nothing else.
    const { simAws } = await deployLogGroup({ LogGroupName: logGroupName });

    // Then it has no retention at all, which is the AWS default.
    assertUndefined(simAws.logs().findLogGroup(logGroupName)?.retentionInDays);
  });

  it("names an unnamed log group after the stack and logical ID", async () => {
    // Given a template that declares a log group without naming it.
    const { simAws } = await deployLogGroup({ RetentionInDays: 7 });

    // Then CloudFormation named it, as real CloudFormation does.
    const groups = simAws.logs().allLogGroups();

    assertArrayLength(groups, 1);
    assertStringIncludes(groups.at(0)?.logGroupName ?? "", "orders");
    assertStringIncludes(groups.at(0)?.logGroupName ?? "", "OrdersLogs");
  });

  it("resolves Ref to the name and Fn::GetAtt Arn to the policy ARN", async () => {
    // Given a template whose outputs name the log group both ways.
    const { stack } = await deployLogGroup({
      LogGroupName: logGroupName,
      RetentionInDays: 30,
    });

    // Then Ref is the name, and the ARN carries the trailing wildcard that
    // covers the streams inside, which is what a policy has to name.
    const groupArn = stack.outputs.get("GroupArn")?.value;

    assertIdentical(stack.outputs.get("GroupName")?.value, logGroupName);
    assertTypeString(groupArn);
    assertStringIncludes(groupArn, `:log-group:${logGroupName}:*`);
  });

  it("refuses a retention period real CloudWatch Logs would refuse", async () => {
    // Given a template asking for a reasonable-looking retention outside the
    // set AWS accepts.
    const error = await assertThrowsErrorAsync(
      async () =>
        await deployLogGroup({
          LogGroupName: logGroupName,
          RetentionInDays: 10,
        }),
    );

    // Then the deploy fails here rather than on a real one later.
    assertStringIncludes(error.message, "retentionInDays");
  });

  it("refuses properties whose types the template got wrong", async () => {
    // Given templates giving the two properties this simulation reads values
    // of the wrong type.
    const name = await assertThrowsErrorAsync(
      async () => await deployLogGroup({ LogGroupName: { Ref: "Nothing" } }),
    );
    const retention = await assertThrowsErrorAsync(
      async () =>
        await deployLogGroup({
          LogGroupName: logGroupName,
          RetentionInDays: "14",
        }),
    );

    // Then each says which property was wrong rather than deploying a group
    // named or kept for something other than what the template said.
    assertStringIncludes(name.message, "LogGroupName must be a string");
    assertStringIncludes(retention.message, "RetentionInDays must be a number");
  });

  it("records a property CloudWatch Logs has never had", async () => {
    // Given a template setting something that is not a log group property at
    // all, as a hand-written template can.
    const { stack } = await deployLogGroup({
      LogGroupName: logGroupName,
      Nonsense: true,
    });

    // Then it is recorded as unknown rather than as a real property this
    // simulation chose not to act on, which are different things to a reader.
    const ignored = stack
      .getResource("OrdersLogs")
      ?.ignoredProperties.find((property) => property.path === "Nonsense");

    assertNonNullable(ignored);
    assertStringIncludes(ignored.reason, "not a property simulated");
  });

  it("reports a CloudWatch Logs Resource type it does not simulate", async () => {
    // Given a template declaring a log group and a subscription filter, which
    // this simulation has no machinery for yet.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          OrdersLogs: {
            Type: "AWS::Logs::LogGroup",
            Properties: { LogGroupName: logGroupName },
          },
          OrdersFilter: {
            Type: "AWS::Logs::SubscriptionFilter",
            Properties: { LogGroupName: logGroupName, FilterPattern: "ERROR" },
          },
        },
      },
    });

    // Then the group deploys and the filter is recorded as a gap, rather than
    // the whole stack failing over the one Resource type that is missing.
    assertNonNullable(simAws.logs().findLogGroup(logGroupName));
    assertArrayEquals(
      stack.skippedResources.map((resource) => resource.logicalId),
      ["OrdersFilter"],
    );
  });

  it("refuses a CloudWatch Logs Resource type it does not simulate", async () => {
    // Given the CloudWatch Logs Resource factory.
    const factory = new SimAws().logs().cfnResourceFactory();

    // When a Resource type this simulation has none for is created or deleted.
    const created = await assertThrowsErrorAsync(async () =>
      factory.create("SubscriptionFilter", {} as never, {} as never),
    );
    const deleted = await assertThrowsErrorAsync(async () =>
      factory.delete("SubscriptionFilter", {} as never, {} as never),
    );

    // Then both are reported as unsupported, which the Stack records as a
    // skip rather than a failure.
    assertIdentical(
      created.message,
      "Unsupported sim CloudWatch Logs CloudFormation Resource " +
        "SubscriptionFilter",
    );
    assertIdentical(
      deleted.message,
      "Unsupported sim CloudWatch Logs CloudFormation Resource " +
        "SubscriptionFilter deletion",
    );
  });

  it("refuses a log group attribute CloudFormation does not have", async () => {
    // Given a template reading an attribute off the log group that
    // AWS::Logs::LogGroup does not publish.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            OrdersLogs: {
              Type: "AWS::Logs::LogGroup",
              Properties: { LogGroupName: logGroupName },
            },
          },
          Outputs: {
            Retention: {
              Value: { "Fn::GetAtt": ["OrdersLogs", "RetentionInDays"] },
            },
          },
        },
      });
    });

    // Then it says which attribute, rather than resolving to nothing and
    // leaving an Output that quietly says undefined.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::Logs::LogGroup attribute RetentionInDays",
    );
  });

  it("takes over a log group a function already made for itself", async () => {
    // Given a log group a Lambda function created by logging during setup.
    const simAws = new SimAws();

    simAws.logs().serviceWriter().write(logGroupName, "stream-a", ["ran"]);

    // When a template declaring that same group is deployed.
    await deployLogGroup(
      { LogGroupName: logGroupName, RetentionInDays: 14 },
      simAws,
    );

    // Then the deploy sets its retention rather than failing over a group that
    // is already there. Real CloudFormation fails that deploy, which is a
    // genuine misconfiguration in an account and pure noise in a test whose
    // function ran first.
    const group = simAws.logs().findLogGroup(logGroupName);

    assertNonNullable(group);
    assertIdentical(group.retentionInDays, 14);
    assertArrayEquals(
      group.findStream("stream-a")?.events.map((event) => event.message),
      ["ran"],
    );
  });

  it("records the properties it does not act on", async () => {
    // Given a template setting properties this simulation has nothing to do.
    const { stack } = await deployLogGroup({
      LogGroupName: logGroupName,
      KmsKeyId: "alias/logs",
      Tags: [{ Key: "team", Value: "platform" }],
    });

    // Then the group is deployed and a reader can see what it is not doing,
    // rather than the whole stack failing over a property that changes nothing
    // about what a test asserts.
    const resource = stack.getResource("OrdersLogs");

    assertNonNullable(resource);
    assertArrayEquals(
      resource.ignoredProperties
        .map((ignored) => ignored.path)
        .toSorted((left, right) => left.localeCompare(right)),
      ["KmsKeyId", "Tags"],
    );
  });

  it("ends an update with the retention the new template asks for", async () => {
    // Given a deployed log group holding an event.
    const { simAws } = await deployLogGroup({
      LogGroupName: logGroupName,
      RetentionInDays: 14,
    });

    simAws.logs().serviceWriter().write(logGroupName, "stream-a", ["ran"]);

    // When the stack is updated with a different retention.
    await simAws.cloudFormation().updateStack(
      new UpdateStackCommand({
        StackName: "orders",
        TemplateBody: jsonStringify({
          Resources: {
            OrdersLogs: {
              Type: "AWS::Logs::LogGroup",
              Properties: { LogGroupName: logGroupName, RetentionInDays: 30 },
            },
          },
        }),
      }),
    );
    await simAws.cloudFormation().waitForStackUpdateComplete("orders");

    // Then the retention is the new one. The events are gone with it, because
    // sim CloudFormation has no in-place update and replaces any Resource
    // whose template entry changed. Real CloudFormation updates retention in
    // place and keeps the events, so a test that logs, updates a stack, and
    // then reads the logs back sees less here than it would in an account.
    const group = simAws.logs().findLogGroup(logGroupName);

    assertNonNullable(group);
    assertIdentical(group.retentionInDays, 30);
    assertArrayLength(group.streams, 0);
  });

  it("takes the log group down with the stack", async () => {
    // Given a deployed log group.
    const { simAws } = await deployLogGroup({ LogGroupName: logGroupName });

    // When the stack is torn down.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the group and everything in it went with it, as in an account.
    assertArrayLength(simAws.logs().allLogGroups(), 0);
  });
});
