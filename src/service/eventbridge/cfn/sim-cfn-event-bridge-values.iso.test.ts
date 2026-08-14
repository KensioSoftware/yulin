import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";

/**
 * Deploy one template and read back what its Outputs resolved to.
 */
async function outputsOf(
  template: CfnTemplateBodyRecord,
): Promise<ReadonlyMap<string, unknown>> {
  const simAws = new SimAws();
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "orders-stack", template });

  await stack.waitForDeployComplete();

  return new Map(
    stack.outputs.entries().map(([name, output]) => [name, output.value]),
  );
}

describe("EventBridge CloudFormation Ref and Fn::GetAtt", () => {
  it("answers a bus Ref with its name and GetAtt with its ARN", async () => {
    // Given a template outputting every value a bus offers.
    const outputs = await outputsOf({
      Resources: {
        OrdersBus: {
          Type: "AWS::Events::EventBus",
          Properties: { Name: "orders" },
        },
      },
      Outputs: {
        BusRef: { Value: { Ref: "OrdersBus" } },
        BusArn: { Value: { "Fn::GetAtt": ["OrdersBus", "Arn"] } },
        BusName: { Value: { "Fn::GetAtt": ["OrdersBus", "Name"] } },
      },
    });

    // Then Ref is the name rather than the ARN, which is what makes it usable
    // straight away as another Resource's EventBusName.
    assertIdentical(outputs.get("BusRef"), "orders");
    assertIdentical(
      outputs.get("BusArn"),
      "arn:aws:events:us-east-1:888888888888:event-bus/orders",
    );
    assertIdentical(outputs.get("BusName"), "orders");
  });

  it("answers a rule Ref with its name and GetAtt with its ARN", async () => {
    // Given a template outputting both of a rule's values.
    const outputs = await outputsOf({
      Resources: {
        OrdersRule: {
          Type: "AWS::Events::Rule",
          Properties: {
            Name: "orders",
            EventPattern: { source: ["orders.service"] },
          },
        },
      },
      Outputs: {
        RuleRef: { Value: { Ref: "OrdersRule" } },
        RuleArn: { Value: { "Fn::GetAtt": ["OrdersRule", "Arn"] } },
      },
    });

    // Then Ref is the rule name, and only Fn::GetAtt gives the ARN an
    // AWS::Lambda::Permission SourceArn needs.
    assertIdentical(outputs.get("RuleRef"), "orders");
    assertIdentical(
      outputs.get("RuleArn"),
      "arn:aws:events:us-east-1:888888888888:rule/orders",
    );
  });

  it("answers a schedule Ref with its name and GetAtt with its ARN", async () => {
    // Given a template outputting both of a schedule's values.
    const outputs = await outputsOf({
      Resources: {
        HourlyReport: {
          Type: "AWS::Scheduler::Schedule",
          Properties: {
            Name: "hourly-report",
            ScheduleExpression: "rate(1 hour)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: "arn:aws:sqs:us-east-1:888888888888:reports",
              RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
            },
          },
        },
      },
      Outputs: {
        ScheduleRef: { Value: { Ref: "HourlyReport" } },
        ScheduleArn: { Value: { "Fn::GetAtt": ["HourlyReport", "Arn"] } },
      },
    });

    // Then the ARN carries the schedule group, which a schedule ARN always
    // does even for the default group.
    assertIdentical(outputs.get("ScheduleRef"), "hourly-report");
    assertStringIncludes(
      String(outputs.get("ScheduleArn")),
      "schedule/default/hourly-report",
    );
  });
});
