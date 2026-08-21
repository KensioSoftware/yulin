import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployOrders,
  failingOrdersBinding,
  failureConfigProperties,
  failureRecord,
  invokeOrders,
  ordersFailuresQueueArn,
  ordersTemplate,
} from "../../../../../test/lambda/cfn-event-invoke-config-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Lambda CloudFormation event invoke config deployment", () => {
  it("sends a failure to the destination AWS::Lambda::EventInvokeConfig names", async () => {
    // Given a template with a queue, a failing function and a config between
    // them.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, failureConfigProperties());

    // Then the Resource is backed by the config the function now holds.
    const resource = stack.getResource("OrdersInvokeConfig");
    const config = simAws.lambda().getSimEventInvokeConfig("orders");

    assertNonNullable(resource);
    assertNonNullable(config);
    assertIdentical(resource.simResource, config);
    assertIdentical(config.settings.maximumRetryAttempts, 0);
    assertIdentical(config.settings.onFailureArn, ordersFailuresQueueArn);

    // And an asynchronous invocation the handler throws on reaches the queue
    // the template named.
    await invokeOrders(simAws);

    const record = await failureRecord(simAws);

    assertIdentical(record.requestContext.condition, "RetriesExhausted");
    assertIdentical(record.requestContext.approximateInvokeCount, 1);
    assertIdentical(JSON.stringify(record.requestPayload), '{"id":7}');
  });

  it("carries MaximumEventAgeInSeconds and OnSuccess through", async () => {
    // Given a template stating every setting the Resource takes.
    const simAws = new SimAws();
    await deployOrders(simAws, {
      FunctionName: { Ref: "OrdersFunction" },
      Qualifier: "$LATEST",
      MaximumRetryAttempts: 1,
      MaximumEventAgeInSeconds: 120,
      DestinationConfig: {
        OnSuccess: { Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] } },
        OnFailure: { Destination: { Ref: "OrderFailures" } },
      },
    });

    // Then the deployed config carries all of them, with the queue a Ref
    // named by URL read as the same queue.
    const config = simAws.lambda().getSimEventInvokeConfig("orders");

    assertNonNullable(config);
    assertIdentical(config.settings.maximumRetryAttempts, 1);
    assertIdentical(config.settings.maximumEventAgeInSeconds, 120);
    assertIdentical(config.settings.onSuccessArn, ordersFailuresQueueArn);
    assertIdentical(config.settings.onFailureArn, ordersFailuresQueueArn);
  });

  it("points a Qualifier at the alias it names", async () => {
    // Given a template publishing a version, aliasing it, and configuring the
    // alias rather than the function.
    const simAws = new SimAws();
    const template = ordersTemplate({
      FunctionName: { Ref: "OrdersFunction" },
      Qualifier: "live",
      MaximumRetryAttempts: 0,
      DestinationConfig: {
        OnFailure: { Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] } },
      },
    });
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...template.Resources,
          OrdersVersion: {
            Type: "AWS::Lambda::Version",
            Properties: { FunctionName: { Ref: "OrdersFunction" } },
          },
          OrdersAlias: {
            Type: "AWS::Lambda::Alias",
            Properties: {
              FunctionName: { Ref: "OrdersFunction" },
              Name: "live",
              FunctionVersion: { "Fn::GetAtt": ["OrdersVersion", "Version"] },
            },
          },
        },
      },
      bindings: [failingOrdersBinding()],
    });
    await stack.waitForDeployComplete();

    // Then the config belongs to the alias, and the function itself has none.
    assertNonNullable(
      simAws.lambda().getSimEventInvokeConfig("orders", "live"),
    );
    assertUndefined(simAws.lambda().getSimEventInvokeConfig("orders"));

    // And an invocation of the alias is the one that reaches the destination.
    await invokeOrders(simAws, "live");

    const record = await failureRecord(simAws);

    assertIdentical(record.requestContext.approximateInvokeCount, 1);
  });

  it("removes the config with the Stack that deployed it", async () => {
    // Given a deployed function and a config on it.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, failureConfigProperties());

    assertNonNullable(simAws.lambda().getSimEventInvokeConfig("orders"));

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the config has gone, ahead of the function it was on.
    assertUndefined(simAws.lambda().getSimEventInvokeConfig("orders"));
    assertUndefined(simAws.lambda().getSimFunctionByName("orders"));
    assertArrayLength(stack.skippedResourceDeletions, 0);
    assertIdentical(
      stack.getResource("OrdersInvokeConfig")?.status,
      "DELETE_COMPLETE",
    );
  });
});
