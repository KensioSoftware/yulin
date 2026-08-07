import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import {
  simCfnHttpApiRouteLogicalId,
  simCfnHttpApiTemplateFactory,
} from "./sim-cfn-http-api-template.factory.js";

describe("HTTP API CloudFormation Resource teardown", () => {
  it("deletes an API after the routes, integration and stage on it", async () => {
    // Given a deployed HTTP API in front of a Lambda function, which is the
    // six-Resource shape CDK synthesises.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
      }),
    });
    await stack.waitForDeployComplete();

    const api = stack.resources.get("Api")?.simResource as
      | SimHttpApi
      | undefined;
    assertNonNullable(api);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the API is gone. Deleting an integration a route still targets is
    // refused, so this only completes in the order the teardown chose.
    assertUndefined(simAws.apiGatewayV2().findApi(api.apiId));

    for (const logicalId of [
      simCfnHttpApiRouteLogicalId(0),
      "Integration",
      "Stage",
      "Api",
    ]) {
      assertIdentical(
        stack.resources.get(logicalId)?.status,
        "DELETE_COMPLETE",
        `${logicalId} status`,
      );
    }
  });

  it("deletes the function, its permission and its Role with the API", async () => {
    // Given the same Stack, whose Lambda half is a function, the permission
    // API Gateway invokes it under, and the execution Role.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "handler-stack",
      template: simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
      }),
    });
    await stack.waitForDeployComplete();

    assertNonNullable(simAws.lambda().getSimFunctionByName("orders"));

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the function and the Role it ran as are both gone.
    assertUndefined(simAws.lambda().getSimFunctionByName("orders"));
    assertUndefined(simAws.iam().roles.get("orders-role" as never));
    assertIdentical(
      stack.resources.get("HandlerPermission")?.status,
      "DELETE_COMPLETE",
    );
  });
});
