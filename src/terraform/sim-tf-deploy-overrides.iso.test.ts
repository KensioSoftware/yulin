import { describe, it } from "vitest";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertArrayIncludes,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { terraformPlanResourceFactory } from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformPlanFile } from "../../test/terraform/plan/terraform-plan-file.js";
import { SimAws } from "../service/aws/sim-aws.js";
import { TerraformAdapter } from "./sim-tf-adapter.js";
import type { TerraformPlanOverride } from "./sim-tf-override.type.js";

const assumeRolePolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
});

/**
 * A plan of the shape the two lost attributes turn up in.
 *
 * The function reads a queue of the same plan into its environment and polls
 * it through an event source mapping, and the role's inline policy is built
 * with `jsonencode` around the queue's ARN. Terraform marks both unknown in
 * their entirety.
 */
async function processingPlan(): Promise<string> {
  return await terraformPlanFile({
    resources: [
      terraformPlanResourceFactory.make({
        type: "aws_iam_role",
        name: "processor",
        values: {
          name: "orders-processor",
          assume_role_policy: assumeRolePolicy,
        },
      }),
      terraformPlanResourceFactory.make({
        type: "aws_iam_role_policy",
        name: "processor",
        values: { name: "polls-the-queue" },
        unknown: { policy: true, role: true },
        references: {
          role: ["aws_iam_role.processor.id", "aws_iam_role.processor"],
        },
      }),
      terraformPlanResourceFactory.make({
        type: "aws_sqs_queue",
        name: "processing",
        values: { name: "orders-processing" },
      }),
      terraformPlanResourceFactory.make({
        type: "aws_lambda_function",
        name: "processor",
        values: {
          function_name: "orders-processor",
          handler: "index.handler",
          runtime: "nodejs20.x",
        },
        unknown: { role: true, environment: [{ variables: true }] },
        references: {
          role: ["aws_iam_role.processor.arn", "aws_iam_role.processor"],
        },
      }),
      terraformPlanResourceFactory.make({
        type: "aws_lambda_event_source_mapping",
        name: "processing",
        unknown: { event_source_arn: true, function_name: true },
        references: {
          event_source_arn: [
            "aws_sqs_queue.processing.arn",
            "aws_sqs_queue.processing",
          ],
          function_name: [
            "aws_lambda_function.processor.arn",
            "aws_lambda_function.processor",
          ],
        },
      }),
    ],
  });
}

/** A handler that answers with what its environment was built with. */
const readsItsEnvironment = (): { queueUrl: string | undefined } => ({
  queueUrl: process.env["QUEUE_URL"],
});

const pollsTheQueue: TerraformPlanOverride = {
  roleName: "orders-processor",
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: "*",
      },
    ],
  },
};

describe("deploying a plan with the values it could not carry", () => {
  it("runs the function with the environment variables it was given", async () => {
    // Given a plan whose function reads a queue URL out of its environment,
    // which Terraform marks unknown along with the variable names
    const planPath = await processingPlan();

    // When it is deployed with that environment supplied against the function
    // name the plan carries
    const simAws = new SimAws();
    const { report } = await new TerraformAdapter(simAws).deployPlan({
      planPath,
      overrides: [
        {
          functionName: "orders-processor",
          environment: { QUEUE_URL: "http://sqs.test/orders-processing" },
        },
        pollsTheQueue,
      ],
      bindings: [
        { functionName: "orders-processor", handler: readsItsEnvironment },
      ],
    });

    // Then the handler reads them the way it would on AWS, and the report no
    // longer names the map as lost
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders-processor" }));

    assertStringIncludes(
      Buffer.from(invoked.Payload ?? new Uint8Array()).toString("utf8"),
      "http://sqs.test/orders-processing",
    );
    assertArrayEquals(
      report.lost.map((entry) => entry.attribute),
      ["code"],
    );
  });

  it("gives simulated IAM the role policy it was given", async () => {
    // Given a plan whose inline role policy Terraform built with jsonencode
    // around an ARN of the same plan, so its statements are gone
    const planPath = await processingPlan();

    // When it is deployed with the policy supplied against the role's name
    const simAws = new SimAws();
    const { stack, report } = await new TerraformAdapter(simAws).deployPlan({
      planPath,
      overrides: [pollsTheQueue],
      bindings: [
        { functionName: "orders-processor", handler: readsItsEnvironment },
      ],
    });

    // Then the role holds those statements rather than a policy allowing
    // everything, and the event source mapping simulated IAM checks the role
    // against was created
    const role = simAws
      .iam()
      .roles.values()
      .find((candidate) => candidate.roleName === "orders-processor");

    assertNonNullable(role);
    assertIdentical(
      role.inlinePolicies.get("polls-the-queue"),
      JSON.stringify(pollsTheQueue.policy),
    );
    assertArrayIncludes(
      report.mapped.map((entry) => entry.type),
      "aws_lambda_event_source_mapping",
    );
    assertIdentical(stack.status, "CREATE_COMPLETE");
  });

  it("refuses a poller the supplied policy does not allow", async () => {
    // Given the same plan, and a policy supplied for the role that says
    // nothing about the queue the function is meant to poll
    const planPath = await processingPlan();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await new TerraformAdapter(new SimAws()).deployPlan({
        planPath,
        overrides: [
          {
            roleName: "orders-processor",
            policy: {
              Version: "2012-10-17",
              Statement: [
                { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
              ],
            },
          },
        ],
        bindings: [
          { functionName: "orders-processor", handler: readsItsEnvironment },
        ],
      });
    });

    // Then the event source mapping is refused the way real Lambda refuses
    // one, which is what a supplied policy being evaluated rather than
    // recorded means. The permissive default is only for the role no override
    // covered
    assertStringIncludes(
      error.message,
      "does not have permissions to call ReceiveMessage on SQS",
    );
  });
});
