import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

const orderPattern = { source: ["orders.service"] };

/**
 * A simulation with a function to target, recording what it is invoked with.
 */
async function simAwsWithFunction(): Promise<{
  readonly simAws: SimAws;
  readonly received: unknown[];
}> {
  const simAws = new SimAws();
  const received: unknown[] = [];

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "fulfilment",
      Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
      Code: {
        ZipFile: makeLambdaZipFileInput((event: unknown) => {
          received.push(event);
          return { ok: true };
        }),
      },
    },
  });

  return { simAws, received };
}

/**
 * Put one order event and wait for what it caused.
 */
async function putOrder(simAws: SimAws): Promise<void> {
  await simAws.eventBridge().putEvents(
    new PutEventsCommand({
      Entries: [
        {
          Source: "orders.service",
          DetailType: "OrderPlaced",
          Detail: JSON.stringify({ orderId: "order-1" }),
        },
      ],
    }),
  );

  await simAws.backgroundTasksComplete();
}

describe("EventBridge CloudFormation Rule deployment", () => {
  it("deploys a rule whose target a matching event reaches", async () => {
    // Given a template with a rule targeting a function, and the permission
    // CDK emits alongside it.
    const { simAws, received } = await simAwsWithFunction();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersRule: {
            Type: "AWS::Events::Rule",
            Properties: {
              Name: "orders",
              EventPattern: orderPattern,
              State: "ENABLED",
              Targets: [
                {
                  Id: "fulfilment",
                  Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
                },
              ],
            },
          },
          PermissionForEventsToInvokeLambda: {
            Type: "AWS::Lambda::Permission",
            Properties: {
              FunctionName: "fulfilment",
              Action: "lambda:InvokeFunction",
              Principal: "events.amazonaws.com",
              SourceArn: { "Fn::GetAtt": ["OrdersRule", "Arn"] },
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // When a matching event is put, with no further SDK setup.
    await putOrder(simAws);

    // Then the function ran, so the rule and its target were both deployed.
    assertArrayLength(received, 1);
  });

  it("resolves a target ARN from Fn::GetAtt in the same template", async () => {
    // Given a template whose rule targets a queue it also declares.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
          OrdersRule: {
            Type: "AWS::Events::Rule",
            Properties: {
              Name: "orders",
              EventPattern: orderPattern,
              Targets: [
                {
                  Id: "orders-queue",
                  Arn: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
                },
              ],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the target carries the queue's real ARN rather than the intrinsic.
    const [target] = simAws.eventBridge().ruleTargets("orders");

    assertNonNullable(target);
    assertIdentical(
      target.arn.value,
      "arn:aws:sqs:us-east-1:888888888888:orders",
    );
  });

  it("attaches a rule to a bus the same template creates", async () => {
    // Given a template with a bus and a rule that Refs it.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersBus: {
            Type: "AWS::Events::EventBus",
            Properties: { Name: "orders" },
          },
          OrdersRule: {
            Type: "AWS::Events::Rule",
            Properties: {
              Name: "orders",
              EventBusName: { Ref: "OrdersBus" },
              EventPattern: orderPattern,
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the rule is on that bus, because Ref on a bus is its name rather
    // than its ARN, which is what makes it usable as an EventBusName.
    assertNonNullable(simAws.eventBridge().findRule("orders", "orders"));
    assertUndefined(simAws.eventBridge().findRule("orders"));
  });

  it("names an unnamed rule after the stack and logical id", async () => {
    // Given a rule the template does not name.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersRule: {
            Type: "AWS::Events::Rule",
            Properties: { EventPattern: orderPattern },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then it got a generated name, as real CloudFormation gives one, rather
    // than being named after its logical ID alone.
    const listed = await simAws.eventBridge().listRules({ input: {} });
    const [rule] = listed.Rules ?? [];

    assertNonNullable(rule);
    assertStringIncludes(rule.Name, "orders-stack");
    assertStringIncludes(rule.Name, "OrdersRule");
  });

  it("refuses a target property it does not model, naming it", async () => {
    // Given a rule whose target asks for an input transformer.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersRule: {
              Type: "AWS::Events::Rule",
              Properties: {
                Name: "orders",
                EventPattern: orderPattern,
                Targets: [
                  {
                    Id: "fulfilment",
                    Arn: "arn:aws:sqs:us-east-1:888888888888:orders",
                    InputTransformer: {
                      InputTemplate: '{"id": <id>}',
                      InputPathsMap: { id: "$.detail.orderId" },
                    },
                  },
                ],
              },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the deployment failed naming the property, rather than deploying a
    // rule that sends the whole event where one field was asked for.
    assertStringIncludes(error.message, "InputTransformer");
    assertStringIncludes(error.message, "OrdersRule");
  });

  it("records rule tags rather than failing the stack over them", async () => {
    // Given a tagged rule, as a CDK app tagging its whole app deploys.
    const simAws = new SimAws();

    // When the stack is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersRule: {
            Type: "AWS::Events::Rule",
            Properties: {
              Name: "orders",
              EventPattern: orderPattern,
              Tags: [{ Key: "team", Value: "orders" }],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the rule is there, and the tags it lost are recorded against it.
    assertNonNullable(simAws.eventBridge().findRule("orders"));

    const ignored = stack.getResource("OrdersRule")?.ignoredProperties ?? [];

    assertArrayLength(ignored, 1);
    assertIdentical(ignored[0].path, "Tags");
    assertStringIncludes(ignored[0].reason, "not simulated");
  });

  it("refuses a bus property written as null", async () => {
    // Given a template writing null for a property that is not simulated,
    // which is a value rather than an absence.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersBus: {
              Type: "AWS::Events::EventBus",
              Properties: { Name: "orders", Policy: null },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then it is refused, rather than read as having left the policy out.
    assertStringIncludes(error.message, "Policy");
  });

  it("records bus tags rather than failing the stack over them", async () => {
    // Given a tagged bus, as a CDK app tagging its whole app deploys.
    const simAws = new SimAws();

    // When the stack is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersBus: {
            Type: "AWS::Events::EventBus",
            Properties: {
              Name: "orders",
              Tags: [{ Key: "team", Value: "orders" }],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // Then the bus is there, and the tags it lost are recorded against it.
    assertNonNullable(simAws.eventBridge().findEventBus("orders"));

    const ignored = stack.getResource("OrdersBus")?.ignoredProperties ?? [];

    assertArrayLength(ignored, 1);
    assertIdentical(ignored[0].path, "Tags");
    assertStringIncludes(ignored[0].reason, "not simulated");
  });

  it("removes the rules and targets a stack created", async () => {
    // Given a deployed stack with a rule and a target.
    const simAws = new SimAws();

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersBus: {
            Type: "AWS::Events::EventBus",
            Properties: { Name: "orders" },
          },
          OrdersRule: {
            Type: "AWS::Events::Rule",
            Properties: {
              Name: "orders",
              EventBusName: { Ref: "OrdersBus" },
              EventPattern: orderPattern,
              Targets: [
                {
                  Id: "orders-queue",
                  Arn: "arn:aws:sqs:us-east-1:888888888888:orders",
                },
              ],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();

    // When the stack is torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then the bus, the rule and the targets are all gone.
    assertUndefined(simAws.eventBridge().findEventBus("orders"));
    assertUndefined(simAws.eventBridge().findRule("orders", "orders"));
    assertArrayEmpty(simAws.eventBridge().ruleTargets("orders", "orders"));
  });
});
