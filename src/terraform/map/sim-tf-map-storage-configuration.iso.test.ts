import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { assertDefined } from "../../util/type-guard/defined.js";
import { terraformPlanResourceFactory } from "../../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../../test/terraform/plan/terraform-mapping-context.js";
import type { TerraformMappingContext } from "../sim-tf-attributes.js";
import { terraformResourceFolds } from "../sim-tf-registry.js";
import { dynamodbTable } from "./sim-tf-map-dynamodb.js";
import { bucketNotification } from "./sim-tf-map-s3-notification.js";

/** One resource of a fixture, as the context a mapping is given for it. */
function resourceContext(
  type: string,
  values: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): TerraformMappingContext {
  return contextFor({
    resources: [
      terraformPlanResourceFactory.make({
        type,
        name: "uploads",
        values,
        ...overrides,
      }),
    ],
  });
}

/** The properties one registered fold contributes to its parent. */
function registeredFold(
  type: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fold = terraformResourceFolds.get(type);

  assertDefined(fold, `A fold for ${type}`);

  return fold.properties(resourceContext(type, values), {});
}

describe("mapping a provisioned DynamoDB table", () => {
  it("provisions the table and each of its indexes", () => {
    // Given a table billed by provisioned capacity, which Terraform states on
    // the table and again on each global secondary index
    const context = resourceContext("aws_dynamodb_table", {
      name: "reports",
      billing_mode: "PROVISIONED",
      hash_key: "reportId",
      read_capacity: 5,
      write_capacity: 2,
      global_secondary_index: [
        {
          name: "byGeneratedAt",
          hash_key: "generatedAt",
          range_key: "",
          projection_type: "KEYS_ONLY",
          read_capacity: 3,
          write_capacity: 1,
        },
      ],
    });
    const mapped = dynamodbTable(context);

    // When it is mapped
    // Then both carry the capacity CloudFormation holds them under, without
    // which simulated DynamoDB refuses the table
    assertObjectEquals(mapped.Properties["ProvisionedThroughput"], {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 2,
    });
    assertObjectEquals(mapped.Properties["GlobalSecondaryIndexes"], [
      {
        IndexName: "byGeneratedAt",
        KeySchema: [{ AttributeName: "generatedAt", KeyType: "HASH" }],
        Projection: { ProjectionType: "KEYS_ONLY" },
        ProvisionedThroughput: { ReadCapacityUnits: 3, WriteCapacityUnits: 1 },
      },
    ]);
  });

  it("provisions nothing on an on-demand table", () => {
    // Given an on-demand table, which the provider still writes a capacity
    // pair of zeroes on
    const context = resourceContext("aws_dynamodb_table", {
      name: "orders",
      billing_mode: "PAY_PER_REQUEST",
      hash_key: "pk",
      read_capacity: 0,
      write_capacity: 0,
    });

    // When it is mapped
    // Then no throughput is declared, since simulated DynamoDB refuses one
    // alongside PAY_PER_REQUEST the way real DynamoDB does
    assertUndefined(dynamodbTable(context).Properties["ProvisionedThroughput"]);
  });
});

describe("mapping a bucket notification", () => {
  it("resolves the function an event is delivered to", () => {
    // Given a notification naming a function of the same plan, so the ARN
    // inside the block arrived unknown
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket_notification",
          name: "uploads",
          values: {
            lambda_function: [
              {
                events: ["s3:ObjectCreated:*"],
                filter_prefix: null,
                filter_suffix: ".jpg",
              },
            ],
          },
          unknown: {
            bucket: true,
            lambda_function: [{ lambda_function_arn: true }],
          },
          references: {
            bucket: ["aws_s3_bucket.uploads.id"],
            lambda_function: [
              { lambda_function_arn: ["aws_lambda_function.processor.arn"] },
            ],
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket",
          name: "uploads",
          values: { bucket: "orders-uploads" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_lambda_function",
          name: "processor",
          values: { function_name: "orders-processor" },
        }),
      ],
    });

    // When it is mapped
    // Then the configuration names the bucket and the function by what the
    // references resolve to, and the suffix filter is in the shape the request
    // takes
    assertObjectEquals(bucketNotification(context).Properties, {
      BucketName: { Ref: "AwsS3BucketUploads" },
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          {
            LambdaFunctionArn: {
              "Fn::GetAtt": ["AwsLambdaFunctionProcessor", "Arn"],
            },
            Events: ["s3:ObjectCreated:*"],
            Filter: {
              Key: { FilterRules: [{ Name: "suffix", Value: ".jpg" }] },
            },
          },
        ],
      },
    });
  });

  it("records a destination the plan could not resolve", () => {
    // Given a notification naming a queue the template does not declare
    const context = resourceContext(
      "aws_s3_bucket_notification",
      { queue: [{ events: ["s3:ObjectCreated:*"] }] },
      {
        unknown: { bucket: true, queue: [{ queue_arn: true }] },
        references: {
          bucket: ["aws_s3_bucket.uploads.id"],
          queue: [{ queue_arn: ["aws_sqs_queue.absent.arn"] }],
        },
      },
    );
    const mapped = bucketNotification(context);

    // When it is mapped
    // Then the destination is dropped rather than declared naming nothing, and
    // the block is recorded
    assertUndefined(mapped.Properties["NotificationConfiguration"]);
    assertArrayEquals(mapped.lost ?? [], ["queue"]);
  });

  it("records the EventBridge delivery simulated S3 refuses", () => {
    // Given a bucket asking for its events on the default event bus
    const context = resourceContext(
      "aws_s3_bucket_notification",
      { eventbridge: true },
      {
        unknown: { bucket: true },
        references: { bucket: ["aws_s3_bucket.uploads.id"] },
      },
    );

    // When it is mapped
    // Then the attribute is recorded, since simulated S3 refuses an
    // EventBridgeConfiguration rather than accepting one it never delivers
    // through
    assertArrayEquals(bucketNotification(context).lost ?? [], ["eventbridge"]);
  });
});

