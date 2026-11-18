import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  simDynamoDbCallerUnder as callerUnder,
  simDynamoDbConditionKeyTable as tableName,
} from "./sim-dynamodb-condition-keys.test-support.js";

describe("DynamoDB Select condition key", () => {
  it.each([
    { read: "names a projection", projects: true },
    { read: "names no projection", projects: false },
  ])(
    "lets a Select-scoped caller query only when it $read",
    async ({ projects }) => {
      // Given a caller allowed to read specific attributes only, as the
      // developer guide's fine-grained access control examples write it.
      const { simAws, caller } = await callerUnder({
        StringEquals: { "dynamodb:Select": "SPECIFIC_ATTRIBUTES" },
      });

      // When it queries, with or without a projection.
      const query = simAws.dynamoDb().query(
        {
          input: {
            TableName: tableName,
            KeyConditionExpression: "customerId = :c",
            ExpressionAttributeValues: { ":c": { S: "c-1" } },
            ...(projects && { ProjectionExpression: "orderId" }),
          },
        },
        { caller },
      );

      // Then only a query naming a projection asks for specific attributes.
      if (projects) {
        assertNonNullable(await query);
      } else {
        assertInstanceOf(
          await assertThrowsErrorAsync(async () => query),
          SimIamAccessDenied,
        );
      }
    },
  );
});
