/**
 * A workflow that records an enrolment in DynamoDB and announces it on SNS.
 */

import { CreateTableCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateTopicCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "enrolments",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

const topic = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "enrolments" }));

// The execution assumes this role, and every call it makes is authorized as it.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "WorkflowRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "states.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "WorkflowRole",
    PolicyName: "RecordEnrolments",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["dynamodb:PutItem", "sns:Publish"],
        Resource: "*",
      },
    }),
  }),
);

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: role.Role.Arn,
    definition: JSON.stringify({
      StartAt: "Record",
      States: {
        Record: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "enrolments",
            Item: { id: { "S.$": "$.student" }, term: { S: "2026-autumn" } },
          },
          // PutItem answers with nothing, and the announcement needs the input.
          ResultPath: null,
          Next: "Announce",
        },
        Announce: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: topic.TopicArn,
            Message: { "student.$": "$.student", enrolled: true },
          },
          End: true,
        },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({ student: "Wei" }),
  },
});

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // SUCCEEDED

const recorded = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "enrolments",
    Key: { id: { S: "Wei" } },
  }),
);

console.log(recorded.Item?.["term"]); // { S: '2026-autumn' }
