import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertObjectHasProperty,
} from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanModuleFactory,
  terraformPlanResourceFactory,
  type TerraformPlanFixture,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import { cfnTemplateFromTerraformPlan } from "./sim-tf-import.js";
import type { TerraformImportResult } from "./sim-tf-import.js";

/** The template and report one plan fixture imports as. */
function imported(
  fixture: Partial<TerraformPlanFixture>,
): TerraformImportResult {
  return cfnTemplateFromTerraformPlan(terraformPlanFactory.make(fixture));
}

/** The execution role a function is refused without. */
const executionRole = (): ReturnType<
  typeof terraformPlanResourceFactory.make
> =>
  terraformPlanResourceFactory.make({
    type: "aws_iam_role",
    name: "processor",
    values: {
      name: "orders-processor",
      assume_role_policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    },
  });

/** A function, whose role ARN does not exist until the role does. */
const processor = (): ReturnType<typeof terraformPlanResourceFactory.make> =>
  terraformPlanResourceFactory.make({
    type: "aws_lambda_function",
    name: "processor",
    values: {
      function_name: "orders-processor",
      handler: "index.handler",
      runtime: "nodejs20.x",
    },
    unknown: { role: true },
    references: {
      role: ["aws_iam_role.processor.arn", "aws_iam_role.processor"],
    },
  });

const invokePermission = (): ReturnType<
  typeof terraformPlanResourceFactory.make
> =>
  terraformPlanResourceFactory.make({
    type: "aws_lambda_permission",
    name: "allow_bucket",
    values: {
      function_name: "orders-processor",
      action: "lambda:InvokeFunction",
      principal: "s3.amazonaws.com",
    },
    references: {
      function_name: [
        "aws_lambda_function.processor.function_name",
        "aws_lambda_function.processor",
      ],
    },
  });

