import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertObjectEquals,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { assertDefined } from "../../util/type-guard/defined.js";
import { terraformPlanResourceFactory } from "../../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../../test/terraform/plan/terraform-mapping-context.js";
import { dynamodbTable } from "./sim-tf-map-dynamodb.js";
import { s3BucketFolds } from "./sim-tf-map-s3-folds.js";
import { sqsQueue } from "./sim-tf-map-sqs.js";
import { snsTopic } from "./sim-tf-map-sns.js";

/** The properties one `aws_s3_bucket_*` fold contributes to its bucket. */
function foldedProperties(
  type: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fold = s3BucketFolds.get(type);

  assertDefined(fold, `An S3 bucket fold for ${type}`);

  return fold.properties(
    contextFor({
      resources: [
        terraformPlanResourceFactory.make({ type, name: "uploads", values }),
      ],
    }),
  );
}

describe("mapping a DynamoDB table", () => {
  it("rebuilds the key schema from the key attribute names", () => {
    // Given a table with a hash key and a range key
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: { name: "orders", hash_key: "pk", range_key: "sk" },
        }),
      ],
    });

    // When it is mapped
    // Then CloudFormation's key schema is built out of the two names, which
    // Terraform carries as attributes rather than as a schema
    assertObjectEquals(dynamodbTable(context).Properties["KeySchema"], [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ]);
  });

  it("leaves a secondary index with no range key without one", () => {
    // Given an index whose range key was never declared. An optional string
    // inside a nested block arrives as an empty string rather than as null,
    // which is how a top-level one arrives
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: {
            name: "orders",
            hash_key: "pk",
            global_secondary_index: [
              {
                name: "gsi1",
                hash_key: "gsi1pk",
                range_key: "",
                projection_type: "ALL",
                non_key_attributes: [],
              },
            ],
          },
        }),
      ],
    });

    // When it is mapped
    // Then the index declares a hash key alone, rather than a nameless RANGE
    // element built out of the empty string
    assertObjectEquals(
      dynamodbTable(context).Properties["GlobalSecondaryIndexes"],
      [
        {
          IndexName: "gsi1",
          KeySchema: [{ AttributeName: "gsi1pk", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    );
  });

  it("carries a secondary index's range key and projected attributes", () => {
    // Given an index with a range key and a projection naming attributes
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: {
            name: "orders",
            hash_key: "pk",
            global_secondary_index: [
              {
                name: "gsi1",
                hash_key: "gsi1pk",
                range_key: "gsi1sk",
                projection_type: "INCLUDE",
                non_key_attributes: ["status"],
              },
            ],
          },
        }),
      ],
    });

    // When it is mapped
    // Then the index carries both keys and the attributes it projects
    assertObjectEquals(
      dynamodbTable(context).Properties["GlobalSecondaryIndexes"],
      [
        {
          IndexName: "gsi1",
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
          Projection: {
            ProjectionType: "INCLUDE",
            NonKeyAttributes: ["status"],
          },
        },
      ],
    );
  });

  it("carries the time to live a table expires items by", () => {
    // Given a table with a ttl block
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: {
            name: "orders",
            hash_key: "pk",
            ttl: [{ attribute_name: "expiresAt", enabled: true }],
          },
        }),
      ],
    });

    // When it is mapped
    // Then the specification CloudFormation holds is built from the block
    assertObjectEquals(
      dynamodbTable(context).Properties["TimeToLiveSpecification"],
      { AttributeName: "expiresAt", Enabled: true },
    );
  });

  it("leaves an index with no hash key without a key schema", () => {
    // Given an index whose hash key the plan could not resolve
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: {
            name: "orders",
            hash_key: "pk",
            global_secondary_index: [{ name: "gsi1", projection_type: "ALL" }],
          },
        }),
      ],
    });

    // When it is mapped
    // Then the index declares an empty key schema rather than one built out of
    // a name that is not there
    assertObjectEquals(
      dynamodbTable(context).Properties["GlobalSecondaryIndexes"],
      [
        {
          IndexName: "gsi1",
          KeySchema: [],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    );
  });

  it("declares no key schema for a table whose hash key is unknown", () => {
    // Given a table whose hash key the plan could not resolve
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_dynamodb_table",
          name: "orders",
          values: { name: "orders" },
        }),
      ],
    });

    // When it is mapped
    // Then no key schema is declared, rather than one with nothing in it
    assertUndefined(dynamodbTable(context).Properties["KeySchema"]);
    assertUndefined(
      dynamodbTable(context).Properties["GlobalSecondaryIndexes"],
    );
    assertUndefined(
      dynamodbTable(context).Properties["TimeToLiveSpecification"],
    );
  });
});

