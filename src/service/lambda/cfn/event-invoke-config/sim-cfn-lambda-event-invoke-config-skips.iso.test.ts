import { DeleteFunctionEventInvokeConfigCommand } from "@aws-sdk/client-lambda";
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

import {
  deployOrders,
  failingOrdersBinding,
  failureConfigProperties,
  ordersFailuresQueueArn,
  ordersTemplate,
} from "../../../../../test/lambda/cfn-event-invoke-config-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Lambda CloudFormation event invoke config best effort", () => {
  it("deploys the config without a destination it cannot send to", async () => {
    // Given a template sending failures to a service outside the simulation.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, {
      FunctionName: { Ref: "OrdersFunction" },
      Qualifier: "$LATEST",
      MaximumRetryAttempts: 0,
      DestinationConfig: {
        OnSuccess: { Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] } },
        OnFailure: {
          Destination: "arn:aws:kinesis:us-east-1:888888888888:stream/orders",
        },
      },
    });

    // Then the config is deployed with the destination it can reach, and the
    // one it cannot is recorded rather than taking the Resource down.
    const config = simAws.lambda().getSimEventInvokeConfig("orders");

    assertNonNullable(config);
    assertUndefined(config.settings.onFailureArn);
    assertIdentical(config.settings.onSuccessArn, ordersFailuresQueueArn);

    const [ignored, ...rest] = stack.ignoredProperties;

    assertNonNullable(ignored, "a recorded destination");
    assertArrayEmpty(rest, "no second record");
    assertIdentical(ignored.logicalId, "OrdersInvokeConfig");
    assertIdentical(ignored.path, "DestinationConfig.OnFailure.Destination");
    assertStringIncludes(ignored.reason, "kinesis");
  });

  it("deploys the config without a destination the Stack skipped", async () => {
    // Given a template sending failures to a Resource type simulated
    // CloudFormation has no implementation for, whose Fn::GetAtt resolves to
    // nothing that names anything.
    const simAws = new SimAws();
    const template = ordersTemplate({
      FunctionName: { Ref: "OrdersFunction" },
      Qualifier: "$LATEST",
      DestinationConfig: {
        OnFailure: { Destination: { "Fn::GetAtt": ["OrderSigning", "Arn"] } },
      },
    });
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...template.Resources,
          OrderSigning: {
            Type: "AWS::Lambda::CodeSigningConfig",
            Properties: {
              AllowedPublishers: { SigningProfileVersionArns: [] },
            },
          },
        },
      },
      bindings: [failingOrdersBinding()],
    });
    await stack.waitForDeployComplete();

    // Then the skipped Resource has taken its destination with it, and the
    // config and the function are deployed anyway.
    assertArrayLength(stack.skippedResources, 1);

    const config = simAws.lambda().getSimEventInvokeConfig("orders");

    assertNonNullable(config);
    assertUndefined(config.settings.onFailureArn);

    const [ignored] = stack.ignoredProperties;

    assertNonNullable(ignored, "a recorded destination");
    assertIdentical(ignored.path, "DestinationConfig.OnFailure.Destination");
  });

  it("records a property it does not read", async () => {
    // Given a template with a made-up property on the Resource.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, {
      ...failureConfigProperties(),
      Nonsense: "true",
    });

    // Then the config still deploys, with the property recorded against it.
    assertNonNullable(simAws.lambda().getSimEventInvokeConfig("orders"));

    const [ignored] = stack.ignoredProperties;

    assertNonNullable(ignored, "a recorded property");
    assertIdentical(ignored.path, "Nonsense");
    assertStringIncludes(
      ignored.reason,
      "Nonsense is not an AWS::Lambda::EventInvokeConfig property",
    );
  });

  it("leaves a config something else removed alone", async () => {
    // Given a deployed config that has since been deleted through the SDK.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, failureConfigProperties());
    await simAws
      .lambda()
      .deleteFunctionEventInvokeConfig(
        new DeleteFunctionEventInvokeConfigCommand({ FunctionName: "orders" }),
      );

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the teardown carries on rather than failing over a config that has
    // already gone.
    assertIdentical(
      stack.getResource("OrdersInvokeConfig")?.status,
      "DELETE_COMPLETE",
    );
    assertUndefined(simAws.lambda().getSimFunctionByName("orders"));
  });

  it("fails a Resource whose settings are malformed", async () => {
    // Given a template asking for a retry count that is not a number.
    const simAws = new SimAws();

    // When the Stack is deployed, then the Resource fails with a diagnostic
    // naming the property, rather than deploying a config that ignores it.
    const error = await assertThrowsErrorAsync(async () => {
      await deployOrders(simAws, {
        ...failureConfigProperties(),
        MaximumRetryAttempts: "none",
      });
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::EventInvokeConfig OrdersInvokeConfig: " +
        "MaximumRetryAttempts must be a number",
    );
  });
});
