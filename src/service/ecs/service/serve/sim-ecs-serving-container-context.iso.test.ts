import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  servedServiceAsRole,
  simAwsWithServedService,
} from "../../../../../test/ecs/served-service-fixture.js";
import { SimSdk } from "../../../../sdk/index.js";
import { simElbV2Fetch } from "../../../elbv2/serve/sim-elbv2-fetch.js";

describe("What a simulated ECS container answering a request may do", () => {
  it("attributes the container's own AWS calls to the task Role", async () => {
    // Given a served container that writes a parameter, and a task Role that
    // may write it.
    using simSdk = new SimSdk();

    simSdk.intercept(SSMClient);

    const { simAws } = simSdk;
    const hostname = await servedServiceAsRole(simAws, ["ssm:PutParameter"]);

    // When a request reaches the container.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`, {
      method: "POST",
      body: "order-1",
    });

    // Then simulated IAM allowed the write, so the parameter is there: the
    // call was made as the task Role rather than as whoever sent the request.
    assertIdentical(await response.text(), "written");

    const read = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/orders/last-handled" }));

    assertIdentical(read.Parameter?.Value, "order-1");
  });

  it("refuses an AWS call the task Role has no policy for", async () => {
    // Given the same container and a task Role that may read nothing.
    using simSdk = new SimSdk();

    simSdk.intercept(SSMClient);

    const { simAws } = simSdk;
    const hostname = await servedServiceAsRole(simAws, ["ssm:GetParameter"]);

    // When a request reaches the container.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`, {
      method: "POST",
      body: "order-1",
    });

    // Then the write was denied, naming the Role the deployed container would
    // have been running as.
    assertResponseStatus(response, 500, await describeResponse(response));
    assertStringIncludes(await response.text(), "ssm:PutParameter");
  });

  it("gives the container the environment its definition declared", async () => {
    // Given a served container declaring an environment variable, as a real
    // one takes its table name or its endpoint.
    const { simAws, hostname } = await simAwsWithServedService({
      containers: [
        {
          name: "app",
          ports: [8080],
          environment: [{ name: "ORDERS_TABLE", value: "orders" }],
          handler: (): Response =>
            new Response(
              `${process.env["ORDERS_TABLE"] ?? ""} ${
                process.env["AWS_REGION"] ?? ""
              }`,
            ),
        },
      ],
    });

    // When a request reaches it.
    const response = await simElbV2Fetch(simAws, `http://${hostname}/orders`);

    // Then the handler read it out of process.env, along with the Region
    // variables a task agent sets, exactly as a run task's container does.
    assertIdentical(
      await response.text(),
      `orders ${simAws.defaultRegionName}`,
    );
  });
});
