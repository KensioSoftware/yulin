import {
  GetBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../../iam/policy/sim-iam-policy-document.factory.js";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../../../test/sns/subscription-fixture.js";
import { simS3NotificationTopic } from "../../../../../../test/s3/notification-topic-fixture.js";
import { simCfnS3BucketNotificationTemplateFactory } from "./sim-cfn-s3-bucket-notification-template.factory.js";

/**
 * The part of the S3 event document these tests read.
 */
interface S3EventDocument {
  readonly Records: readonly [
    {
      readonly eventName: string;
      readonly s3: {
        readonly bucket: { readonly name: string };
        readonly object: { readonly key: string };
      };
    },
  ];
}

describe("AWS::S3::Bucket NotificationConfiguration", () => {
  it("notifies the deployed function when an Object is created", async () => {
    // Given a template declaring a Lambda notification on the Bucket itself.
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({}),
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

  it("reads the singular Event string as a one-element Events list", async () => {
    // Given a template naming one event, as CloudFormation states it.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({
        notificationConfiguration: {
          LambdaConfigurations: [
            {
              Event: "s3:ObjectRemoved:Delete",
              Function: { "Fn::GetAtt": ["Handler", "Arn"] },
            },
          ],
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Bucket is configured as an SDK caller naming an Events list
    // of one would have configured it.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = output.LambdaFunctionConfigurations ?? [];

    assertArrayLength(configurations, 1);
    assertArrayLength(configurations[0].Events ?? [], 1);
    assertIdentical(configurations[0].Events?.[0], "s3:ObjectRemoved:Delete");
    assertIdentical(
      configurations[0].LambdaFunctionArn,
      `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:thumbnailer`,
    );

    // And S3 generates the configuration id the template cannot state.
    assertNonNullable(configurations[0].Id);
  });

  it("applies a Filter S3Key Rules prefix rule", async () => {
    // Given a template filtering on an Object key prefix, spelled the way
    // CloudFormation spells it rather than the way the SDK does.
    const simAws = new SimAws();
    const received: S3EventDocument[] = [];

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({
        notificationConfiguration: {
          LambdaConfigurations: [
            {
              Event: "s3:ObjectCreated:*",
              Function: { "Fn::GetAtt": ["Handler", "Arn"] },
              Filter: {
                S3Key: { Rules: [{ Name: "prefix", Value: "raw/" }] },
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

    // Then the filter is stored in the shape the SDK reads it back in.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const rules =
      output.LambdaFunctionConfigurations?.[0]?.Filter?.Key?.FilterRules ?? [];

    assertArrayLength(rules, 1);
    assertIdentical(rules[0].Name, "prefix");
    assertIdentical(rules[0].Value, "raw/");

    // And only the Objects the prefix matches reach the function.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "thumbs/cat.jpg",
        Body: "thumbnail",
      }),
    );
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "raw/cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].s3.object.key, "raw/cat.jpg");
  });

  it("notifies a queue a QueueConfigurations entry names", async () => {
    // Given a queue admitting the Bucket the template deploys.
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:uploads`;
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "uploads" }));
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: { Service: "s3.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queueArn,
              Condition: {
                ArnLike: { "aws:SourceArn": "arn:aws:s3:::uploads" },
              },
            },
          }),
        },
      }),
    );

    // When a template naming it under CloudFormation's own property names is
    // deployed: `Queue` rather than `QueueArn`, and one `Event` rather than an
    // `Events` list.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({
        notificationConfiguration: {
          QueueConfigurations: [
            { Event: "s3:ObjectCreated:*", Queue: queueArn },
          ],
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then an Object put into the deployed Bucket reaches the queue.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat picture",
      }),
    );
    await simAws.backgroundTasksComplete();

    const received = await simAws
      .sqs()
      .receiveMessage(
        new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
      );
    assertArrayLength(received.Messages ?? [], 1);

    // And the Bucket reports it back in the SDK's names.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = output.QueueConfigurations ?? [];
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].QueueArn, queueArn);
    assertIdentical(configurations[0].Events?.[0], "s3:ObjectCreated:*");
  });

  it("notifies a topic a TopicConfigurations entry names", async () => {
    // Given a topic admitting the Bucket the template deploys, with a queue
    // subscribed to it.
    const simAws = new SimAws();
    const topicArn = await simS3NotificationTopic(simAws, {
      sourceArn: "arn:aws:s3:::uploads",
    });
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "uploads-queue",
      topicArn,
    );

    // When a template naming it under CloudFormation's own property names is
    // deployed: `Topic` rather than `TopicArn`, and one `Event` rather than an
    // `Events` list.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({
        notificationConfiguration: {
          TopicConfigurations: [
            { Event: "s3:ObjectCreated:*", Topic: topicArn },
          ],
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then an Object put into the deployed Bucket reaches the queue two hops
    // away.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "cat.jpg",
        Body: "cat picture",
      }),
    );

    assertNonNullable(await simSnsDeliveredMessage(simAws, queueUrl));

    // And the Bucket reports it back in the SDK's names.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );
    const configurations = output.TopicConfigurations ?? [];
    assertArrayLength(configurations, 1);
    assertIdentical(configurations[0].TopicArn, topicArn);
    assertIdentical(configurations[0].Events?.[0], "s3:ObjectCreated:*");
  });

  it("leaves a Bucket declaring no notifications unconfigured", async () => {
    // Given a template declaring a Bucket without a NotificationConfiguration.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: {
        Resources: {
          Bucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "uploads" },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the Bucket carries no notification configuration.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );

    assertArrayEmpty(output.LambdaFunctionConfigurations ?? []);
  });
});
