/**
 * Blocking a request to a pool's hosted domain with a web ACL in front of it.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();
const waf = simAws.wafV2();

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = created.UserPool!.Id!;

await cognito.createUserPoolDomain(
  new CreateUserPoolDomainCommand({
    UserPoolId: userPoolId,
    Domain: "myapp-login",
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthFlows: ["code"],
    AllowedOAuthScopes: ["openid"],
    CallbackURLs: ["https://www.example.com/user/callback"],
    SupportedIdentityProviders: ["COGNITO"],
  }),
);

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "pool",
};

const webAcl = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "pool-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "block-scraper",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { SingleHeader: { Name: "user-agent" } },
            PositionalConstraint: "CONTAINS",
            SearchString: Buffer.from("scraper"),
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "block-scraper" },
      },
    ],
  }),
);

await waf.associateWebAcl(
  new AssociateWebACLCommand({
    WebACLArn: webAcl.Summary?.ARN,
    ResourceArn: cognito.userPool(userPoolId).arn.value,
  }),
);

const srv = await serveSimAws({ simAws });
const parameters = new URLSearchParams({
  response_type: "code",
  client_id: appClient.UserPoolClient!.ClientId!,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid",
});
const signInUrl = srv.localUrl(
  `https://myapp-login.auth.eu-west-2.amazoncognito.com/oauth2/authorize?${parameters.toString()}`,
);

const blocked = await fetch(signInUrl, {
  headers: { "user-agent": "scraper/1.0" },
});
const allowed = await fetch(signInUrl);

console.log(blocked.status, allowed.status);
// 403 200

await srv.close();
