import {
  GetBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { simCdkBucketNotificationsTemplateFactory } from "./sim-cdk-bucket-notifications-template.factory.js";

/**
 * The part of the S3 event document these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: {
        readonly configurationId: string;
        readonly bucket: { readonly name: string };
        readonly object: { readonly key: string };
      };
    },
  ];
}

describe("CDK Bucket notifications CloudFormation Custom Resource", () => {
  it("notifies the deployed function when an Object is created", async () => {
    // Given the template CDK synthesizes for a Bucket event notification,
    // with the function bound to a handler this test can watch.
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({}),
      bindings: [
        {
          functionName: "thumbnailer",
          handler: (event: S3EventDocument): string => {
            received.push(event);

            return "thumbnailed";
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    // Then an Object put into the deployed Bucket reaches the deployed
    // function.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    assertArrayLength(received, 1);
    const record = received[0].Records[0];
    assertIdentical(record.eventName, "ObjectCreated:Put");
    assertIdentical(record.s3.bucket.name, "uploads");
    assertIdentical(record.s3.object.key, "cat.jpg");
  });

  it("configures the Bucket as PutBucketNotificationConfiguration would", async () => {
    // Given a template naming the configuration it applies.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({
        notificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Id: "thumbnails",
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] },
              },
            },
          ],
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Bucket reports the configuration back as it would for an SDK
    // caller who applied the same one.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = output.LambdaFunctionConfigurations;
    assertNonNullable(configurations);
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].Id, "thumbnails");
    assertIdentical(
      configurations[0].LambdaFunctionArn,
      `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:thumbnailer`,
    );
    assertIdentical(
      configurations[0].Filter?.Key?.FilterRules?.[0]?.Value,
      "raw/",
    );
  });

  it("delivers only the Object keys the prefix filter matches", async () => {
    // Given a template whose notification filters on a prefix.
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({
        notificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
              Filter: {
                Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] },
              },
            },
          ],
        },
      }),
      bindings: [
        {
          functionName: "thumbnailer",
          handler: (event: S3EventDocument): string => {
            received.push(event);

            return "thumbnailed";
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    // When Objects are put on both sides of the filter.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "thumbs/cat.jpg",
        Body: "thumbnail",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the matching key is delivered.
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].s3.object.key, "raw/cat.jpg");
  });

  it("reads Managed and SkipDestinationValidation as strings", async () => {
    // Given a template whose flags are the strings CloudFormation hands a
    // custom Resource provider, rather than JSON booleans.
    const simAws = new SimAws();

    // When the template is deployed, naming a function nothing permits S3 to
    // invoke, with destination validation skipped.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({
        permitted: false,
        notificationProperties: {
          Managed: "true",
          SkipDestinationValidation: "true",
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the configuration is applied without the destination being
    // validated, as it is for an SDK caller who skipped it.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    assertArrayLength(output.LambdaFunctionConfigurations ?? [], 1);
  });

  it("applies a configuration that filters on nothing", async () => {
    // Given a template carrying an empty filter, which is a configuration S3
    // accepts and every Object key passes.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({
        notificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: ["s3:ObjectCreated:*"],
              LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
              Filter: { Key: {} },
            },
          ],
          QueueConfigurations: [],
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Bucket is configured, with no filter rules reported back.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = output.LambdaFunctionConfigurations;
    assertNonNullable(configurations);
    assertArrayLength(configurations, 1);
    assertUndefined(configurations[0].Filter);
  });
});
