import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../../test/lambda/stream-event-source-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";

describe("a sim Lambda function running in a recursive loop", () => {
  it("is stopped after sixteen invocations of itself", async () => {
    // Given a function that invokes itself until something stops it.
    const simAws = new SimAws();
    let invocations = 0;
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "echo",
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/EchoRole`,
        Code: {
          ZipFile: makeLambdaZipFileInput(async () => {
            invocations += 1;
            // As the Account root, since the role has no policy of its own.
            await simAws
              .lambda()
              .invoke(new InvokeCommand({ FunctionName: "echo" }), {
                caller: {
                  kind: "arn",
                  arn: `arn:aws:iam::${simAws.defaultAccountId}:root`,
                },
              });
          }),
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When it is invoked once.
    await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "echo" }));

    // Then the seventeenth invocation was stopped.
    assertIdentical(invocations, 16);
  });

  it("counts no chain through a stream", async () => {
    // Given a stream mapping whose function writes back to its own table
    // three times, below the cascade guard.
    let writes = 0;
    let writeBack = async (): Promise<void> => {
      // Replaced once the table exists.
    };
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: async () => {
        await writeBack();
      },
    });
    writeBack = async (): Promise<void> => {
      writes += 1;
      if (writes <= 3) {
        await simAws.dynamoDb().putItem(
          new PutItemCommand({
            TableName: tableName,
            Item: { orderId: { S: `order-${String(writes)}` } },
          }),
        );
      }
    };
    await simAws.backgroundTasksComplete();

    // When a write starts it.
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-0" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then every write was delivered.
    assertArrayLength(events, 4);
  });
});
