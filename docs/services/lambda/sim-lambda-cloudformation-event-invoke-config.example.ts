/**
 * Deploying a Lambda failure destination and a dead-letter queue from a
 * CloudFormation template.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import type { SimLambdaDestinationRecord } from "@kensio/yulin/lambda";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrderFailures: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "order-failures" },
      },
      OrderDeadLetters: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders-dlq" },
      },
      OrdersRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrdersRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "SendFailedOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: "sqs:SendMessage",
                    Resource: [
                      { "Fn::GetAtt": ["OrderFailures", "Arn"] },
                      { "Fn::GetAtt": ["OrderDeadLetters", "Arn"] },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: { "Fn::GetAtt": ["OrdersRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: {
            ZipFile:
              "exports.handler = async () => { throw new Error('failed'); };",
          },
          DeadLetterConfig: {
            TargetArn: { "Fn::GetAtt": ["OrderDeadLetters", "Arn"] },
          },
        },
      },
      OrdersInvokeConfig: {
        Type: "AWS::Lambda::EventInvokeConfig",
        Properties: {
          FunctionName: { Ref: "OrdersFunction" },
          Qualifier: "$LATEST",
          MaximumRetryAttempts: 0,
          DestinationConfig: {
            OnFailure: {
              Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] },
            },
          },
        },
      },
    },
    Outputs: {
      FailuresQueueUrl: {
        Value: { "Fn::GetAtt": ["OrderFailures", "QueueUrl"] },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    InvocationType: "Event",
    Payload: JSON.stringify({ id: 7 }),
  }),
);
await simAws.backgroundTasksComplete();

const received = await simAws
  .sqs()
  .receiveMessage(
    new ReceiveMessageCommand({ QueueUrl: stack.output("FailuresQueueUrl") }),
  );
const record = JSON.parse(
  String(received.Messages?.[0]?.Body),
) as SimLambdaDestinationRecord;

console.log(record.requestContext.condition);
console.log(record.requestPayload);
