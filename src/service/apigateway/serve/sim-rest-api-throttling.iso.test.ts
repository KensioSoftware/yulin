import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApiMethodSettingsMap } from "../api/stage/settings/sim-rest-api-method-settings.type.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

/** The resource a stage throttles harder than the rest of its API. */
const passwordReset = "/password-reset";

/** The resource the rest of the API's traffic goes to. */
const profile = "/profile";

/** Both resources declare this method, so both are keyed by it. */
const httpMethod = "POST";

/** Method settings naming the password reset method and nothing else. */
const perMethod: SimRestApiMethodSettingsMap = {
  [`${passwordReset}/${httpMethod}`]: {
    throttlingRateLimit: 1,
    throttlingBurstLimit: 2,
  },
};

/** The stage default, which real API Gateway keys with two stars. */
const stageDefault = "/*/*";

/**
 * Send one request to a resource of an API, as a named client.
 *
 * The throttle reads nothing about the client, and the header is here so a
 * test can say which client sent what. A stage bucket is shared, and who sent
 * a request makes no difference to whether it is served.
 */
async function request(
  simAws: SimAws,
  restApi: SimRestApi,
  path: string,
  client = "one",
): Promise<Response> {
  const url = new SimAwsLocalUrl({
    input: `${restApi.invokeUrl("prod")}${path}`,
  }).toString();

  return await new SimAwsHttp({ simAws }).fetch(url, {
    method: httpMethod,
    headers: { "x-client": client },
  });
}

/**
 * The status one request to a resource gets back.
 */
async function status(
  simAws: SimAws,
  restApi: SimRestApi,
  path: string,
): Promise<number> {
  const response = await request(simAws, restApi, path);

  return response.status;
}

/**
 * An API whose stage throttles, with the clock stopped so only what a test
 * asks for moves it.
 */
async function throttledApi(
  simAws: SimAws,
  methodSettings: SimRestApiMethodSettingsMap,
): Promise<SimRestApi> {
  const restApi = await simRestApiLambdaProxyFactory.make(
    {
      resourcePaths: [passwordReset, profile],
      httpMethod,
      methodSettings,
      handler: () => ({ statusCode: 200, body: "ok" }),
    },
    simAws,
  );
  simAws.clock().freeze();

  return restApi;
}

describe("Throttling a sim REST API stage", () => {
  it("answers a request past the method's burst with 429", async () => {
    // Given a stage allowing two password resets at once and one a second
    const simAws = new SimAws();
    const restApi = await throttledApi(simAws, perMethod);

    // When three arrive with no time between them
    const responses = [
      await request(simAws, restApi, passwordReset),
      await request(simAws, restApi, passwordReset),
      await request(simAws, restApi, passwordReset),
    ];

    // Then the burst is served and the request past it is refused, with the
    // `message` body a REST API answers with
    expect(responses.map((response) => response.status)).toStrictEqual([
      200, 200, 429,
    ]);
    expect(await responses[2]?.json()).toStrictEqual({
      message: "Too Many Requests",
    });
  });

  it("refills the bucket as the simulated clock moves on", async () => {
    // Given a method that has run out of tokens
    const simAws = new SimAws();
    const restApi = await throttledApi(simAws, perMethod);
    await request(simAws, restApi, passwordReset);
    await request(simAws, restApi, passwordReset);
    assertIdentical(await status(simAws, restApi, passwordReset), 429);

    // When a second passes, which is one token at the method's rate limit
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the next request is served, and the one after it is not, because
    // the second refilled one token rather than the whole burst
    assertIdentical(await status(simAws, restApi, passwordReset), 200);
    assertIdentical(await status(simAws, restApi, passwordReset), 429);
  });

  it("gives a method named in MethodSettings the limit it names", async () => {
    // Given a stage whose default is generous and whose password reset method
    // is not
    const simAws = new SimAws();
    const restApi = await throttledApi(simAws, {
      [stageDefault]: { throttlingRateLimit: 10, throttlingBurstLimit: 5 },
      ...perMethod,
    });

    // When the password reset method is used past its own burst
    await request(simAws, restApi, passwordReset);
    await request(simAws, restApi, passwordReset);

    // Then it is refused by the entry that names it, while the method drawing
    // on the stage default is served from a bucket of its own
    assertIdentical(await status(simAws, restApi, passwordReset), 429);
    assertIdentical(await status(simAws, restApi, profile), 200);
  });

  it("throttles a method on the stage default when nothing names it", async () => {
    // Given a stage default of one request at a time and no entry for any
    // method
    const simAws = new SimAws();
    const restApi = await throttledApi(simAws, {
      [stageDefault]: { throttlingRateLimit: 1, throttlingBurstLimit: 1 },
    });

    // When one method is used twice
    const served = await status(simAws, restApi, profile);
    const refused = await status(simAws, restApi, profile);

    // Then the second is refused on the stage default
    assertIdentical(served, 200);
    assertIdentical(refused, 429);
  });

  it("counts every client against the one bucket", async () => {
    // Given a stage allowing two password resets at once
    const simAws = new SimAws();
    const restApi = await throttledApi(simAws, perMethod);

    // When two clients send one each, and then one of them sends another
    const first = await request(simAws, restApi, passwordReset, "one");
    const second = await request(simAws, restApi, passwordReset, "two");
    const third = await request(simAws, restApi, passwordReset, "two");

    // Then the third is refused, because a stage throttle is one bucket for
    // the method, where a WAF rate-based rule counts each client on its own
    expect([first.status, second.status, third.status]).toStrictEqual([
      200, 200, 429,
    ]);
  });

  it("serves everything when the stage names no limits", async () => {
    // Given a stage created without method settings
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: [passwordReset],
        httpMethod,
        handler: () => ({ statusCode: 200, body: "ok" }),
      },
      simAws,
    );

    // When the same method is used many times over
    const statuses = await Promise.all(
      Array.from({ length: 20 }, async () =>
        status(simAws, restApi, passwordReset),
      ),
    );

    // Then nothing is throttled, as nothing was throttled before a stage could
    // ask for it
    expect(statuses).toStrictEqual(Array.from({ length: 20 }, () => 200));
  });
});
