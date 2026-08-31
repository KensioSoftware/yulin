import {
  assertResponseStatus,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/** A handler that answers whatever reaches it. */
const handlerSource = `
exports.handler = async () => ({ statusCode: 200, body: "ok" });
`;

function localUrl(apiUrl: string, path: string): string {
  return new SimAwsLocalUrl({ input: `${apiUrl}${path}` }).toString();
}

describe("Throttling a deployed sim REST API stage", () => {
  it("throttles a deployed stage's method at the limits it declares", async () => {
    // Given a template whose stage throttles one method harder than the rest
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource,
        methods: [
          { httpMethod: "GET", path: ["orders"] },
          { httpMethod: "POST", path: ["orders"] },
        ],
        stageProperties: {
          MethodSettings: [
            {
              ResourcePath: "/*",
              HttpMethod: "*",
              ThrottlingRateLimit: 10,
              ThrottlingBurstLimit: 5,
            },
            {
              ResourcePath: "/orders",
              HttpMethod: "POST",
              ThrottlingRateLimit: 1,
              ThrottlingBurstLimit: 1,
            },
          ],
        },
      }),
    );

    // When the throttled method is used twice over
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    simAws.clock().freeze();
    const http = new SimAwsHttp({ simAws });
    const served = await http.fetch(localUrl(apiUrl, "orders"), {
      method: "POST",
    });
    const refused = await http.fetch(localUrl(apiUrl, "orders"), {
      method: "POST",
    });

    // Then the deployed limits are the ones the stage serves at, and the
    // method on the stage default is untouched by the other method's burst
    assertResponseStatus(served, 200, await describeResponse(served));
    assertResponseStatus(refused, 429, await describeResponse(refused));

    const other = await http.fetch(localUrl(apiUrl, "orders"));
    assertResponseStatus(other, 200, await describeResponse(other));
  });
});
