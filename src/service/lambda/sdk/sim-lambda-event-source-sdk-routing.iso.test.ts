import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  DeleteEventSourceMappingCommand,
  GetEventSourceMappingCommand,
  LambdaClient,
  ListEventSourceMappingsCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

describe("simulated Lambda event source mapping SDK routing", () => {
  it("round-trips the mapping Commands through an intercepted client", async () => {
    // Given an intercepted Lambda client, with a queue and a function to map.
    using simSdk = new SimSdk();
    const lambda = new LambdaClient({ region: "eu-west-2" });
    const sqs = new SQSClient({ region: "eu-west-2" });

    simSdk.intercept(lambda);
    simSdk.intercept(sqs);

    await sqs.send(new CreateQueueCommand({ QueueName: "orders" }));

    const simSqs = simSdk.simAws
      .accountRegionScope(simSdk.simAws.defaultAccountId, "eu-west-2")
      .sqs();
    const queueArn = simSqs.findQueue("orders")?.arn.value;

    assertNonNullable(queueArn);

    const role = await simSdk.simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "OrderConsumerRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simSdk.simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrderConsumerRole",
        PolicyName: "ConsumeOrders",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: [
              "sqs:ReceiveMessage",
              "sqs:DeleteMessage",
              "sqs:GetQueueAttributes",
            ],
            Resource: queueArn,
          },
        }),
      }),
    );

    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: "order-consumer",
        Role: role.Role.Arn,
        Code: { ZipFile: makeLambdaZipFileInput(() => undefined) },
      }),
    );

    // When the mapping is created, read, listed and deleted through the SDK.
    const created = await lambda.send(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queueArn,
        FunctionName: "order-consumer",
      }),
    );

    assertNonNullable(created.UUID);

    const read = await lambda.send(
      new GetEventSourceMappingCommand({ UUID: created.UUID }),
    );
    const listed = await lambda.send(
      new ListEventSourceMappingsCommand({ FunctionName: "order-consumer" }),
    );
    const deleted = await lambda.send(
      new DeleteEventSourceMappingCommand({ UUID: created.UUID }),
    );

    // Then each Command reached the simulated Lambda of the client's Region.
    assertIdentical(read.EventSourceArn, queueArn);
    assertArrayLength(listed.EventSourceMappings ?? [], 1);
    assertIdentical(deleted.UUID, created.UUID);
    assertUndefined(
      simSdk.simAws
        .accountRegionScope(simSdk.simAws.defaultAccountId, "eu-west-2")
        .lambda()
        .getSimEventSourceMapping(created.UUID),
    );
  });
});
