/**
 * One execution role per function, each allowed only what its own step of the
 * pipeline does.
 *
 * The pipeline is worth testing partly because these are real: a step calling
 * something its role does not allow fails the way it would on AWS, rather than
 * quietly working.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import {
  mediaBucketName,
  mediaTableName,
  renditionWidthsParameterName,
} from "./media-pipeline-names.js";

const lambdaTrustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

interface PolicyStatement {
  readonly Effect: "Allow";
  readonly Action: string | readonly string[];
  readonly Resource: string | readonly string[];
}

/**
 * The execution role ARNs the functions are created with.
 */
export interface MediaPipelineRoles {
  readonly requestUpload: string;
  readonly screenUpload: string;
  readonly buildRenditions: string;
  readonly uploadStatus: string;
  readonly publishRendition: string;
}

/**
 * Create every execution role the pipeline's functions run as.
 */
export async function createMediaPipelineRoles(
  simAws: SimAws,
  queueArn: string,
): Promise<MediaPipelineRoles> {
  const tableArn = `arn:aws:dynamodb:${simAws.defaultRegionName}:${simAws.defaultAccountId}:table/${mediaTableName}`;
  const objectArn = `arn:aws:s3:::${mediaBucketName}/*`;
  const parameterArn = `arn:aws:ssm:${simAws.defaultRegionName}:${simAws.defaultAccountId}:parameter${renditionWidthsParameterName}`;

  return {
    requestUpload: await createRole(simAws, "RequestUploadRole", [
      { Effect: "Allow", Action: "dynamodb:PutItem", Resource: tableArn },
    ]),
    screenUpload: await createRole(simAws, "ScreenUploadRole", [
      // A detection names no resource of its own, so this one has to be `*`.
      {
        Effect: "Allow",
        Action: "rekognition:DetectModerationLabels",
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: objectArn,
      },
      { Effect: "Allow", Action: "dynamodb:UpdateItem", Resource: tableArn },
    ]),
    buildRenditions: await createRole(simAws, "BuildRenditionsRole", [
      {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: objectArn,
      },
      { Effect: "Allow", Action: "dynamodb:UpdateItem", Resource: tableArn },
      { Effect: "Allow", Action: "ssm:GetParameter", Resource: parameterArn },
    ]),
    uploadStatus: await createRole(simAws, "UploadStatusRole", [
      { Effect: "Allow", Action: "dynamodb:GetItem", Resource: tableArn },
      {
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: `arn:aws:s3:::${mediaBucketName}`,
      },
    ]),
    publishRendition: await createRole(simAws, "PublishRenditionRole", [
      {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        Resource: tableArn,
      },
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject"],
        Resource: objectArn,
      },
    ]),
  };
}

/**
 * Create one execution role with one inline policy, and answer with its ARN.
 */
async function createRole(
  simAws: SimAws,
  roleName: string,
  statements: readonly PolicyStatement[],
): Promise<string> {
  const created = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: lambdaTrustPolicy,
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: `${roleName}Policy`,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statements,
      }),
    }),
  );

  return created.Role.Arn;
}
