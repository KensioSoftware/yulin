/**
 * Blocking a request to a REST API stage with a web ACL in front of it.
 */

import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const waf = simAws.wafV2();

const restApi = await simRestApiLambdaProxyFactory.make(
  { handler: () => ({ statusCode: 200, body: "orders" }) },
  simAws,
);

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "block-admin",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "CONTAINS",
            SearchString: Buffer.from("/admin"),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "block-admin" },
      },
    ],
  }),
);

await waf.associateWebAcl(
  new AssociateWebACLCommand({
    WebACLArn: created.Summary?.ARN,
    ResourceArn: restApi.stageArn("prod"),
  }),
);

const srv = await serveSimAws({ simAws });

const blocked = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/admin/users`),
);
const allowed = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/orders`),
);

console.log(blocked.status, allowed.status);
// 403 200

await srv.close();
