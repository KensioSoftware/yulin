import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { assertDefined } from "../util/type-guard/defined.js";
import { terraformPlanResourceFactory } from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../test/terraform/plan/terraform-mapping-context.js";
import { iamRoleFolds } from "./map/sim-tf-map-iam.js";
import { lambdaFunction } from "./map/sim-tf-map-lambda.js";
import type { TerraformMappingContext } from "./sim-tf-attributes.js";
import type { TerraformPlanOverride } from "./sim-tf-override.type.js";

/**
 * A function of a plan, mapped with what the deployment supplied.
 *
 * The values a test gives are the ones it cares about, and the unknown record
 * is how Terraform marks what it could not resolve.
 */
function processor(
  values: Record<string, unknown>,
  unknown: Record<string, unknown>,
  overrides: readonly TerraformPlanOverride[],
): TerraformMappingContext {
  return contextFor(
    {
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_lambda_function",
          name: "processor",
          values: {
            function_name: "orders-processor",
            role: "arn:aws:iam::1:role/orders",
            ...values,
          },
          unknown,
        }),
      ],
    },
    overrides,
  );
}

/**
 * An inline policy of a plan, with the role it is attached to.
 *
 * The `role` attribute holds a reference rather than a name, the way it does
 * in a plan that creates the role, so the role's own name is what an override
 * has to be matched on.
 */
function inlinePolicy(
  values: Record<string, unknown>,
  overrides: readonly TerraformPlanOverride[],
): TerraformMappingContext {
  return contextFor(
    {
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_iam_role_policy",
          name: "processor",
          values,
          unknown: { policy: true, role: true },
          references: {
            role: ["aws_iam_role.processor.id", "aws_iam_role.processor"],
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_iam_role",
          name: "processor",
          values: { name: "orders-processor" },
        }),
      ],
    },
    overrides,
  );
}

const readsTheQueue = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "sqs:ReceiveMessage",
      Resource: "arn:aws:sqs:eu-west-1:1:orders-processing",
    },
  ],
} as const;

describe("supplying the environment variables a plan could not carry", () => {
  it("carries the variables supplied for the function the plan names", () => {
    // Given a function whose variables map holds a reference to a queue of
    // the same plan, which Terraform marks unknown in its entirety, and a
    // deployment supplying the map against the function's own name
    const context = processor({}, { environment: [{ variables: true }] }, [
      {
        functionName: "orders-processor",
        environment: { QUEUE_URL: "http://sqs.test/orders", STAGE: "test" },
      },
    ]);

    // When the function is mapped
    const mapped = lambdaFunction(context);

    // Then the function runs with what was supplied, and only the code is
    // still recorded as lost
    assertObjectEquals(mapped.Properties["Environment"], {
      Variables: { QUEUE_URL: "http://sqs.test/orders", STAGE: "test" },
    });
    assertArrayEquals(mapped.lost ?? [], ["code"]);
  });

  it("leaves the variables the plan resolved alone", () => {
    // Given a function whose variables the plan resolved, and a deployment
    // supplying a different value for one of them
    const context = processor(
      { environment: [{ variables: { STAGE: "production" } }] },
      {},
      [{ functionName: "orders-processor", environment: { STAGE: "test" } }],
    );

    // When the function is mapped
    // Then the plan wins, because an override fills a gap rather than
    // replacing what the configuration says
    assertObjectEquals(lambdaFunction(context).Properties["Environment"], {
      Variables: { STAGE: "production" },
    });
  });

  it("records the variables no override covered", () => {
    // Given a function whose variables map collapsed, and a deployment
    // supplying an environment for a different function
    const context = processor({}, { environment: [{ variables: true }] }, [
      { functionName: "orders-reporter", environment: { STAGE: "test" } },
    ]);

    // When the function is mapped
    const mapped = lambdaFunction(context);

    // Then the gap is still there and the report still names it
    assertUndefined(mapped.Properties["Environment"]);
    assertArrayEquals(mapped.lost ?? [], ["code", "environment.variables"]);
  });
});

describe("supplying the inline role policy a plan could not carry", () => {
  it("carries the policy supplied for the role the plan names", () => {
    // Given an inline policy built with jsonencode around an ARN of the same
    // plan, and a deployment supplying the document against the role's name
    const fold = iamRoleFolds.get("aws_iam_role_policy");
    const context = inlinePolicy({ name: "reads" }, [
      { roleName: "orders-processor", policy: readsTheQueue },
    ]);

    assertDefined(fold, "The aws_iam_role_policy fold");

    // When it is folded into its role
    // Then simulated IAM has the statements the configuration meant, rather
    // than a role that allows everything, and nothing is recorded as lost
    assertObjectEquals(fold.properties(context), {
      Policies: [{ PolicyName: "reads", PolicyDocument: readsTheQueue }],
    });
    assertArrayEquals(fold.lost?.(context) ?? [], []);
  });

  it("allows everything for a role no override covered", () => {
    // Given a collapsed inline policy, and a deployment supplying a document
    // for a different role
    const fold = iamRoleFolds.get("aws_iam_role_policy");
    const context = inlinePolicy({ name: "reads" }, [
      { roleName: "orders-reporter", policy: readsTheQueue },
    ]);

    assertDefined(fold, "The aws_iam_role_policy fold");

    // When it is folded
    // Then the role is created permissive and the attribute is recorded, so a
    // deployment that would otherwise be useful still goes ahead
    assertObjectEquals(fold.properties(context), {
      Policies: [
        {
          PolicyName: "reads",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
          },
        },
      ],
    });
    assertArrayEquals(fold.lost?.(context) ?? [], ["policy"]);
  });

  it("leaves the policy the plan resolved alone", () => {
    // Given an inline policy Terraform rendered in full, and a deployment
    // supplying a document for the same role
    const fold = iamRoleFolds.get("aws_iam_role_policy");
    const resolved = {
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
    };
    const context = inlinePolicy(
      { name: "reads", policy: JSON.stringify(resolved) },
      [{ roleName: "orders-processor", policy: readsTheQueue }],
    );

    assertDefined(fold, "The aws_iam_role_policy fold");

    // When it is folded
    // Then the document the plan carried is the one the role gets
    assertObjectEquals(fold.properties(context), {
      Policies: [{ PolicyName: "reads", PolicyDocument: resolved }],
    });
  });
});
