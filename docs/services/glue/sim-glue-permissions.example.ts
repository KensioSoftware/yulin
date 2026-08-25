/**
 * A Role that may read one table and nothing else in the catalog.
 */

import { GetTableCommand } from "@aws-sdk/client-glue";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });

await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ReportingRole",
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
    RoleName: "ReportingRole",
    PolicyName: "ReadAccessLogs",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "glue:GetTable",
          Resource:
            "arn:aws:glue:us-east-1:111111111111:table/site_logs/access_logs",
        },
      ],
    }),
  }),
);

simAws
  .glue()
  .getTable(
    new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
    {
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::111111111111:role/ReportingRole",
      },
    },
  );
