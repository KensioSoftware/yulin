import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  simDynamoDbCallerUnder as callerUnder,
  simDynamoDbConditionKeyItem as key,
  simDynamoDbConditionKeyTable as tableName,
} from "./sim-dynamodb-condition-keys.test-support.js";

describe("DynamoDB request parameter condition keys", () => {
  it("supplies the Select a GetItem's projection implies", async () => {
    // Given a caller allowed only reads that ask for specific attributes.
    const { simAws, caller } = await callerUnder({
      StringEqualsIfExists: { "dynamodb:Select": "SPECIFIC_ATTRIBUTES" },
    });

    // When it reads an item with a projection and then without one.
    await simAws.dynamoDb().getItem(
      {
        input: {
          TableName: tableName,
          Key: key,
          ProjectionExpression: "total",
        },
      },
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .getItem({ input: { TableName: tableName, Key: key } }, { caller }),
    );

    // Then the read with no projection asks for all attributes, and is
    // refused.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses an update asking for whole items back", async () => {
    // Given a caller allowed updates that return only what they changed.
    const { simAws, caller } = await callerUnder({
      StringEqualsIfExists: {
        "dynamodb:ReturnValues": ["NONE", "UPDATED_OLD", "UPDATED_NEW"],
      },
    });
    const update = {
      TableName: tableName,
      Key: key,
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": { S: "SHIPPED" } },
    };

    // When it updates, returning nothing and then the whole new item.
    await simAws.dynamoDb().updateItem({ input: update }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .updateItem(
          { input: { ...update, ReturnValues: "ALL_NEW" } },
          { caller },
        ),
    );

    // Then the update defaulting to NONE goes through and ALL_NEW is refused.
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a read asking for its consumed capacity", async () => {
    // Given a caller allowed reads that report no capacity.
    const { simAws, caller } = await callerUnder({
      StringEquals: { "dynamodb:ReturnConsumedCapacity": "NONE" },
    });

    // When it scans without and then with ReturnConsumedCapacity.
    await simAws
      .dynamoDb()
      .scan({ input: { TableName: tableName } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .scan(
          { input: { TableName: tableName, ReturnConsumedCapacity: "TOTAL" } },
          { caller },
        ),
    );

    // Then the default of NONE passes and TOTAL is refused.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
