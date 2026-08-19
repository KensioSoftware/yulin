import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";
import { uploadsBucket } from "./sim-cfn-sam-event-source.resources.js";

/**
 * The part of the S3 event document these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: { readonly object: { readonly key: string } };
    },
  ];
}

/**
 * A SAM template notifying the function about the Bucket it declares.
 */
function notifiedTemplate(
  eventProperties: SimCfnTemplateValueRecord,
  bucket: SimCfnTemplateValueRecord = uploadsBucket,
): CfnTemplateBodyRecord {
  return simCfnSamFunctionTemplateFactory.make({
    functionProperties: {
      Events: {
        Upload: {
          Type: "S3",
          Properties: { Bucket: "UploadsBucket", ...eventProperties },
        },
      },
    },
    resources: { UploadsBucket: bucket },
  });
}

/**
 * Deploy a template, put the given Object keys into the Bucket it declares,
 * and answer with what the bound handler was given.
 */
async function uploadedObjects(
  template: CfnTemplateBodyRecord,
  keys: readonly string[],
  deletedKeys: readonly string[] = [],
): Promise<readonly S3EventDocument[]> {
  const simAws = new SimAws();
  const received: S3EventDocument[] = [];

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "uploads-stack",
    template,
    bindings: [
      {
        logicalId: samFunctionTemplateLogicalId,
        handler: (event: S3EventDocument): undefined => {
          received.push(event);

          return undefined;
        },
      },
    ],
  });
  await stack.waitForDeployComplete();

  await Promise.all(
    keys.map(async (key) =>
      simAws.s3().putObject(
        new PutObjectCommand({
          Bucket: "uploads",
          Key: key,
          Body: "a picture",
        }),
      ),
    ),
  );
  await simAws.backgroundTasksComplete();

  await Promise.all(
    deletedKeys.map(async (key) =>
      simAws
        .s3()
        .deleteObject(new DeleteObjectCommand({ Bucket: "uploads", Key: key })),
    ),
  );
  await simAws.backgroundTasksComplete();

  return received;
}

