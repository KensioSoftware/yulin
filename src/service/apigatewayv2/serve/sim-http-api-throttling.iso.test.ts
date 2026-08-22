import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApiRouteSettingsMap } from "../api/stage/settings/sim-http-api-route-settings.type.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/** The route a stage throttles harder than the rest of its API. */
const passwordReset = "POST /user/password-reset";

/** The route the rest of the API's traffic goes to. */
const profile = "GET /user/profile";

/** The two routes every API here serves. */
const routeKeys = [passwordReset, profile];

/** A `RouteSettings` naming the password reset route and nothing else. */
const perRoute: SimHttpApiRouteSettingsMap = {
  [passwordReset]: { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 2 },
};

/**
 * Send one request to a route of an API, as a named client.
 *
 * The throttle reads nothing about the client, and the header is here so a
 * test can say which client sent what. A stage bucket is shared, and who sent
 * a request makes no difference to whether it is served.
 */
async function request(
  simAws: SimAws,
  api: SimHttpApi,
  routeKey: string,
  client = "one",
): Promise<Response> {
  const [method = "GET", path = "/"] = routeKey.split(" ", 2);

  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString(),
    { method, headers: { "x-client": client } },
  );
}

/**
 * An API whose stage throttles, with the clock stopped so only what a test
 * asks for moves it.
 */
async function throttledApi(
  simAws: SimAws,
  input: Parameters<typeof simHttpApiLambdaProxyFactory.make>[0],
): Promise<SimHttpApi> {
  const api = await simHttpApiLambdaProxyFactory.make(
    { routeKeys, ...input },
    simAws,
  );
  simAws.clock().freeze();

  return api;
}

/**
 * The status one request to a route gets back.
 */
async function status(
  simAws: SimAws,
  api: SimHttpApi,
  routeKey: string,
): Promise<number> {
  const response = await request(simAws, api, routeKey);

  return response.status;
}

describe("Throttling a sim HTTP API stage", () => {
  it("answers a request past the route's burst with 429", async () => {
    // Given a stage allowing two password resets at once and one a second
    const simAws = new SimAws();
    const api = await throttledApi(simAws, { routeSettings: perRoute });

    // When three arrive with no time between them
    const responses = [
      await request(simAws, api, passwordReset),
      await request(simAws, api, passwordReset),
      await request(simAws, api, passwordReset),
    ];

    // Then the burst is served and the request past it is refused, with the
    // lower-case message an HTTP API answers throttled requests with
    expect(responses.map((response) => response.status)).toStrictEqual([
      200, 200, 429,
    ]);
    expect(await responses[2]?.json()).toStrictEqual({
      message: "Too Many Requests",
    });
  });

  it("refills the bucket as the simulated clock moves on", async () => {
    // Given a route that has run out of tokens
    const simAws = new SimAws();
    const api = await throttledApi(simAws, { routeSettings: perRoute });
    await request(simAws, api, passwordReset);
    await request(simAws, api, passwordReset);
    assertIdentical(await status(simAws, api, passwordReset), 429);

    // When a second passes, which is one token at the route's rate limit
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the next request is served, and the one after it is not, because
    // the second refilled one token rather than the whole burst
    assertIdentical(await status(simAws, api, passwordReset), 200);
    assertIdentical(await status(simAws, api, passwordReset), 429);
  });

  it("gives a route named in RouteSettings the limit it names", async () => {
    // Given a stage whose default is generous and whose password reset route
    // is not
    const simAws = new SimAws();
    const api = await throttledApi(simAws, {
      defaultRouteSettings: {
        ThrottlingRateLimit: 10,
        ThrottlingBurstLimit: 5,
      },
      routeSettings: perRoute,
    });

    // When the password reset route is used past its own burst
    await request(simAws, api, passwordReset);
    await request(simAws, api, passwordReset);
    const refused = await request(simAws, api, passwordReset);

    // Then it is refused by the entry that names it, while the route drawing
    // on the stage default is served from a bucket of its own
    assertIdentical(refused.status, 429);
    assertIdentical(await status(simAws, api, profile), 200);
  });

  it("throttles a route on the stage default when nothing names it", async () => {
    // Given a stage default of one request at a time and no entry for any
    // route
    const simAws = new SimAws();
    const api = await throttledApi(simAws, {
      defaultRouteSettings: { ThrottlingRateLimit: 1, ThrottlingBurstLimit: 1 },
    });

    // When one route is used twice
    const served = await request(simAws, api, profile);
    const refused = await request(simAws, api, profile);

    // Then the second is refused on the stage default
    assertIdentical(served.status, 200);
    assertIdentical(refused.status, 429);
  });

  it("counts every client against the one bucket", async () => {
    // Given a stage allowing two password resets at once
    const simAws = new SimAws();
    const api = await throttledApi(simAws, { routeSettings: perRoute });

    // When two clients send one each, and then one of them sends another
    const first = await request(simAws, api, passwordReset, "one");
    const second = await request(simAws, api, passwordReset, "two");
    const third = await request(simAws, api, passwordReset, "two");

    // Then the third is refused, because a stage throttle is one bucket for
    // the route rather than one per client, which is what a WAF rate-based
    // rule counts instead
    expect([first.status, second.status, third.status]).toStrictEqual([
      200, 200, 429,
    ]);
  });

  it("serves everything when the stage names no limits", async () => {
    // Given a stage created without route settings
    const simAws = new SimAws();
    const api = await throttledApi(simAws, {});

    // When the same route is used many times over
    const responses = await Promise.all(
      Array.from({ length: 20 }, async () =>
        request(simAws, api, passwordReset),
      ),
    );

    // Then nothing is throttled, as nothing was throttled before a stage could
    // ask for it
    expect(responses.map((response) => response.status)).toStrictEqual(
      Array.from({ length: 20 }, () => 200),
    );
  });
});
