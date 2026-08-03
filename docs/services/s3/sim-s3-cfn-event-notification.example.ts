/**
 * Configuring Bucket event notifications from a CloudFormation template.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      Thumbnailer: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "thumbnailer",
          Role: { "Fn::GetAtt": ["ThumbnailerRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: { ZipFile: "exports.handler = async () => 'thumbnailed';" },
        },
      },
      ThumbnailerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "thumbnailer-role",
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
        },
      },
      ThumbnailerPermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { "Fn::GetAtt": ["Thumbnailer", "Arn"] },
          Principal: "s3.amazonaws.com",
          SourceAccount: { Ref: "AWS::AccountId" },
          SourceArn: "arn:aws:s3:::uploads",
        },
      },
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        DependsOn: ["ThumbnailerPermission"],
        Properties: {
          BucketName: "uploads",
          NotificationConfiguration: {
            LambdaConfigurations: [
              {
                Event: "s3:ObjectCreated:*",
                Function: { "Fn::GetAtt": ["Thumbnailer", "Arn"] },
                Filter: {
                  S3Key: { Rules: [{ Name: "prefix", Value: "raw/" }] },
                },
              },
            ],
          },
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/cat.jpg",
    Body: "cat picture",
  }),
);

// Delivery happens in the background, so wait for the simulation to settle.
await simAws.backgroundTasksComplete();
