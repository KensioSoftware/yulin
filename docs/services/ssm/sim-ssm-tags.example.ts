/**
 * Tagging a parameter and deciding a read on its tags.
 */

import {
  AddTagsToResourceCommand,
  GetParameterCommand,
  ListTagsForResourceCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/orders/db-host",
    Type: "String",
    Value: "db.internal",
    Tags: [{ Key: "team", Value: "orders" }],
  }),
);

await simAws.ssm().addTagsToResource(
  new AddTagsToResourceCommand({
    ResourceType: "Parameter",
    ResourceId: "/orders/db-host",
    Tags: [{ Key: "stage", Value: "test" }],
  }),
);

const listed = await simAws.ssm().listTagsForResource(
  new ListTagsForResourceCommand({
    ResourceType: "Parameter",
    ResourceId: "/orders/db-host",
  }),
);

console.log(listed.TagList);
// [ { Key: 'team', Value: 'orders' }, { Key: 'stage', Value: 'test' } ]

await simAws.iam().createRole({
  input: {
    RoleName: "OrdersReader",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "OrdersReader",
    PolicyName: "ReadOwnTeam",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "*",
        Condition: { StringEquals: { "ssm:ResourceTag/team": "orders" } },
      },
    }),
  },
});

const read = await simAws
  .ssm()
  .getParameter(new GetParameterCommand({ Name: "/orders/db-host" }), {
    caller: {
      kind: "arn",
      arn: "arn:aws:iam::123456789012:role/OrdersReader",
    },
  });

console.log(read.Parameter?.Value); // "db.internal"
