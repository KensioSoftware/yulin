import { describe, it } from "vitest";
import { assertObjectEquals, assertUndefined } from "@kensio/smartass";
import {
  terraformPlanFactory,
  terraformPlanModuleFactory,
  terraformPlanResourceFactory,
  type TerraformPlanFixture,
} from "../../test/terraform/plan/terraform-plan.factory.js";
import { terraformResourceFactory } from "../../test/terraform/plan/terraform-resource.factory.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import { terraformPlanResources } from "./sim-tf-plan-resources.js";
import { terraformModuleOutputs } from "./sim-tf-module-outputs.js";
import { terraformModuleVariables } from "./sim-tf-module-variables.js";
import { TerraformReferenceResolver } from "./sim-tf-reference.js";

/*
 * Resolving a reference that names no address of its own.
 *
 * A reference under `each` or `var` is written somewhere else in the plan, and
 * an instance key left to `each.key` is written nowhere at all. These are the
 * hops that find the resource behind one, and the shapes where a plan holds
 * too little to say which resource that is.
 */

/** A resolver over the resources one plan fixture declares. */
function resolverFor(
  fixture: Partial<TerraformPlanFixture>,
): TerraformReferenceResolver {
  const plan = terraformPlanFactory.make(fixture);

  return new TerraformReferenceResolver(
    terraformPlanResources(plan),
    terraformModuleOutputs(plan),
    terraformModuleVariables(plan),
  );
}

/** The resource a reference is read from. */
function readingFrom(
  modulePath: readonly string[] = [],
  properties: Partial<TerraformResource> = {},
): TerraformResource {
  return terraformResourceFactory.make({ modulePath, ...properties });
}

describe("following a reference through a scope the plan resolves itself", () => {
  it("follows each.value to what the collection was built from", () => {
    // Given a module whose caller set its routes variable from a sibling
    // module's function ARN, and a resource inside it expanded by for_each
    // over that variable. Nothing in the plan resolves each.value.uri, because
    // the function has yet to exist
    const resolver = resolverFor({
      modules: [processorModule(), apiModule("processor")],
    });

    // When the integration's URI is resolved
    const resolved = resolver.resolve(
      "each.value.uri",
      readingFrom(["api"], { forEach: ["var.routes"] }),
    );

    // Then it reaches the function, through the for_each collection, the
    // module variable and the module output behind it
    assertObjectEquals(resolved, {
      "Fn::GetAtt": ["ModuleProcessorAwsLambdaFunctionThis", "Arn"],
    });
  });

  it("refuses a collection that names more than one resource", () => {
    // Given the same shape, with the routes variable set from two functions.
    // A plan records the references of a whole collection as one list, and
    // says nothing about which route holds which of them
    const resolver = resolverFor({
      modules: [
        processorModule(),
        processorModule("reporter"),
        apiModule("processor", "reporter"),
      ],
    });

    // When the integration's URI is resolved
    // Then nothing comes back. Either function is plausible and the plan does
    // not say which, and a property naming the wrong one is worse than a
    // property that is not there
    assertUndefined(
      resolver.resolve(
        "each.value.uri",
        readingFrom(["api"], { forEach: ["var.routes"] }),
      ),
    );
  });

  it("leaves each alone for a resource iterating nothing", () => {
    // Given a resource that was not expanded by for_each
    const resolver = resolverFor({
      modules: [processorModule(), apiModule("processor")],
    });

    // When a reference under each is resolved from it
    // Then nothing comes back, because there is no collection to read
    assertUndefined(resolver.resolve("each.value.uri", readingFrom(["api"])));
  });

  it("resolves nothing for a variable of the root module", () => {
    // Given a resource of the root module reading a variable. A root variable
    // was set on the command line or in a tfvars file, and no module call
    // holds what it was set from
    const resolver = resolverFor({ modules: [processorModule()] });

    // When the reference is resolved
    // Then nothing comes back
    assertUndefined(resolver.resolve("var.uri", readingFrom()));
  });

  it("stops following a variable a module sets from itself", () => {
    // Given a call setting a module's own variable from a variable of the
    // same name, which is the shape that leads nowhere new
    const resolver = resolverFor({
      modules: [
        terraformPlanModuleFactory.make({
          name: "api",
          variables: { routes: ["var.routes"] },
        }),
      ],
    });

    // When it is resolved
    // Then it stops rather than following itself forever
    assertUndefined(resolver.resolve("var.routes", readingFrom(["api"])));
  });
});

describe("resolving a reference to an instance named without its key", () => {
  it("reads the instance keyed like the resource doing the reading", () => {
    // Given two integrations expanded by for_each over a routes map, and a
    // route expanded over the same map. Terraform writes
    // `integration.this[each.key]` into a plan as a reference to the resource
    // and a separate reference to each.key, so the address names no instance
    const resolver = resolverFor({
      resources: [
        integrationInstance("POST /orders"),
        integrationInstance("GET /orders"),
      ],
    });

    // When the route resolves it from its own instance
    const resolved = resolver.resolve(
      "aws_apigatewayv2_integration.this",
      readingFrom([], { index: "GET /orders" }),
    );

    // Then it is the integration of the same key, rather than either of them
    assertObjectEquals(resolved, {
      Ref: "AwsApigatewayv2IntegrationThisGETOrders",
    });
  });

  it("reads the only instance where the reader has no key of its own", () => {
    // Given a module created with count = 1, whose one resource carries the
    // index in its address, referred to by a resource that has no index
    const resolver = resolverFor({
      resources: [integrationInstance("POST /orders")],
    });

    // When the reference is resolved
    // Then it reaches the one instance it could mean
    assertObjectEquals(
      resolver.resolve("aws_apigatewayv2_integration.this", readingFrom()),
      { Ref: "AwsApigatewayv2IntegrationThisPOSTOrders" },
    );
  });

  it("resolves nothing where more than one instance could be meant", () => {
    // Given two instances and a reader whose own key matches neither
    const resolver = resolverFor({
      resources: [
        integrationInstance("POST /orders"),
        integrationInstance("GET /orders"),
      ],
    });

    // When the reference is resolved
    // Then nothing comes back rather than whichever instance came first
    assertUndefined(
      resolver.resolve(
        "aws_apigatewayv2_integration.this",
        readingFrom([], { index: "DELETE /orders" }),
      ),
    );
  });
});

/** A Lambda module publishing its function's ARN, as the community one does. */
function processorModule(
  name = "processor",
): ReturnType<typeof terraformPlanModuleFactory.make> {
  return terraformPlanModuleFactory.make({
    name,
    resources: [
      terraformPlanResourceFactory.make({
        type: "aws_lambda_function",
        name: "this",
        address: "aws_lambda_function.this",
      }),
    ],
    outputs: { lambda_function_arn: ["aws_lambda_function.this.arn"] },
  });
}

/**
 * An API module whose caller set its routes variable, from the functions
 * named. One function is the shape a plan can answer for, and two is the shape
 * it cannot.
 */
function apiModule(
  ...functions: readonly string[]
): ReturnType<typeof terraformPlanModuleFactory.make> {
  return terraformPlanModuleFactory.make({
    name: "api",
    variables: {
      routes: functions.map((name) => `module.${name}.lambda_function_arn`),
    },
  });
}

/** One integration of a resource expanded by for_each over a routes map. */
function integrationInstance(
  key: string,
): ReturnType<typeof terraformPlanResourceFactory.make> {
  return terraformPlanResourceFactory.make({
    type: "aws_apigatewayv2_integration",
    name: "this",
    index: key,
    address: `aws_apigatewayv2_integration.this["${key}"]`,
  });
}
