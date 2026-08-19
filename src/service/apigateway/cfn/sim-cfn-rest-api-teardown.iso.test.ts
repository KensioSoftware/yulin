import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import {
  simCfnRestApiMethodLogicalId,
  simCfnRestApiResourceLogicalId,
} from "./sim-cfn-rest-api-template-ids.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

describe("REST API CloudFormation Resource teardown", () => {
  it("deletes an API after the method, resource, deployment and stage on it", async () => {
    // Given a deployed REST API in front of a Lambda function, which is the
    // seven-Resource shape CDK synthesises
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders", "{orderId}"] }],
      }),
    );

    const restApi = stack.resources.get("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);

    // When the Stack's Resources are torn down
    await stack.teardown();

    // Then the API is gone, with everything under it
    assertUndefined(simAws.apiGateway().findRestApi(restApi.apiId));

    for (const logicalId of [
      simCfnRestApiMethodLogicalId({
        httpMethod: "GET",
        path: ["orders", "{orderId}"],
      }),
      simCfnRestApiResourceLogicalId(["orders", "{orderId}"]),
      simCfnRestApiResourceLogicalId(["orders"]),
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

  it("records the deployment as a deletion nothing carried out", async () => {
    // Given the same Stack
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders"] }],
      }),
    );

    // When the Stack's Resources are torn down
    await stack.teardown();

    // Then the deployment is reported rather than deleted, because API Gateway
    // deletes one and this simulation has no command for it. The deployment
    // goes with its API a moment later in the same teardown.
    const deployment = stack.resources.get("Deployment");
    assertNonNullable(deployment);
    assertTrue(deployment.deletionSkipped);
    assertStringIncludes(
      deployment.deletionSkippedReason ?? "",
      "Unsupported sim API Gateway CloudFormation Resource Deployment deletion",
    );
  });

  it("deletes the function, its permission and its Role with the API", async () => {
    // Given the same Stack, whose Lambda half is a function, the permission
    // API Gateway invokes it under, and the execution Role
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methods: [{ httpMethod: "GET", path: ["orders"] }],
      }),
    );

    assertNonNullable(simAws.lambda().getSimFunctionByName("orders"));

    // When the Stack's Resources are torn down
    await stack.teardown();

    // Then the function and the Role it ran as are both gone
    assertUndefined(simAws.lambda().getSimFunctionByName("orders"));
    assertUndefined(simAws.iam().roles.get("orders-role" as never));
    assertIdentical(
      stack.resources.get("HandlerPermission")?.status,
      "DELETE_COMPLETE",
    );
  });
});
