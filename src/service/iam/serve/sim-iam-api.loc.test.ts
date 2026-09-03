import {
  AttachRolePolicyCommand,
  CreateAccessKeyCommand,
  CreatePolicyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  DeletePolicyCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  GetPolicyCommand,
  GetRoleCommand,
  GetUserCommand,
  IAMClient,
  ListPoliciesCommand,
  ListRolesCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import {
  assertArrayIncludes,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { servedUserCredentials } from "../../../../test/serve/served-credentials.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * A policy admitting a principal to everything, which is what the User created
 * over the endpoint is given before it signs anything of its own.
 */
const everythingPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "*", Resource: "*" },
});

/**
 * A trust policy naming Lambda, which is the shape a Role takes one in.
 */
const lambdaTrustPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
});

/**
 * Simulated IAM reached over a port by a real client.
 *
 * Every served request is authorized as the principal that signed it, and
 * until IAM answered here a caller outside the process that built the
 * simulation had no way to become one. What these cover is that a container or
 * a shell script can set up its own identity over the endpoint and then go on
 * to use it.
 */
describe("Serving simulated IAM on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: IAMClient;

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;

    client = new IAMClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: await servedUserCredentials(simAws, "Bootstrap"),
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("makes a User whose own access key signs its later requests", async () => {
    // Given a User created over the endpoint, admitted to everything
    const created = await client.send(
      new CreateUserCommand({ UserName: "Widgets", Path: "/service/" }),
    );
    const user = created.User;
    assertNonNullable(user, "CreateUser answered with a User");
    assertIdentical(user.Path, "/service/");

    await client.send(
      new PutUserPolicyCommand({
        UserName: "Widgets",
        PolicyName: "Everything",
        PolicyDocument: everythingPolicy,
      }),
    );

    // When it asks the same endpoint for an access key
    const answered = await client.send(
      new CreateAccessKeyCommand({ UserName: "Widgets" }),
    );
    const key = answered.AccessKey;
    assertNonNullable(key, "CreateAccessKey answered with a key");
    assertNonNullable(key.AccessKeyId, "the key's id");
    assertNonNullable(key.SecretAccessKey, "the key's secret");
    assertIdentical(key.Status, "Active");
    assertIdentical(key.UserName, "Widgets");

    // Then a later request signed with that key is the User it was made for,
    // which is the whole reason for serving IAM
    const sts = new STSClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: key.AccessKeyId,
        secretAccessKey: key.SecretAccessKey,
      },
    });
    const identity = await sts.send(new GetCallerIdentityCommand({}));

    assertIdentical(identity.Arn, user.Arn);
    assertIdentical(identity.Account, simAws.defaultAccountId);
  });

  it("makes a Role, reads it back and lists it", async () => {
    // Given a Role created over the endpoint with a trust policy and a
    // permissions boundary
    const boundaryArn = `arn:aws:iam::${simAws.defaultAccountId}:policy/Boundary`;
    const created = await client.send(
      new CreateRoleCommand({
        RoleName: "Checkout",
        Path: "/service-role/",
        AssumeRolePolicyDocument: lambdaTrustPolicy,
        Description: "The checkout function's Role",
        PermissionsBoundary: boundaryArn,
      }),
    );
    const role = created.Role;
    assertNonNullable(role, "CreateRole answered with a Role");
    assertIdentical(role.RoleName, "Checkout");
    assertIdentical(role.Path, "/service-role/");
    assertNonNullable(role.CreateDate, "a creation date");

    // When it is read back and listed
    const answered = await client.send(
      new GetRoleCommand({ RoleName: "Checkout" }),
    );
    const listed = await client.send(
      new ListRolesCommand({ PathPrefix: "/service-role/", MaxItems: 10 }),
    );

    // Then both describe the Role the envelope carried out
    const read = answered.Role;
    assertNonNullable(read, "GetRole answered with a Role");
    assertIdentical(read.Arn, role.Arn);
    assertIdentical(read.Description, "The checkout function's Role");
    assertStringIncludes(
      read.AssumeRolePolicyDocument ?? "",
      "lambda.amazonaws.com",
    );
    assertArrayIncludes(
      (listed.Roles ?? []).map((listedRole) => listedRole.RoleName),
      "Checkout",
    );

    // And the boundary travelled as the structure IAM answers with, on the
    // create and the get, while the listing left it out as IAM does
    const attachedBoundary = role.PermissionsBoundary;

    assertNonNullable(attachedBoundary, "CreateRole described the boundary");
    assertIdentical(
      attachedBoundary.PermissionsBoundaryType,
      "PermissionsBoundaryPolicy",
    );
    assertIdentical(attachedBoundary.PermissionsBoundaryArn, boundaryArn);
    assertIdentical(
      read.PermissionsBoundary?.PermissionsBoundaryArn,
      boundaryArn,
    );
    assertUndefined(
      (listed.Roles ?? []).find(
        (listedRole) => listedRole.RoleName === "Checkout",
      )?.PermissionsBoundary,
    );
  });

  it("writes an inline policy on a Role and takes it off again", async () => {
    // Given a Role created over the endpoint
    await client.send(
      new CreateRoleCommand({
        RoleName: "Reporting",
        AssumeRolePolicyDocument: lambdaTrustPolicy,
      }),
    );

    // When an inline policy is written on it and then removed
    await client.send(
      new PutRolePolicyCommand({
        RoleName: "Reporting",
        PolicyName: "ReadOrders",
        PolicyDocument: everythingPolicy,
      }),
    );
    await client.send(
      new DeleteRolePolicyCommand({
        RoleName: "Reporting",
        PolicyName: "ReadOrders",
      }),
    );

    // Then the Role can be deleted, and it is gone for the next request
    await client.send(new DeleteRoleCommand({ RoleName: "Reporting" }));

    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(new GetRoleCommand({ RoleName: "Reporting" })),
    );
    assertIdentical(error.name, "NoSuchEntityException");
  });

  it("makes a managed policy, attaches it to a Role and detaches it", async () => {
    // Given a managed policy and a Role, both made over the endpoint
    const created = await client.send(
      new CreatePolicyCommand({
        PolicyName: "ReadEverything",
        Path: "/reporting/",
        PolicyDocument: everythingPolicy,
        Description: "Everything, for reporting",
      }),
    );
    const policy = created.Policy;
    assertNonNullable(policy, "CreatePolicy answered with a Policy");

    const policyArn = policy.Arn;
    assertNonNullable(policyArn, "the policy's ARN");
    assertIdentical(policy.AttachmentCount, 0);

    await client.send(
      new CreateRoleCommand({
        RoleName: "Reader",
        AssumeRolePolicyDocument: lambdaTrustPolicy,
      }),
    );

    // When the policy is attached, read back, listed and detached
    await client.send(
      new AttachRolePolicyCommand({ RoleName: "Reader", PolicyArn: policyArn }),
    );
    const answered = await client.send(
      new GetPolicyCommand({ PolicyArn: policyArn }),
    );
    const listed = await client.send(
      new ListPoliciesCommand({ Scope: "Local", OnlyAttached: false }),
    );
    await client.send(
      new DetachRolePolicyCommand({ RoleName: "Reader", PolicyArn: policyArn }),
    );

    // Then every member arrived as what it is, a count as a number, a flag as
    // a boolean and a timestamp as a date
    const read = answered.Policy;
    assertNonNullable(read, "GetPolicy answered with a Policy");
    assertIdentical(read.AttachmentCount, 0);
    assertTrue(read.IsAttachable ?? false);
    assertIdentical(read.Path, "/reporting/");
    assertNonNullable(read.UpdateDate, "an update date");
    assertArrayIncludes(
      (listed.Policies ?? []).map((each) => each.Arn),
      policyArn,
    );

    // And a detached policy can be deleted
    await client.send(new DeletePolicyCommand({ PolicyArn: policyArn }));

    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(new GetPolicyCommand({ PolicyArn: policyArn })),
    );
    assertIdentical(error.name, "NoSuchEntityException");
  });

  it("refuses an IAM operation it does not serve", async () => {
    // When an operation simulated IAM has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(new GetUserCommand({ UserName: "Widgets" })),
    );

    // Then it is refused by name, in the shape the Query protocol states an
    // error, so an SDK raises it rather than failing to parse the response
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "GetUser");
  });
});
