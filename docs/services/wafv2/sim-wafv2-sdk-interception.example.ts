/**
 * Routing an intercepted WAFv2 SDK client to the simulator.
 */

import { CreateWebACLCommand, WAFV2Client } from "@aws-sdk/client-wafv2";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

simSdk.intercept(WAFV2Client);

const client = new WAFV2Client({ region: "eu-west-2" });

await client.send(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "api",
    },
  }),
);

const scoped = simSdk.simAws.accountRegionScope(
  simSdk.simAws.defaultAccountId,
  "eu-west-2",
);

// "api-acl"
console.log(scoped.wafV2().allWebAcls("REGIONAL")[0]?.name);
