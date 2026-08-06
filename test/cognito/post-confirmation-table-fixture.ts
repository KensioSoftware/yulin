/**
 * The parts a test needs to watch a `PostConfirmation` trigger write a user
 * item to a simulated DynamoDB table: the table, an execution Role with or
 * without the grant the write needs, and a pool whose trigger runs that code.
 *
 * The function code here is a real archive rather than a stowed handler
 * function, so it runs in the Lambda vm with the runtime's own AWS SDK provided
 * to it. Its calls are made as the function's execution Role, which is what
 * makes the missing-grant case mean anything.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaCodeZip } from "../../src/service/lambda/function/code/make-lambda-code-zip.js";
import {
  makeTriggerPool,
  triggerFunctionArn,
  type SimCognitoTriggerPool,
} from "./trigger-fixture.js";

/** The table the trigger writes each confirmed user to. */
export const usersTableName = "users";

const writeUserItemCode = `
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamoDb = new DynamoDBClient({});

exports.handler = async (event) => {
  await dynamoDb.send(
    new PutItemCommand({
      TableName: "${usersTableName}",
      Item: {
        sub: { S: event.request.userAttributes.sub },
        email: { S: event.request.userAttributes.email },
        username: { S: event.userName },
      },
    }),
  );

  return event;
};
`;

/**
 * Build a pool whose `PostConfirmation` trigger writes the new user to the
 * table, running as a Role that may or may not write it.
 */
export async function makeUserWritingPool(
  granted: boolean,
): Promise<SimCognitoTriggerPool> {
  const simAws = new SimAws();

  await makeUsersTable(simAws);

  return await makeTriggerPool({
    simAws,
    triggers: { PostConfirmation: triggerFunctionArn },
    code: makeLambdaCodeZip(writeUserItemCode),
    roleArn: await makeWriterRole(simAws, granted),
  });
}

/**
 * Read the item the trigger would have written for a user.
 */
export async function readUserItem(
  pool: SimCognitoTriggerPool,
  sub: string,
): Promise<Record<string, AttributeValue> | undefined> {
  const read = await pool.simAws.dynamoDb().getItem(
    new GetItemCommand({
      TableName: usersTableName,
      Key: { sub: { S: sub } },
    }),
  );

  return read.Item;
}

async function makeUsersTable(simAws: SimAws): Promise<void> {
  await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: usersTableName,
      AttributeDefinitions: [{ AttributeName: "sub", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "sub", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
}

async function makeWriterRole(
  simAws: SimAws,
  granted: boolean,
): Promise<string> {
  const roleName = "PostConfirmationRole";
  const created = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (granted) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "WriteUsers",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "dynamodb:PutItem",
            Resource: `arn:aws:dynamodb:*:*:table/${usersTableName}`,
          },
        }),
      }),
    );
  }

  return created.Role.Arn;
}
