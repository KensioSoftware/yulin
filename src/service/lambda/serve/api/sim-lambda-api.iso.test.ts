import {
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  servedLambdaApi,
  servedLambdaApiEndpoint,
} from "../../../../../test/lambda/served-lambda-api.js";
import { SimRestJsonApiEndpoint } from "../../../../serve/http/api/rest-json/sim-rest-json-endpoint.js";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * What the served Lambda endpoint does with a request, once the protocol has
 * decided which operation it names.
 */
describe("Serving the simulated Lambda control plane", () => {
  it("refuses a path it has no operation for, by name", async () => {
    // Given a served simulation
    const { send } = await servedLambdaApi();

    // When a Lambda operation this simulation has not implemented is asked
    // for, at a path that shares its method with one it has
    const response = await send(
      "POST",
      "/2015-03-31/functions/orders/versions",
    );

    // Then it is refused rather than answered by the operation beside it, and
    // the refusal names the path
    assertIdentical(response.status, 501);
    assertIdentical(response.headers.get("x-amzn-errortype"), "NotImplemented");
    assertStringIncludes(
      await response.text(),
      "POST /2015-03-31/functions/orders/versions",
    );
  });

  it("answers a dry run with the status and no payload", async () => {
    // Given a served simulation
    const { send } = await servedLambdaApi();

    // When a function is invoked to check the caller may invoke it
    const response = await send(
      "POST",
      "/2015-03-31/functions/orders/invocations",
      { headers: { "x-amz-invocation-type": "DryRun" } },
    );

    // Then the status is the one Invoke reports for a dry run, and there is no
    // payload to read, since nothing ran
    assertIdentical(response.status, 204);
    assertIdentical(await response.text(), "");
  });

  it("answers an invoke with the payload and the executed version", async () => {
    // Given a served simulation
    const { send } = await servedLambdaApi();

    // When a function is invoked
    const response = await send(
      "POST",
      "/2015-03-31/functions/orders/invocations",
      { body: "{}" },
    );

    // Then the handler's result is the body, and the output members Invoke
    // reports in headers are there
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get("x-amz-executed-version"), "$LATEST");
    assertObjectMatches((await response.json()) as object, { ok: true });
  });

  it("reports a body that states itself as JSON and is not", async () => {
    // Given a served simulation
    const { send } = await servedLambdaApi();

    // When a function creation carries something that is not JSON
    const response = await send("POST", "/2015-03-31/functions", {
      body: "not json at all",
    });

    // Then the refusal names the exception real AWS uses for it
    assertIdentical(response.status, 400);
    assertIdentical(
      response.headers.get("x-amzn-errortype"),
      "SerializationException",
    );
  });

  it("reports a route naming an operation the simulation does not support", async () => {
    // Given an endpoint whose table names a Command simulated Lambda has no
    // handler for, which is what serving an operation ahead of implementing it
    // would look like
    const simAws = new SimAws();
    const served = new SimRestJsonApiEndpoint({
      simAws,
      serviceId: "Lambda",
      routes: [
        {
          method: "POST",
          path: "/2015-03-31/functions/{FunctionName}/code",
          commandName: "UpdateFunctionCodeCommand",
          input: (input) => ({ FunctionName: input.label("FunctionName") }),
        },
      ],
    });

    // When it is asked for
    const response = await served.handle(
      new Request(
        `${servedLambdaApiEndpoint}/2015-03-31/functions/orders/code`,
        { method: "POST" },
      ),
      new Uint8Array(),
      { kind: "anonymous" },
      simAws.defaultRegionName,
    );

    // Then the endpoint says so rather than answering with a server error
    assertIdentical(response.status, 501);
    assertIdentical(response.headers.get("x-amzn-errortype"), "NotImplemented");
    assertStringIncludes(await response.text(), "UpdateFunctionCodeCommand");
  });
});
