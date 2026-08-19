import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
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

    // When it is deployed and an Object is put into the Bucket
    const received = await uploadedObjects(
      notifiedTemplate({ Events: ["s3:ObjectCreated:*"] }, withRemovals),
      ["cat.jpg"],
    );

    // Then the event's own notification was added rather than replacing the
    // one the template wrote by hand
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].eventName, "ObjectCreated:Put");
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
