/**
 * What each step of the pipeline is allowed to do.
 *
 * These are separate from the factory that creates the steps because they are
 * the interesting part: a test that passes with these is a test whose system
 * worked with the permissions it was actually given, and taking one away
 * breaks the step that needed it.
 */

import type { SimIamPolicyDocumentStatement } from "../../src/service/iam/policy/sim-iam-policy.js";

/**
 * The ARNs the pipeline's steps name in their policies.
 */
export interface MediaPipelineResources {
  readonly tableArn: string;
  readonly bucketArn: string;
  readonly queueArn: string;
  readonly parameterArn: string;
}

/**
 * One statement list per step.
 */
export interface MediaPipelinePermissions {
  readonly requestUpload: readonly SimIamPolicyDocumentStatement[];
  readonly screenUpload: readonly SimIamPolicyDocumentStatement[];
  readonly buildRenditions: readonly SimIamPolicyDocumentStatement[];
  readonly uploadStatus: readonly SimIamPolicyDocumentStatement[];
  readonly publishRendition: readonly SimIamPolicyDocumentStatement[];
}

/**
 * The least each step of the pipeline can be allowed and still work.
 */
export function mediaPipelinePermissions(
  resources: MediaPipelineResources,
): MediaPipelinePermissions {
  const { tableArn, bucketArn, queueArn, parameterArn } = resources;
  const objectArn = `${bucketArn}/*`;
  const readAndWriteObjects: SimIamPolicyDocumentStatement = {
    Effect: "Allow",
    Action: ["s3:GetObject", "s3:PutObject"],
    Resource: objectArn,
  };

  return {
    requestUpload: [
      { Effect: "Allow", Action: "dynamodb:PutItem", Resource: tableArn },
    ],
    screenUpload: [
      // A detection names no resource of its own, so this one has to be `*`.
      {
        Effect: "Allow",
        Action: "rekognition:DetectModerationLabels",
        Resource: "*",
      },
      readAndWriteObjects,
      { Effect: "Allow", Action: "dynamodb:UpdateItem", Resource: tableArn },
    ],
    buildRenditions: [
      {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
      readAndWriteObjects,
      { Effect: "Allow", Action: "dynamodb:UpdateItem", Resource: tableArn },
      { Effect: "Allow", Action: "ssm:GetParameter", Resource: parameterArn },
    ],
    uploadStatus: [
      { Effect: "Allow", Action: "dynamodb:GetItem", Resource: tableArn },
      { Effect: "Allow", Action: "s3:ListBucket", Resource: bucketArn },
    ],
    publishRendition: [
      {
        Effect: "Allow",
        Action: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        Resource: tableArn,
      },
      readAndWriteObjects,
    ],
  };
}
