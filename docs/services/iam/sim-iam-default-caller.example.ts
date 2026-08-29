/**
 * Naming who a call that states no caller comes from.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultCaller: {
    kind: "arn",
    arn: "arn:aws:iam::123456789012:role/Administrator",
  },
});

// The Role is created inside a run as the Account root. A simulation with a
// default caller attributes these commands to it, and it holds no policy until
// they are done.
const simIam = simAws.iam();

await simAws.runAs(simAws.account().rootPrincipal, async () => {
  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "Administrator",
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
      RoleName: "Administrator",
      PolicyName: "Administer",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: "*", Resource: "*" },
      }),
    }),
  );
});

const decision = simAws.iam().authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
});

console.log(decision.caller.arn); // "arn:aws:iam::123456789012:role/Administrator"
console.log(decision.isAllowed); // true
