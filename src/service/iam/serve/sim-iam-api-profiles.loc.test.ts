import {
  AddRoleToInstanceProfileCommand,
  CreateGroupCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  CreateUserCommand,
  DeleteInstanceProfileCommand,
  GetAccountSummaryCommand,
  GetGroupCommand,
  GetInstanceProfileCommand,
  GetUserCommand,
  IAMClient,
  ListInstanceProfilesCommand,
  ListInstanceProfilesForRoleCommand,
  RemoveRoleFromInstanceProfileCommand,
  UpdateGroupCommand,
  UpdateUserCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { servedUserCredentials } from "../../../../test/serve/served-credentials.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * The IAM instance profile, rename and Account summary commands, reached over
 * a port by a real client.
 */
describe("Serving simulated IAM instance profiles, renames and quotas", () => {
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

  it("serves instance profiles and the Role each holds", async () => {
    // Given an instance profile holding a Role, with a tag
    await client.send(
      new CreateRoleCommand({
        RoleName: "Worker",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await client.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: "Workers",
        Tags: [{ Key: "team", Value: "batch" }],
      }),
    );
    await client.send(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: "Workers",
        RoleName: "Worker",
      }),
    );

    // When it is read, listed and listed for its Role
    const { InstanceProfile } = await client.send(
      new GetInstanceProfileCommand({ InstanceProfileName: "Workers" }),
    );
    const listed = await client.send(new ListInstanceProfilesCommand({}));
    const forRole = await client.send(
      new ListInstanceProfilesForRoleCommand({ RoleName: "Worker" }),
    );

    // Then each describes the profile with its Role and tag
    assertNonNullable(InstanceProfile);
    assertArrayEquals(
      InstanceProfile.Roles?.map((role) => role.RoleName) ?? [],
      ["Worker"],
    );
    assertIdentical(InstanceProfile.Tags?.[0]?.Value, "batch");
    assertIdentical(listed.InstanceProfiles?.length, 1);
    assertIdentical(
      forRole.InstanceProfiles?.[0]?.InstanceProfileName,
      "Workers",
    );

    // And the Role comes out, and the profile is deleted
    await client.send(
      new RemoveRoleFromInstanceProfileCommand({
        InstanceProfileName: "Workers",
        RoleName: "Worker",
      }),
    );
    await client.send(
      new DeleteInstanceProfileCommand({ InstanceProfileName: "Workers" }),
    );
  });

  it("serves renaming a User and a group", async () => {
    // Given a User and a group
    await client.send(new CreateUserCommand({ UserName: "renamed-before" }));
    await client.send(new CreateGroupCommand({ GroupName: "team-before" }));

    // When both are renamed
    await client.send(
      new UpdateUserCommand({
        UserName: "renamed-before",
        NewUserName: "renamed-after",
      }),
    );
    await client.send(
      new UpdateGroupCommand({
        GroupName: "team-before",
        NewGroupName: "team-after",
        NewPath: "/teams/",
      }),
    );

    // Then each answers to its new name
    const { User } = await client.send(
      new GetUserCommand({ UserName: "renamed-after" }),
    );
    const { Group } = await client.send(
      new GetGroupCommand({ GroupName: "team-after" }),
    );
    assertIdentical(User?.UserName, "renamed-after");
    assertIdentical(Group?.Path, "/teams/");
  });

  it("serves the Account summary", async () => {
    // Given an Account holding the bootstrap User

    // When its summary is asked for
    const { SummaryMap } = await client.send(new GetAccountSummaryCommand({}));

    // Then it reports the quotas as numbers
    assertNonNullable(SummaryMap);
    assertIdentical(SummaryMap.RolesQuota, 1000);
    assertIdentical(SummaryMap.GroupsPerUserQuota, 10);
  });
});
