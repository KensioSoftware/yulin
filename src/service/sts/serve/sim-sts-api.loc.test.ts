import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  GetSessionTokenCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

/**
 * Simulated STS reached over a port, which is the first call a person makes to
 * check that credentials and an endpoint are wired up correctly.
 *
 * STS speaks the Query protocol, so what these cover is whether an operation
 * survives a form-encoded request and an XML envelope.
 */
describe("Serving simulated STS on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: STSClient;
  let accountId: string;

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;
    accountId = simAws.defaultAccountId;

    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Widgets" }));
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Widgets" }),
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

  it("reports the principal whose credentials signed the request", async () => {
    // Given a client signing as an IAM User

    // When it asks who the simulator thinks it is
    const identity = await client.send(new GetCallerIdentityCommand({}));

    // Then the answer describes that User, read out of the signature alone
    assertIdentical(identity.Arn, `arn:aws:iam::${accountId}:user/Widgets`);
    assertIdentical(identity.Account, accountId);
    assertStringIncludes(identity.UserId ?? "", "AIDA");
  });

  it("reports an assumed-role session as the session", async () => {
    // Given a session assumed into a Role, signing with its own credentials
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Nightly",
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
    const assumed = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Nightly`,
        RoleSessionName: "batch",
      }),
    );
    const session = assumed.Credentials;
    assertDefined(session, "the assumed session credentials");
    assertDefined(session.AccessKeyId, "the session access key id");
    assertDefined(session.SecretAccessKey, "the session secret");
    assertDefined(session.SessionToken, "the session token");

    const sessionClient = new STSClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: session.AccessKeyId,
        secretAccessKey: session.SecretAccessKey,
        sessionToken: session.SessionToken,
      },
    });

    // When the session asks who it is
    const identity = await sessionClient.send(new GetCallerIdentityCommand({}));

    // Then it is the session that answers, rather than the Role behind it
    assertIdentical(
      identity.Arn,
      `arn:aws:sts::${accountId}:assumed-role/Nightly/batch`,
    );
  });

  it("refuses an STS operation it does not serve", async () => {
    // When an operation simulated STS has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () => await client.send(new GetSessionTokenCommand({})),
    );

    // Then it is refused by name, in the shape the Query protocol states an
    // error, so the SDK raises it rather than failing to parse the response
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "GetSessionToken");
  });

  it("refuses a signed request that names itself anonymous", async () => {
    // Given a request signed for STS whose caller header overrides the
    // identity the signature carries, which is the local-development path
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-sim-aws-caller": "anonymous",
        authorization: signedStsAuthorization(),
      },
      body: "Action=GetCallerIdentity&Version=2011-06-15",
    });

    // Then it is refused, because a caller with no identity has none to report
    assertIdentical(response.status, 403);
    assertStringIncludes(await response.text(), "AccessDenied");
  });

  it("refuses a request naming no operation at all", async () => {
    // Given a Query request with no Action field
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-sim-aws-caller": `arn:aws:iam::${accountId}:user/Widgets`,
        authorization: signedStsAuthorization(),
      },
      body: "Version=2011-06-15",
    });

    // Then it is refused as stating no operation
    assertIdentical(response.status, 400);
    assertStringIncludes(await response.text(), "MissingAction");
  });

  /**
   * An Authorization header scoped to STS, which is what routes a request to
   * this endpoint. The signature itself is never verified in these two,
   * because the caller header they also send wins over it.
   */
  function signedStsAuthorization(): string {
    return (
      "AWS4-HMAC-SHA256 " +
      `Credential=AKIAEXAMPLE/20260818/${simAws.defaultRegionName}/sts/aws4_request, ` +
      "SignedHeaders=host, Signature=0"
    );
  }
});
