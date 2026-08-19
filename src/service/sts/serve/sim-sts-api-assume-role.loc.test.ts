import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

/**
 * Assuming a Role over a port, which is the shape most production code takes:
 * a process assumes a Role and then does its work as the session.
 *
 * `AssumeRole` is the first served operation whose answer nests structures,
 * and the credentials it hands back have to sign the requests that follow.
 * Both are what these cover.
 */
describe("Assuming a Role over the STS endpoint", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: STSClient;
  let accountId: string;
  let userArn: string;

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;
    accountId = simAws.defaultAccountId;
    userArn = `arn:aws:iam::${accountId}:user/Batch`;

    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Batch" }));
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Batch" }),
    );

    client = new STSClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("hands back credentials that sign the request the caller makes next", async () => {
    // Given a Role this caller is trusted to assume
    await createRole("Reader", userArn);

    // When it is assumed over the endpoint
    const assumed = await client.send(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Reader`,
        RoleSessionName: "nightly",
      }),
    );

    // Then the session came back whole, in the two structures STS nests it in
    const session = assumed.Credentials;
    assertDefined(session, "the assumed session credentials");
    assertDefined(session.AccessKeyId, "the session access key id");
    assertDefined(session.SecretAccessKey, "the session secret");
    assertDefined(session.SessionToken, "the session token");
    assertStringIncludes(session.AccessKeyId, "ASIA");
    const assumedRoleUser = assumed.AssumedRoleUser;
    assertDefined(assumedRoleUser, "the assumed Role user");
    assertDefined(assumedRoleUser.AssumedRoleId, "the assumed Role id");
    assertIdentical(
      assumedRoleUser.Arn,
      `arn:aws:sts::${accountId}:assumed-role/Reader/nightly`,
    );
    assertStringIncludes(assumedRoleUser.AssumedRoleId, ":nightly");

    // And the credentials it answered with sign a second served request, which
    // simulated IAM authorizes against the Role behind the session
    const sessionClient = new STSClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: session.AccessKeyId,
        secretAccessKey: session.SecretAccessKey,
        sessionToken: session.SessionToken,
      },
    });
    const identity = await sessionClient.send(new GetCallerIdentityCommand({}));

    assertIdentical(identity.Arn, assumedRoleUser.Arn);
  });

  it("expires the session on simulated time rather than on the host clock", async () => {
    // Given a simulation whose clock has been moved days away from this machine's
    await createRole("Weekly", userArn);
    await simAws.clock().advanceBy({ days: 3 });

    // When a fifteen minute session is assumed over the endpoint
    const assumed = await client.send(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Weekly`,
        RoleSessionName: "sweep",
        DurationSeconds: 900,
      }),
    );

    // Then the expiry the caller reads is fifteen minutes past simulated time,
    // which is days past the host clock the SDK signed with
    const expiration = assumed.Credentials?.Expiration;
    assertDefined(expiration, "the session expiry");
    assertIdentical(
      expiration.getTime(),
      simAws.clock().now().getTime() + 900_000,
    );
    assertTrue(expiration.getTime() > Date.now() + 2 * 24 * 60 * 60 * 1000);
  });

  it("refuses a caller the Role does not trust", async () => {
    // Given a Role whose trust policy names somebody else
    await createRole("Restricted", `arn:aws:iam::${accountId}:user/Somebody`);

    // When this caller tries to assume it
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new AssumeRoleCommand({
            RoleArn: `arn:aws:iam::${accountId}:role/Restricted`,
            RoleSessionName: "nightly",
          }),
        ),
    );

    // Then it comes back as the error real STS raises, under the name a
    // handler catching it in production would see
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "sts:AssumeRole");
  });

  /**
   * A Role one principal is trusted to assume, and nobody else.
   */
  async function createRole(
    roleName: string,
    trustedArn: string,
  ): Promise<void> {
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: trustedArn },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
  }
});
