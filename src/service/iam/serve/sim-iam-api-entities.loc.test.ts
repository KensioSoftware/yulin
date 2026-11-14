import {
  AddUserToGroupCommand,
  CreateAccessKeyCommand,
  CreateGroupCommand,
  CreatePolicyCommand,
  CreateLoginProfileCommand,
  CreateOpenIDConnectProviderCommand,
  CreatePolicyVersionCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  GetGroupCommand,
  GetLoginProfileCommand,
  GetUserCommand,
  GetUserPolicyCommand,
  IAMClient,
  ListAccessKeysCommand,
  ListGroupsForUserCommand,
  ListPolicyVersionsCommand,
  ListUserPoliciesCommand,
  ListUsersCommand,
  PutGroupPolicyCommand,
  PutUserPolicyCommand,
  UpdateRoleCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertArrayIncludes,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { servedUserCredentials } from "../../../../test/serve/served-credentials.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRoleName } from "../role/sim-iam-role.js";

const allow = (Action: string): string =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: { Effect: "Allow", Action, Resource: "*" },
  });

/**
 * The IAM commands that read and change Users, groups and policy versions,
 * reached over a port by a real client.
 */
describe("Serving simulated IAM groups, Users and policy versions", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: IAMClient;

  beforeAll(async () => {
    await srv.listen();
    client = new IAMClient({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      credentials: await servedUserCredentials(simAws, "Bootstrap"),
    });
  });

  afterAll(async () => {
    client.destroy();
    await srv.close();
  });

  it("serves group membership and group policies", async () => {
    // Given a group with a policy, and a User in it
    await client.send(new CreateGroupCommand({ GroupName: "Readers" }));
    await client.send(
      new PutGroupPolicyCommand({
        GroupName: "Readers",
        PolicyName: "read",
        PolicyDocument: allow("s3:GetObject"),
      }),
    );
    await client.send(new CreateUserCommand({ UserName: "member" }));
    await client.send(
      new AddUserToGroupCommand({ GroupName: "Readers", UserName: "member" }),
    );

    // When the group and the User's groups are read
    const group = await client.send(
      new GetGroupCommand({ GroupName: "Readers" }),
    );
    const forUser = await client.send(
      new ListGroupsForUserCommand({ UserName: "member" }),
    );

    // Then both arrive as their structures
    assertIdentical(group.Group?.GroupName, "Readers");
    assertArrayEquals(
      (group.Users ?? []).map((user) => user.UserName),
      ["member"],
    );
    assertArrayEquals(
      (forUser.Groups ?? []).map((each) => each.GroupName),
      ["Readers"],
    );
  });

  it("serves a User's policies and access keys", async () => {
    // Given a User with an inline policy and an access key
    await client.send(new CreateUserCommand({ UserName: "keyholder" }));
    await client.send(
      new PutUserPolicyCommand({
        UserName: "keyholder",
        PolicyName: "read",
        PolicyDocument: allow("s3:GetObject"),
      }),
    );
    const { AccessKey } = await client.send(
      new CreateAccessKeyCommand({ UserName: "keyholder" }),
    );
    assertNonNullable(AccessKey?.AccessKeyId);

    // When its policy is read, its policies and keys listed, and the key
    // deleted
    const policy = await client.send(
      new GetUserPolicyCommand({ UserName: "keyholder", PolicyName: "read" }),
    );
    const names = await client.send(
      new ListUserPoliciesCommand({ UserName: "keyholder" }),
    );
    const keys = await client.send(
      new ListAccessKeysCommand({ UserName: "keyholder" }),
    );
    await client.send(
      new DeleteAccessKeyCommand({
        UserName: "keyholder",
        AccessKeyId: AccessKey.AccessKeyId,
      }),
    );
    const users = await client.send(new ListUsersCommand({}));
    const user = await client.send(
      new GetUserCommand({ UserName: "keyholder" }),
    );
    await client.send(
      new CreateLoginProfileCommand({
        UserName: "keyholder",
        Password: "correct-horse-battery",
      }),
    );
    const profile = await client.send(
      new GetLoginProfileCommand({ UserName: "keyholder" }),
    );

    // Then each arrives as what it is
    assertIdentical(
      decodeURIComponent(policy.PolicyDocument ?? ""),
      allow("s3:GetObject"),
    );
    assertArrayEquals(names.PolicyNames ?? [], ["read"]);
    assertIdentical(keys.AccessKeyMetadata?.[0]?.Status, "Active");
    assertArrayIncludes(
      (users.Users ?? []).map((each) => each.UserName),
      "keyholder",
    );
    assertIdentical(user.User?.UserName, "keyholder");
    assertIdentical(profile.LoginProfile?.UserName, "keyholder");
  });

  it("serves managed policy versions", async () => {
    // Given a managed policy
    const { Policy } = await client.send(
      new CreatePolicyCommand({
        PolicyName: "Versioned",
        PolicyDocument: allow("s3:GetObject"),
      }),
    );
    assertNonNullable(Policy?.Arn);

    // When a second version is created as the default, and the versions listed
    const created = await client.send(
      new CreatePolicyVersionCommand({
        PolicyArn: Policy.Arn,
        PolicyDocument: allow("s3:PutObject"),
        SetAsDefault: true,
      }),
    );
    const listed = await client.send(
      new ListPolicyVersionsCommand({ PolicyArn: Policy.Arn }),
    );

    // Then the flag arrives as a boolean, and both versions are listed
    assertTrue(created.PolicyVersion?.IsDefaultVersion ?? false);
    assertArrayEquals(
      (listed.Versions ?? []).map((version) => version.VersionId),
      ["v2", "v1"],
    );
  });

  it("serves UpdateRole with its maximum session as a number", async () => {
    // Given a Role
    await simAws.iam().createRole({
      input: {
        RoleName: "Updated",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      },
    });

    // When its maximum session is raised over the endpoint
    await client.send(
      new UpdateRoleCommand({ RoleName: "Updated", MaxSessionDuration: 7200 }),
    );

    // Then the Role carries it
    assertIdentical(
      simAws.iam().roles.get("Updated" as SimIamRoleName)?.maxSessionDuration,
      7200,
    );
  });

  it("refuses an IAM operation it does not serve", async () => {
    // When an operation simulated IAM has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new CreateOpenIDConnectProviderCommand({
            Url: "https://idp.example.com",
          }),
        ),
    );

    // Then it is refused by name, in the shape the Query protocol states an
    // error, so an SDK raises it rather than failing to parse the response
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "CreateOpenIDConnectProvider");
  });
});
