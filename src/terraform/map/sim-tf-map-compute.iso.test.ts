import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { assertDefined } from "../../util/type-guard/defined.js";
import { terraformPlanResourceFactory } from "../../../test/terraform/plan/terraform-plan.factory.js";
import { terraformMappingContext as contextFor } from "../../../test/terraform/plan/terraform-mapping-context.js";
import { iamRole, iamRoleFolds } from "./sim-tf-map-iam.js";
import { lambdaFunction } from "./sim-tf-map-lambda.js";
import { logGroup } from "./sim-tf-map-logs.js";
import { httpApi } from "./sim-tf-map-http-api.js";
import { httpApiRoute } from "./sim-tf-map-http-api-routes.js";
import type { TerraformMappingContext } from "../sim-tf-attributes.js";

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

/** One IAM fold applied to the resource a fixture describes. */
function foldedRole(
  type: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fold = iamRoleFolds.get(type);

  assertDefined(fold, `An IAM fold for ${type}`);

  return fold.properties(roleContext(type, values));
}

function roleContext(
  type: string,
  values: Record<string, unknown>,
): TerraformMappingContext {
  return contextFor({
    resources: [
      terraformPlanResourceFactory.make({ type, name: "processor", values }),
    ],
  });
}

describe("mapping an IAM role", () => {
  it("carries the assume role policy as the document CloudFormation holds", () => {
    // Given a role whose assume policy Terraform rendered to a JSON string
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_iam_role",
          name: "processor",
          values: {
            name: "orders-processor",
            assume_role_policy: assumeRolePolicy,
          },
        }),
      ],
    });

    // When it is mapped
    // Then the string is parsed, because CloudFormation carries the document
    // as an object where Terraform carries it as text
    const mapped = iamRole(context);
    assertObjectEquals(
      mapped.Properties["AssumeRolePolicyDocument"],
      JSON.parse(assumeRolePolicy),
    );
    assertArrayEquals(mapped.lost ?? [], []);
  });

  it("records an assume role policy the plan could not build", () => {
    // Given a role whose assume policy names something created by the same
    // plan, so the whole jsonencode string is unknown
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_iam_role",
          name: "processor",
          values: { name: "orders-processor" },
          unknown: { assume_role_policy: true },
        }),
      ],
    });

    // When it is mapped
    // Then the attribute is named rather than a document being guessed at
    assertArrayEquals(iamRole(context).lost ?? [], ["assume_role_policy"]);
  });
});

describe("folding the policies attached to an IAM role", () => {
  it("carries an inline policy the plan resolved", () => {
    // Given an inline policy naming resources that already exist
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
    });

    // When it is folded into its role
    // Then the role carries it under the name the configuration gave it
    assertObjectEquals(
      foldedRole("aws_iam_role_policy", { name: "reads", policy }),
      {
        Policies: [{ PolicyName: "reads", PolicyDocument: JSON.parse(policy) }],
      },
    );
  });

  it("names an unnamed inline policy", () => {
    // Given an inline policy Terraform let go unnamed
    const policy = JSON.stringify({ Version: "2012-10-17", Statement: [] });

    // When it is folded
    // Then it still has a name, because CloudFormation needs one
    assertObjectEquals(foldedRole("aws_iam_role_policy", { policy }), {
      Policies: [{ PolicyName: "inline", PolicyDocument: JSON.parse(policy) }],
    });
  });

  it("allows everything for a policy the plan collapsed, and says so", () => {
    // Given an inline policy built with jsonencode around an ARN of the same
    // plan, which leaves the whole document unknown and its statements with it
    const fold = iamRoleFolds.get("aws_iam_role_policy");
    const context = roleContext("aws_iam_role_policy", {});

    // When it is folded
    const folded = fold?.properties(context);

    // Then the role is created permissive and the attribute is recorded.
    // Simulated IAM evaluates authorization, so a role that denied what the
    // configuration allowed would fail the resources using it
    assertObjectEquals(folded, {
      Policies: [
        {
          PolicyName: "inline",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
          },
        },
      ],
    });
    assertArrayEquals(fold?.lost?.(context) ?? [], ["policy"]);
  });

  it("carries a managed policy the role was given", () => {
    // Given an attachment naming an AWS managed policy
    // When it is folded
    // Then the role carries the ARN
    assertObjectEquals(
      foldedRole("aws_iam_role_policy_attachment", {
        policy_arn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
      }),
      { ManagedPolicyArns: ["arn:aws:iam::aws:policy/ReadOnlyAccess"] },
    );
  });

  it("contributes nothing for an attachment whose policy did not resolve", () => {
    // Given an attachment whose policy ARN the plan could not resolve
    // When it is folded
    // Then nothing is contributed, rather than an ARN of undefined
    assertObjectEquals(foldedRole("aws_iam_role_policy_attachment", {}), {});
  });
});