describe("importing a Terraform plan as a CloudFormation template", () => {
  it("declares a Resource for each resource it has a mapping for", () => {
    // Given a plan holding a queue
    const { template, report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          values: { name: "orders", visibility_timeout_seconds: 60 },
        }),
      ],
    });

    // When it is imported
    // Then the template holds the Resource the queue deploys as
    assertObjectEquals(template.Resources["AwsSqsQueueOrders"], {
      Type: "AWS::SQS::Queue",
      Properties: { QueueName: "orders", VisibilityTimeout: 60 },
    });
    assertObjectEquals(report.mapped, [
      {
        address: "aws_sqs_queue.orders",
        type: "aws_sqs_queue",
        cfnType: "AWS::SQS::Queue",
        logicalId: "AwsSqsQueueOrders",
      },
    ]);
  });

  it("orders a Resource after one whose value Terraform already resolved", () => {
    // Given a permission naming a function the same plan creates. Terraform
    // resolves the name, so the property carries a plain string and the edge
    // CloudFormation would have ordered from has gone with it
    const { template } = imported({
      resources: [executionRole(), processor(), invokePermission()],
    });

    const permission = template.Resources[
      "AwsLambdaPermissionAllowBucket"
    ] as unknown as {
      Properties: Record<string, unknown>;
      DependsOn?: readonly string[];
    };

    // When the plan is imported
    // Then the property is still the resolved name, and the edge is back,
    // recovered from the reference the configuration records
    assertIdentical(permission.Properties["FunctionName"], "orders-processor");
    assertArrayEquals(permission.DependsOn ?? [], [
      "AwsLambdaFunctionProcessor",
    ]);
  });

  it("orders a Resource after one an explicit depends_on names", () => {
    // Given a function ordered after a log group by depends_on alone, with no
    // value of the function referring to it
    const { template } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_log_group",
          name: "processor",
          values: { name: "/aws/lambda/orders-processor" },
        }),
        executionRole(),
        terraformPlanResourceFactory.make({
          type: "aws_lambda_function",
          name: "processor",
          values: { function_name: "orders-processor" },
          unknown: { role: true },
          references: {
            role: ["aws_iam_role.processor.arn", "aws_iam_role.processor"],
          },
          dependsOn: ["aws_cloudwatch_log_group.processor"],
        }),
      ],
    });

    const lambda = template.Resources["AwsLambdaFunctionProcessor"] as {
      DependsOn?: readonly string[];
    };

    // When the plan is imported
    // Then the ordering the configuration asked for is carried across
    assertArrayIncludes(
      lambda.DependsOn ?? [],
      "AwsCloudwatchLogGroupProcessor",
    );
  });

  it("declares both of two addresses that fold into one logical ID", () => {
    // Given two queues whose names differ only in a separator
    const { template, report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          name: "order_events",
          values: { name: "order-events" },
        }),
        terraformPlanResourceFactory.make({
          name: "orderEvents",
          values: { name: "order-events-legacy" },
        }),
      ],
    });

    // When the plan is imported
    // Then both are in the template, one under a numbered logical ID, rather
    // than the plan being refused for a collision it can name its way out of
    assertArrayEquals(
      Object.keys(template.Resources).toSorted((a, b) => a.localeCompare(b)),
      ["AwsSqsQueueOrderEvents", "AwsSqsQueueOrderEvents2"],
    );
    assertArrayLength(report.mapped, 2);
  });

  it("accounts for every managed resource of the plan", () => {
    // Given a plan holding a mapped resource, a folded one, an unmapped one
    // and one from another provider
    const { report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket",
          name: "uploads",
          values: { bucket: "orders-uploads" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket_versioning",
          name: "uploads",
          values: { versioning_configuration: [{ status: "Enabled" }] },
          references: {
            bucket: ["aws_s3_bucket.uploads.id", "aws_s3_bucket.uploads"],
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_route53_zone",
          name: "public",
        }),
        terraformPlanResourceFactory.make({
          type: "random_password",
          name: "database",
          provider: "hashicorp/random",
        }),
      ],
    });

    // When the plan is imported
    // Then mapped, folded and skipped add up to what the plan holds, which is
    // what makes the mapped fraction a fraction of something
    assertIdentical(report.total, 4);
    assertIdentical(
      report.mapped.length + report.folded.length + report.skipped.length,
      report.total,
    );
    assertArrayEquals(
      report.skipped.map((entry) => entry.type),
      ["aws_route53_zone", "random_password"],
    );
  });

  it("resolves a reference between resources of a for_each module instance", () => {
    // Given a module called once per colour, holding a topic and the
    // subscription to it. Terraform addresses every resource under the module
    // with the instance key
    const { template } = imported({
      modules: [
        terraformPlanModuleFactory.make({
          name: "workers",
          index: "blue",
          resources: [
            terraformPlanResourceFactory.make({
              address: "aws_sns_topic.events",
              type: "aws_sns_topic",
              name: "events",
              values: { name: "worker-events" },
            }),
            terraformPlanResourceFactory.make({
              address: "aws_sns_topic_subscription.queue",
              type: "aws_sns_topic_subscription",
              name: "queue",
              values: { protocol: "sqs" },
              unknown: { topic_arn: true },
              references: {
                topic_arn: ["aws_sns_topic.events.arn", "aws_sns_topic.events"],
              },
            }),
          ],
        }),
      ],
    });

    const subscription = template.Resources[
      "ModuleWorkersBlueAwsSnsTopicSubscriptionQueue"
    ] as unknown as {
      Properties: Record<string, unknown>;
      DependsOn?: readonly string[];
    };

    // When the plan is imported
    // Then the subscription reaches its own instance's topic. A reference
    // qualified without the key names an address no resource of the plan has
    assertObjectEquals(subscription.Properties["TopicArn"], {
      Ref: "ModuleWorkersBlueAwsSnsTopicEvents",
    });
    assertArrayEquals(subscription.DependsOn ?? [], [
      "ModuleWorkersBlueAwsSnsTopicEvents",
    ]);
  });

  it("names the attribute a mapping could not carry", () => {
    // Given a function, whose code a plan points at as a zip, an S3 object or
    // a container image, and none of the three is a handler Yulin can run
    const { report } = imported({ resources: [executionRole(), processor()] });

    // When the plan is imported
    // Then the attribute is named rather than quietly dropped
    assertArrayIncludes(
      report.lost.map((entry) => entry.attribute),
      "code",
    );
  });

  it("names the required attribute a refused resource was refused for", () => {
    // Given an integration whose URI reads a function outside the plan
    const { template, report } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_api",
          name: "http",
          values: { name: "orders-api", protocol_type: "HTTP" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_integration",
          name: "processor",
          values: { integration_type: "AWS_PROXY" },
          unknown: { api_id: true, integration_uri: true },
          references: {
            api_id: [
              "aws_apigatewayv2_api.http.id",
              "aws_apigatewayv2_api.http",
            ],
            integration_uri: ["data.aws_lambda_function.existing.invoke_arn"],
          },
        }),
      ],
    });

    // When the plan is imported
    // Then the template declares the API and nothing for the integration, and
    // the report says which value it was that the plan could not carry
    assertArrayEquals(Object.keys(template.Resources), [
      "AwsApigatewayv2ApiHttp",
    ]);
    assertObjectEquals(report.lost, [
      {
        address: "aws_apigatewayv2_integration.processor",
        attribute: "IntegrationUri",
      },
    ]);
  });

  it("resolves an attribute the plan left unknown through its reference", () => {
    // Given a subscription whose topic ARN does not exist until the topic does
    const { template } = imported({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic",
          name: "order_events",
          values: { name: "order-events" },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_sns_topic_subscription",
          name: "to_queue",
          values: { protocol: "sqs" },
          unknown: { topic_arn: true },
          references: {
            topic_arn: [
              "aws_sns_topic.order_events.arn",
              "aws_sns_topic.order_events",
            ],
          },
        }),
      ],
    });

    const subscription = template.Resources[
      "AwsSnsTopicSubscriptionToQueue"
    ] as { Properties: Record<string, unknown> };

    // When the plan is imported
    // Then the property carries the intrinsic CloudFormation reads it with
    assertObjectHasProperty(subscription.Properties, "TopicArn");
    assertObjectEquals(subscription.Properties["TopicArn"], {
      Ref: "AwsSnsTopicOrderEvents",
    });
  });
});
