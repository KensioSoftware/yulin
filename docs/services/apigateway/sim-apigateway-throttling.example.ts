/**
 * Throttling a REST API stage and one of its methods.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/password-reset", "/profile"],
    httpMethod: "POST",
    methodSettings: {
      "/*/*": { throttlingRateLimit: 10, throttlingBurstLimit: 5 },
      "/password-reset/POST": {
        throttlingRateLimit: 1,
        throttlingBurstLimit: 2,
      },
    },
    handler: () => ({ statusCode: 200, body: "ok" }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });

// Stop simulated time. A bucket now refills only when this example moves it.
simAws.clock().freeze();

const passwordReset = async (): Promise<Response> =>
  await fetch(srv.localUrl(`${restApi.invokeUrl("prod")}/password-reset`), {
    method: "POST",
  });

const first = await passwordReset();
const second = await passwordReset();
const third = await passwordReset();

console.log(first.status, second.status, third.status);
console.log(await third.text());

// Another method, drawing on the stage default and a bucket of its own.
const profile = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/profile`),
  { method: "POST" },
);
console.log(profile.status);

// One second at a rate limit of one is one token back.
await simAws.clock().advanceBy({ seconds: 1 });
const afterASecond = await passwordReset();
console.log(afterASecond.status);

await srv.close();
