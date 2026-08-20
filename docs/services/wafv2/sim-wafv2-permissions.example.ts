/**
 * Reading a web ACL as a Role, with a policy naming it.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateWebACLCommand, GetWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const roleArn = "arn:aws:iam::111111111111:role/FirewallReaderRole";

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "FirewallReaderRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "FirewallReaderRole",
    PolicyName: "ReadApiAcl",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "wafv2:GetWebACL",
          Resource:
            "arn:aws:wafv2:us-east-1:111111111111:regional/webacl/api-acl/*",
        },
      ],
    }),
  }),
);

const waf = simAws.wafV2();
const created = await waf.createWebAcl(
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

const read = await waf.getWebAcl(
  new GetWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    Id: created.Summary?.Id,
  }),
  { caller: { kind: "arn", arn: roleArn } },
);

// "api-acl"
console.log(read.WebACL?.Name);
