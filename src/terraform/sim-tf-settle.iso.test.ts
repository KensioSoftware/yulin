import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertIdentical,
  assertMapSize,
  assertUndefined,
} from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanResourceFactory,
  type TerraformPlanFixture,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";
import {
  settledTerraformPlan,
  type TerraformSettledPlan,
} from "./sim-tf-settle.js";
import { TerraformPlanOverrides } from "./sim-tf-overrides.js";

/** What one plan fixture settles to. */
function settled(fixture: Partial<TerraformPlanFixture>): TerraformSettledPlan {
  const plan = terraformPlanFactory.make(fixture);

  return settledTerraformPlan(
    plan,
    terraformPlanResources(plan),
    new TerraformPlanOverrides(),
  );
}

describe("settling which resources of a plan become Resources", () => {
  it("declares the resources this import has a mapping for", () => {
    // Given a plan holding a queue
    const plan = settled({
      resources: [terraformPlanResourceFactory.make({})],
    });

    // When it settles
    // Then the queue is one the template will declare
    assertArrayEquals(
      plan.declared.map((entry) => entry.resource.address),
      ["aws_sqs_queue.orders"],
    );
  });

  it("refuses a resource type with no mapping, and says so", () => {
    // Given a plan holding a resource type this import does not map
    const plan = settled({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_route53_zone",
          name: "public",
        }),
      ],
    });

    // When it settles
    // Then it is refused rather than fatal, and named with the reason
    assertArrayEquals(plan.declared, []);
    assertIdentical(
      plan.refused.get("aws_route53_zone.public"),
      "no mapping for resource type",
    );
  });

  it("refuses a resource from another provider", () => {
    // Given a plan holding a resource the AWS provider does not own
    const plan = settled({
      resources: [
        terraformPlanResourceFactory.make({
          type: "random_password",
          name: "database",
          provider: "hashicorp/random",
        }),
      ],
    });

    // When it settles
    // Then it is stepped over as a resource of another provider, which is a
    // different gap from a type this import has yet to map
    assertIdentical(
      plan.refused.get("random_password.database"),
      "not an AWS provider resource",
    );
  });

  it("leaves a folding resource for the fold pass to account for", () => {
    // Given a bucket and the versioning resource that configures it
    const plan = settled({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket",
          name: "uploads",
        }),
        terraformPlanResourceFactory.make({
          type: "aws_s3_bucket_versioning",
          name: "uploads",
        }),
      ],
    });

    // When it settles
    // Then the versioning resource is neither declared nor refused, since
    // whether it reached its bucket is the fold pass's to say
    assertArrayEquals(
      plan.declared.map((entry) => entry.resource.type),
      ["aws_s3_bucket"],
    );
    assertMapSize(plan.refused, 0);
  });

  it("refuses a resource whose value the target service will not take", () => {
    // Given a SecureString parameter. Terraform stores one through Parameter
    // Store's own encryption, and CloudFormation refuses the type because the
    // plaintext value would sit in the template
    const plan = settled({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_ssm_parameter",
          name: "db_password",
          values: {
            name: "/orders/db-password",
            type: "SecureString",
            value: "hunter2",
          },
        }),
      ],
    });

    // When it settles
    // Then it is refused for the value rather than for a value that is
    // missing, and the rest of the plan still deploys
    assertArrayEquals(plan.declared, []);
    assertIdentical(
      plan.refused.get("aws_ssm_parameter.db_password"),
      "a property value the service refuses",
    );
  });

  it("declares a parameter of a type the service does take", () => {
    // Given a plain String parameter
    const plan = settled({
      resources: [
        terraformPlanResourceFactory.make({
          type: "aws_ssm_parameter",
          name: "api_url",
          values: {
            name: "/orders/api-url",
            type: "String",
            value: "https://api.example.com",
          },
        }),
      ],
    });

    // When it settles
    // Then it is one the template will declare
    assertArrayEquals(
      plan.declared.map((entry) => entry.resource.type),
      ["aws_ssm_parameter"],
    );
  });

  it("refuses a resource whose required value the plan never resolved", () => {
    // Given an integration whose URI reads a function the plan does not
    // create, so nothing in the plan resolves it
    const plan = settled({ resources: [httpApi(), integration()] });

    // When it settles
    // Then it is refused, rather than deployed into the failure a simulated
    // service would answer a missing IntegrationUri with
    assertArrayEquals(
      plan.declared.map((entry) => entry.resource.type),
      ["aws_apigatewayv2_api"],
    );
    assertIdentical(
      plan.refused.get("aws_apigatewayv2_integration.processor"),
      "unresolved required attribute",
    );
  });

  it("refuses a resource left reading one that was refused", () => {
    // Given a route whose target is that same integration. Its reference
    // resolves while the integration is still a candidate, and stops
    // resolving once the integration is refused
    const plan = settled({ resources: [httpApi(), integration(), route()] });

    // When it settles
    // Then the route goes too, and says which of the two it is. Its target
    // resolved while the integration was still a candidate, so it lost the
    // resource it was reading rather than never having had one
    assertArrayEquals(
      plan.declared.map((entry) => entry.resource.type),
      ["aws_apigatewayv2_api"],
    );
    assertIdentical(
      plan.refused.get("aws_apigatewayv2_route.post_orders"),
      "references a resource that was skipped",
    );
  });

  it("resolves references against the settled set and no wider", () => {
    // Given the same plan
    const plan = settled({ resources: [httpApi(), integration(), route()] });

    // When a reference to the refused integration is resolved
    // Then nothing comes back, so no property can be built naming a logical ID
    // the template will not declare
    assertUndefined(
      plan.resolver.targetAddress(
        "aws_apigatewayv2_integration.processor.id",
        [],
      ),
    );
  });
});

/** The API both the integration and the route belong to. */
function httpApi(): ReturnType<typeof terraformPlanResourceFactory.make> {
  return terraformPlanResourceFactory.make({
    type: "aws_apigatewayv2_api",
    name: "http",
    values: { name: "orders-api", protocol_type: "HTTP" },
  });
}

/** An integration whose URI names a function outside the plan. */
function integration(): ReturnType<typeof terraformPlanResourceFactory.make> {
  return terraformPlanResourceFactory.make({
    type: "aws_apigatewayv2_integration",
    name: "processor",
    values: { integration_type: "AWS_PROXY" },
    unknown: { api_id: true, integration_uri: true },
    references: {
      api_id: ["aws_apigatewayv2_api.http.id", "aws_apigatewayv2_api.http"],
      integration_uri: ["data.aws_lambda_function.existing.invoke_arn"],
    },
  });
}

/** A route targeting that integration. */
function route(): ReturnType<typeof terraformPlanResourceFactory.make> {
  return terraformPlanResourceFactory.make({
    type: "aws_apigatewayv2_route",
    name: "post_orders",
    values: { route_key: "POST /orders" },
    unknown: { api_id: true, target: true },
    references: {
      api_id: ["aws_apigatewayv2_api.http.id", "aws_apigatewayv2_api.http"],
      target: [
        "aws_apigatewayv2_integration.processor.id",
        "aws_apigatewayv2_integration.processor",
      ],
    },
  });
}
