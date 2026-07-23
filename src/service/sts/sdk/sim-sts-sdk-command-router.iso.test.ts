import { describe, it } from "vitest";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdk } from "../../../sdk/index.js";

describe("simulated STS SDK Command routing", () => {
  it("routes AssumeRoleCommand through an intercepted client", async () => {
    using simSdk = new SimSdk();
    const accountId = simSdk.simAws.defaultAccountId;
    const targetRoleArn = `arn:aws:iam::${accountId}:role/InterceptTargetRole`;

    // A Role trusting the Account root, which is the default caller for
    // intercepted Commands sent without recognised credentials.
    await simSdk.simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "InterceptTargetRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    const client = new STSClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const output = await client.send(
      new AssumeRoleCommand({
        RoleArn: targetRoleArn,
        RoleSessionName: "intercepted-session",
      }),
    );

    assertIdentical(
      output.AssumedRoleUser?.Arn,
      `arn:aws:sts::${accountId}:assumed-role/InterceptTargetRole/intercepted-session`,
    );

    // And the returned session credentials resolve in sim IAM to the Role.
    const credentials = output.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    const identity = simSdk.simAws.iam().credentials.resolveCredentials({
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    });
    assertObjectMatches(identity, {
      identityPolicyPrincipal: { kind: "arn", arn: targetRoleArn },
    });
  });

  it("rejects a Command simulated STS does not support", async () => {
    using simSdk = new SimSdk();
    const client = new STSClient({ region: "us-east-1" });
    simSdk.intercept(client);

    const error = await assertThrowsErrorAsync(async () => {
      await client.send(new GetCallerIdentityCommand({}));
    });

    assertStringIncludes(error.message, "GetCallerIdentityCommand");
    assertStringIncludes(error.message, "AssumeRoleCommand");
  });
});