describe("mapping a CloudWatch log group", () => {
  it("declares no retention for a group Terraform keeps forever", () => {
    // Given a group whose retention is zero, which is how Terraform spells
    // never expire
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_log_group",
          name: "processor",
          values: { name: "/aws/lambda/orders", retention_in_days: 0 },
        }),
      ],
    });

    // When it is mapped
    // Then no retention is declared, since CloudFormation refuses a zero
    assertUndefined(logGroup(context).Properties["RetentionInDays"]);
  });

  it("carries a retention a group was configured with", () => {
    // Given a group that keeps its logs for a fortnight
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_cloudwatch_log_group",
          name: "processor",
          values: { name: "/aws/lambda/orders", retention_in_days: 14 },
        }),
      ],
    });

    // When it is mapped
    // Then it is carried across
    assertIdentical(logGroup(context).Properties["RetentionInDays"], 14);
  });
});

describe("mapping a Lambda function", () => {
  it("carries the environment variables the plan resolved", () => {
    // Given a function whose variables are all constants
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_lambda_function",
          name: "processor",
          values: {
            function_name: "orders-processor",
            role: "arn:aws:iam::1:role/orders",
            environment: [{ variables: { STAGE: "test" } }],
          },
        }),
      ],
    });

    // When it is mapped
    // Then the variables are carried, and only the code is recorded as lost
    const mapped = lambdaFunction(context);
    assertObjectEquals(mapped.Properties["Environment"], {
      Variables: { STAGE: "test" },
    });
    assertArrayEquals(mapped.lost ?? [], ["code"]);
  });

  it("records the variable names an unknown value took with it", () => {
    // Given a function whose variables map holds a reference to a queue the
    // same plan creates. Terraform marks the whole map unknown, and the
    // variable names go with it
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_lambda_function",
          name: "processor",
          values: {
            function_name: "orders-processor",
            role: "arn:aws:iam::1:role/orders",
          },
          unknown: { environment: [{ variables: true }] },
        }),
      ],
    });

    // When it is mapped
    // Then the map is named as lost, because the names are not recoverable
    // from a value Terraform never built
    assertArrayEquals(lambdaFunction(context).lost ?? [], [
      "code",
      "environment.variables",
    ]);
  });
});

describe("mapping an HTTP API", () => {
  it("carries the CORS configuration an API answers under", () => {
    // Given an API with a CORS block
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_api",
          name: "http",
          values: {
            name: "orders-api",
            protocol_type: "HTTP",
            cors_configuration: [
              {
                allow_origins: ["https://example.com"],
                allow_methods: ["GET"],
              },
            ],
          },
        }),
      ],
    });

    // When it is mapped
    // Then only the parts configured are carried
    assertObjectEquals(httpApi(context).Properties["CorsConfiguration"], {
      AllowOrigins: ["https://example.com"],
      AllowMethods: ["GET"],
    });
  });

  it("declares no CORS for an API configured without it", () => {
    // Given an API with no CORS block
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_api",
          name: "http",
          values: { name: "orders-api", protocol_type: "HTTP" },
        }),
      ],
    });

    // When it is mapped
    // Then nothing is declared, rather than an empty configuration
    assertUndefined(httpApi(context).Properties["CorsConfiguration"]);
  });

  it("keeps a route target Terraform had already written in full", () => {
    // Given a route whose integration already exists, so Terraform resolved
    // the whole `integrations/<id>` string itself
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_route",
          name: "post_orders",
          values: {
            route_key: "POST /orders",
            target: "integrations/abc123",
          },
        }),
      ],
    });

    // When it is mapped
    // Then the string is carried as it is, rather than built again around it
    assertIdentical(
      httpApiRoute(context).Properties["Target"],
      "integrations/abc123",
    );
  });

  it("builds a route target around the integration a reference names", () => {
    // Given a route whose target is unknown because the integration's ID does
    // not exist until the integration does
    const context = contextFor({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_route",
          name: "post_orders",
          values: { route_key: "POST /orders" },
          unknown: { target: true },
          references: {
            target: [
              "aws_apigatewayv2_integration.processor.id",
              "aws_apigatewayv2_integration.processor",
            ],
          },
        }),
        terraformPlanResourceFactory.make({
          type: "aws_apigatewayv2_integration",
          name: "processor",
        }),
      ],
    });

    // When it is mapped
    // Then the prefix Terraform wrote itself is put back around the reference,
    // since a reference on its own is the ID without it
    assertObjectEquals(httpApiRoute(context).Properties["Target"], {
      "Fn::Join": [
        "",
        ["integrations/", { Ref: "AwsApigatewayv2IntegrationProcessor" }],
      ],
    });
  });
});