describe("SAM S3 event expansion", () => {
  it("notifies the function of an Object put into the Bucket", async () => {
    // Given a SAM function with an S3 event naming a Bucket the template
    // declares

    // When it is deployed and an Object is put into that Bucket
    const received = await uploadedObjects(
      notifiedTemplate({ Events: "s3:ObjectCreated:*" }),
      ["cat.jpg"],
    );

    // Then the put reached the bound handler, which means the event both
    // notified the Bucket and granted S3 the permission to invoke the function
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].eventName, "ObjectCreated:Put");
    assertIdentical(received[0].Records[0].s3.object.key, "cat.jpg");
  });

  it("notifies only what the event's Filter matches", async () => {
    // Given an S3 event filtered to one suffix

    // When Objects of two suffixes are put into the Bucket
    const received = await uploadedObjects(
      notifiedTemplate({
        Events: "s3:ObjectCreated:*",
        Filter: { S3Key: { Rules: [{ Name: "suffix", Value: ".jpg" }] } },
      }),
      ["cat.jpg", "notes.txt"],
    );

    // Then only the matching one reached the function
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].s3.object.key, "cat.jpg");
  });

  it("keeps the notifications the Bucket already declared", async () => {
    // Given a Bucket that already notifies the function of removals and waits
    // on it, and an event adding creations to that
    const withRemovals: SimCfnTemplateValueRecord = {
      Type: "AWS::S3::Bucket",
      DependsOn: samFunctionTemplateLogicalId,
      Properties: {
        BucketName: "uploads",
        NotificationConfiguration: {
          LambdaConfigurations: [
            {
              Event: "s3:ObjectRemoved:*",
              Function: {
                "Fn::GetAtt": [samFunctionTemplateLogicalId, "Arn"],
              },
            },
          ],
        },
      },
    };

    // When it is deployed, and an Object is put into the Bucket and then
    // deleted again
    const received = await uploadedObjects(
      notifiedTemplate({ Events: ["s3:ObjectCreated:*"] }, withRemovals),
      ["cat.jpg"],
      ["cat.jpg"],
    );

    // Then both notifications fired, so the event's own was added rather than
    // put in place of the one the template wrote by hand
    assertArrayLength(received, 2);
    assertIdentical(received[0].Records[0].eventName, "ObjectCreated:Put");
    assertIdentical(received[1].Records[0].eventName, "ObjectRemoved:Delete");
  });

  it("refuses a Bucket whose notification list is an intrinsic", async () => {
    // Given a Bucket stating its notifications through Fn::If, which is a list
    // CloudFormation has not resolved by the time the event is expanded
    const simAws = new SimAws();
    const conditional: SimCfnTemplateValueRecord = {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "uploads",
        NotificationConfiguration: {
          LambdaConfigurations: {
            "Fn::If": [
              "IsProduction",
              [
                {
                  Event: "s3:ObjectRemoved:*",
                  Function: {
                    "Fn::GetAtt": [samFunctionTemplateLogicalId, "Arn"],
                  },
                },
              ],
              [],
            ],
          },
        },
      },
    };

    // When an S3 event asks to be added to it
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "intrinsic-uploads-stack",
        template: {
          ...notifiedTemplate({ Events: "s3:ObjectCreated:*" }, conditional),
          Parameters: { Stage: { Type: "String" } },
          Conditions: {
            IsProduction: { "Fn::Equals": [{ Ref: "Stage" }, "production"] },
          },
        },
        parameters: { Stage: "test" },
      });
    });

    // Then the Bucket is refused by name, rather than deploying with the
    // notifications it declared quietly dropped
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket NotificationConfiguration in Resource " +
        "UploadsBucket",
    );
    assertStringIncludes(error.message, "LambdaConfigurations");
  });

  it("refuses a Bucket a conditioned function's event would break", async () => {
    // Given a function the template conditions out, with an S3 event on a
    // Bucket that is not conditioned
    const simAws = new SimAws();

    // When it is deployed with the condition false
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "conditioned-uploads-stack",
        template: {
          Transform: "AWS::Serverless-2016-10-31",
          Parameters: { Stage: { Type: "String" } },
          Conditions: {
            IsProduction: { "Fn::Equals": [{ Ref: "Stage" }, "production"] },
          },
          Resources: {
            UploadsBucket: uploadsBucket,
            [samFunctionTemplateLogicalId]: {
              Type: "AWS::Serverless::Function",
              Condition: "IsProduction",
              Properties: {
                FunctionName: "rates",
                Handler: "index.handler",
                Runtime: "nodejs22.x",
                InlineCode: "exports.handler = async () => 'rates';",
                Events: {
                  Upload: {
                    Type: "S3",
                    Properties: {
                      Bucket: "UploadsBucket",
                      Events: "s3:ObjectCreated:*",
                    },
                  },
                },
              },
            },
          },
        },
        parameters: { Stage: "test" },
      });
    });

    // Then the Stack says which Resource named the function it never created.
    // A notification belongs to the Bucket, and there is no conditioning one
    // entry of somebody else's property, so a template wanting the function
    // conditioned has to condition the Bucket with it.
    assertStringIncludes(
      error.message,
      `Resource UploadsBucket names Resource ${samFunctionTemplateLogicalId}`,
    );
    assertStringIncludes(error.message, "Condition IsProduction is false");
  });

  it("expands nothing for an event naming no event to be told about", async () => {
    // Given an S3 event naming a Bucket and no S3 event to be notified of
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "eventless-uploads-stack",
      template: notifiedTemplate({}),
    });
    await stack.waitForDeployComplete();

    // Then the Bucket deployed unnotified, rather than carrying a
    // configuration naming nothing
    assertNonNullable(stack.getResource("UploadsBucket"));
    assertUndefined(
      stack.getResource(`${samFunctionTemplateLogicalId}UploadS3Permission`),
    );
    assertArrayLength(stack.skippedResources, 0);
  });

  it("expands nothing for an event naming no Bucket", async () => {
    // Given an S3 event that names no Bucket to be notified by
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "bucketless-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Upload: {
              Type: "S3",
              Properties: { Events: "s3:ObjectCreated:*" },
            },
          },
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the function deployed with nothing notifying it
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertUndefined(
      stack.getResource(`${samFunctionTemplateLogicalId}UploadS3Permission`),
    );
    assertArrayLength(stack.skippedResources, 0);
  });
});