describe("mapping a bucket lifecycle configuration", () => {
  it("builds the rules CloudFormation holds on the bucket", () => {
    // Given a rule abandoning incomplete uploads and expiring what is left,
    // where the provider wrote an empty prefix for the one the rule states none
    // When it is folded into its bucket
    // Then the rule is carried as CloudFormation names each part of it, with
    // no Prefix matching every object
    assertObjectEquals(
      registeredFold("aws_s3_bucket_lifecycle_configuration", {
        rule: [
          {
            id: "expire-incomplete",
            status: "Enabled",
            prefix: "",
            expiration: [{ days: 30 }],
            abort_incomplete_multipart_upload: [{ days_after_initiation: 7 }],
            transition: [{ storage_class: "GLACIER", days: 90 }],
          },
        ],
      }),
      {
        LifecycleConfiguration: {
          Rules: [
            {
              Id: "expire-incomplete",
              Status: "Enabled",
              ExpirationInDays: 30,
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
              Transitions: [{ StorageClass: "GLACIER", TransitionInDays: 90 }],
            },
          ],
        },
      },
    );
  });
});

describe("mapping the resources that configure a queue's redrive", () => {
  it("reads a redrive policy the plan resolved", () => {
    // Given a redrive policy naming a dead-letter queue by literal ARN
    // When it is folded into the queue it configures
    // Then it arrives as the object CloudFormation carries
    assertObjectEquals(
      registeredFold("aws_sqs_queue_redrive_policy", {
        redrive_policy: JSON.stringify({
          deadLetterTargetArn: "arn:aws:sqs:eu-west-1:1:orders-dlq",
          maxReceiveCount: 5,
        }),
      }),
      {
        RedrivePolicy: {
          deadLetterTargetArn: "arn:aws:sqs:eu-west-1:1:orders-dlq",
          maxReceiveCount: 5,
        },
      },
    );
  });

  it("carries which queues a dead-letter queue accepts", () => {
    // Given an allow policy admitting any queue
    // When it is folded
    // Then it arrives under the property CloudFormation holds it in
    assertObjectEquals(
      registeredFold("aws_sqs_queue_redrive_allow_policy", {
        redrive_allow_policy: JSON.stringify({ redrivePermission: "allowAll" }),
      }),
      { RedriveAllowPolicy: { redrivePermission: "allowAll" } },
    );
  });

  it("contributes nothing for a policy built around an ARN of the same plan", () => {
    // Given a policy written with jsonencode around a queue ARN, so the whole
    // string stayed unknown and the receive limit went with it
    const context = resourceContext(
      "aws_sqs_queue_redrive_policy",
      {},
      { unknown: { redrive_policy: true } },
    );
    const fold = terraformResourceFolds.get("aws_sqs_queue_redrive_policy");

    assertDefined(fold, "A fold for aws_sqs_queue_redrive_policy");

    // When it is folded
    // Then nothing is contributed, since a policy carrying a made-up limit
    // would give the queue different retry behaviour, and it is recorded
    assertObjectEquals(fold.properties(context, {}), {});
    assertArrayEquals(fold.lost?.(context) ?? [], ["redrive_policy"]);
  });
});
