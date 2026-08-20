import {
  DeleteFunctionEventInvokeConfigCommand,
  InvokeCommand,
} from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnStack } from "../../../cloudformation/stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaDestinationRecord } from "../../destination/sim-lambda-destination-record.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * A template with a queue for the failures, an orders function, and an event
 * invoke config sending the function's failures to the queue, as CDK
 * synthesizes for `onFailure`.
 */
function ordersTemplate(
  configProperties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrderFailures: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "order-failures" },
      },
      OrdersRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrdersRole",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: { "Fn::GetAtt": ["OrdersRole", "Arn"] },
        },
      },
      OrdersInvokeConfig: {
        Type: "AWS::Lambda::EventInvokeConfig",
        Properties: configProperties,
      },
    },
  };
}

/**
 * The properties of a config on the function itself, sending failures to the
 * template's queue and giving up after the first attempt.
 */
function failureConfigProperties(): SimCfnTemplateValueRecord {
  return {
    FunctionName: { Ref: "OrdersFunction" },
    Qualifier: "$LATEST",
    MaximumRetryAttempts: 0,
    DestinationConfig: {
      OnFailure: { Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] } },
    },
  };
}

/**
 * Deploy the orders template with a handler that always throws.
 */
async function deployOrders(
  simAws: SimAws,
  configProperties: SimCfnTemplateValueRecord,
): Promise<SimCfnStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: ordersTemplate(configProperties),
    bindings: [
      {
        logicalId: "OrdersFunction",
        handler: (): never => {
          throw new Error("orders handler failed");
        },
      },
    ],
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * Invoke the deployed function asynchronously and let every retry it makes
 * fall due.
 */
async function invokeOrders(simAws: SimAws, qualifier?: string): Promise<void> {
  await simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: "orders",
      Qualifier: qualifier,
      InvocationType: "Event",
      Payload: JSON.stringify({ id: 7 }),
    }),
  );
  await simAws.backgroundTasksComplete();
  await simAws.clock().advanceBy({ minutes: 5 });
}

/**
 * The one destination record waiting on the failures queue.
 */
async function failureRecord(
  simAws: SimAws,
): Promise<SimLambdaDestinationRecord> {
  const received = await simAws.sqs().receiveMessage(
    new ReceiveMessageCommand({
      QueueUrl: simAws.sqs().findQueue("order-failures")?.url,
      MaxNumberOfMessages: 10,
    }),
  );

  assertArrayLength(received.Messages ?? [], 1);
  const body = received.Messages?.[0]?.Body;
  assertNonNullable(body, "a destination record arrived");

  return JSON.parse(body) as SimLambdaDestinationRecord;
}

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
    assertIdentical(
      config.settings.onFailureArn,
      "arn:aws:sqs:us-east-1:888888888888:order-failures",
    );

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
    assertIdentical(
      config.settings.onSuccessArn,
      "arn:aws:sqs:us-east-1:888888888888:order-failures",
    );
    assertIdentical(
      config.settings.onFailureArn,
      "arn:aws:sqs:us-east-1:888888888888:order-failures",
    );
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
              FunctionVersion: {
                "Fn::GetAtt": ["OrdersVersion", "Version"],
              },
            },
          },
        },
      },
      bindings: [
        {
          logicalId: "OrdersFunction",
          handler: (): never => {
            throw new Error("orders handler failed");
          },
        },
      ],
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
    assertIdentical(
      config.settings.onSuccessArn,
      "arn:aws:sqs:us-east-1:888888888888:order-failures",
    );

    const [ignored, ...rest] = stack.ignoredProperties;
    assertNonNullable(ignored, "a recorded destination");
    assertArrayLength(rest, 0, "no second record");
    assertIdentical(ignored.logicalId, "OrdersInvokeConfig");
    assertIdentical(ignored.path, "DestinationConfig.OnFailure.Destination");
    assertStringIncludes(ignored.reason, "kinesis");
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
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: ordersTemplate({
          ...failureConfigProperties(),
          MaximumRetryAttempts: "none",
        }),
        bindings: [
          { logicalId: "OrdersFunction", handler: (): string => "ordered" },
        ],
      });

      await stack.waitForDeployComplete();
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::EventInvokeConfig OrdersInvokeConfig: " +
        "MaximumRetryAttempts must be a number",
    );
  });
});
