/**
 * Advancing simulated time past a temporary session's expiry.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportingRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

// A fifteen minute session.
const assumeRoleOutput = await simAws.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${simAws.defaultAccountId}:role/ReportingRole`,
    RoleSessionName: "reporting-session",
    DurationSeconds: 900,
  }),
);

const issued = assumeRoleOutput.Credentials!;
const credentials = {
  accessKeyId: issued.AccessKeyId!,
  secretAccessKey: issued.SecretAccessKey!,
  sessionToken: issued.SessionToken!,
};

// The session authenticates while it is current.
console.log(simIam.credentials.resolveCredentials(credentials).principal);

await simAws.clock().advanceBy({ minutes: 20 });

try {
  simIam.credentials.resolveCredentials(credentials);
} catch (error) {
  // Rejected as an expired session, twenty simulated minutes later.
  console.log((error as Error).message);
}