describe("mapping an SQS queue", () => {
  it("reads the redrive policy out of the JSON string it lives in", () => {
    // Given a queue whose dead-letter queue already exists, so Terraform
    // resolved the whole jsonencode string
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          values: {
            name: "orders",
            redrive_policy: JSON.stringify({
              deadLetterTargetArn: "arn:aws:sqs:us-east-1:1:orders-dlq",
              maxReceiveCount: 3,
            }),
          },
        }),
      ],
    });

    // When it is mapped
    // Then CloudFormation gets the object it carries the policy as
    const mapped = sqsQueue(context);
    assertObjectEquals(mapped.Properties["RedrivePolicy"], {
      deadLetterTargetArn: "arn:aws:sqs:us-east-1:1:orders-dlq",
      maxReceiveCount: 3,
    });
    assertArrayEquals(mapped.lost ?? [], []);
  });

  it("drops a redrive policy Terraform could not build, and says so", () => {
    // Given a queue whose dead-letter queue is created by the same plan, so
    // the whole jsonencode string is unknown and the receive limit inside it
    // went with the string
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          values: { name: "orders" },
          unknown: { redrive_policy: true },
        }),
      ],
    });

    // When it is mapped
    // Then no policy is declared and the attribute is named, rather than a
    // policy carrying a made-up limit giving the queue different retry
    // behaviour from the one the plan describes
    const mapped = sqsQueue(context);
    assertUndefined(mapped.Properties["RedrivePolicy"]);
    assertArrayEquals(mapped.lost ?? [], ["redrive_policy"]);
  });
});

describe("mapping an SNS topic", () => {
  it("carries a FIFO topic and records the tags simulated SNS refuses", () => {
    // Given a FIFO topic carrying tags
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic",
          name: "orders",
          values: {
            name: "orders.fifo",
            fifo_topic: true,
            tags: { Application: "orders" },
          },
        }),
      ],
    });

    // When it is mapped
    // Then FifoTopic is declared and the tags are recorded as lost, because
    // nothing simulated SNS models reads a topic tag and a property a service
    // refuses fails the Resource
    const mapped = snsTopic(context);
    assertTrue(mapped.Properties["FifoTopic"]);
    assertArrayEquals(mapped.lost ?? [], ["tags"]);
  });
});

describe("folding the resources that configure an S3 bucket", () => {
  it("suspends versioning a configuration turned off", () => {
    // Given a versioning resource set to anything but Enabled
    // When it is folded into its bucket
    // Then CloudFormation's two-value property reads as suspended
    assertObjectEquals(
      foldedProperties("aws_s3_bucket_versioning", {
        versioning_configuration: [{ status: "Disabled" }],
      }),
      { VersioningConfiguration: { Status: "Suspended" } },
    );
  });

  it("contributes nothing for a versioning resource with no configuration", () => {
    // Given a versioning resource whose block the plan did not resolve
    // When it is folded
    // Then nothing is contributed, rather than a versioning state invented for
    // the bucket
    assertObjectEquals(foldedProperties("aws_s3_bucket_versioning", {}), {});
  });

  it("builds the encryption rules a bucket applies by default", () => {
    // Given a rule naming an algorithm and a key
    // When it is folded
    // Then CloudFormation's nested encryption structure is rebuilt from it
    assertObjectEquals(
      foldedProperties("aws_s3_bucket_server_side_encryption_configuration", {
        rule: [
          {
            apply_server_side_encryption_by_default: [
              { sse_algorithm: "aws:kms", kms_master_key_id: "key-1" },
            ],
          },
        ],
      }),
      {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: "aws:kms",
                KMSMasterKeyID: "key-1",
              },
            },
          ],
        },
      },
    );
  });

  it("leaves an encryption rule that configures nothing empty", () => {
    // Given a rule carrying no default encryption block
    // When it is folded
    // Then the rule is empty rather than read off something that is not there
    assertObjectEquals(
      foldedProperties("aws_s3_bucket_server_side_encryption_configuration", {
        rule: [{}],
      }),
      { BucketEncryption: { ServerSideEncryptionConfiguration: [{}] } },
    );
  });

  it("builds the CORS rules a bucket answers browser requests under", () => {
    // Given one CORS rule
    // When it is folded
    // Then it is carried as CloudFormation names each part of it
    assertObjectEquals(
      foldedProperties("aws_s3_bucket_cors_configuration", {
        cors_rule: [
          {
            allowed_methods: ["GET"],
            allowed_origins: ["https://example.com"],
            max_age_seconds: 3000,
          },
        ],
      }),
      {
        CorsConfiguration: {
          CorsRules: [
            {
              AllowedMethods: ["GET"],
              AllowedOrigins: ["https://example.com"],
              MaxAge: 3000,
            },
          ],
        },
      },
    );
  });
});
