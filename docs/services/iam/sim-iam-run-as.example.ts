/**
 * Attributing a block of calls to one simulated caller.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "Reporter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reporter",
    PolicyName: "ReadParameters",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "ssm:GetParameter", Resource: "*" },
    }),
  }),
);

await simAws.ssm().putParameter({
  input: { Name: "/reports/last-run", Type: "String", Value: "done" },
});

const reporter = "arn:aws:iam::123456789012:role/Reporter";

await simAws.runAs({ kind: "arn", arn: reporter }, async () => {
  // The read is a direct sim service call, decided as the Reporter Role.
  const read = await simAws
    .ssm()
    .getParameter({ input: { Name: "/reports/last-run" } });

  const write = simIam.authorize({
    action: "ssm:PutParameter",
    resource: "*",
  });

  console.log(read.Parameter?.Value); // "done"
  console.log(write.caller.arn); // "arn:aws:iam::123456789012:role/Reporter"
  console.log(write.isDenied); // true
});
