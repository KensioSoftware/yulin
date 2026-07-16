import { CreateRoleCommand, ListRolesCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";

describe("IAM ListRolesCommand", () => {
  it("lists IAM Roles through the top-level SimIam service", async () => {
    // Given multiple IAM Roles exist.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    const readRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReadRole",
        Path: "/service-role/",
        Description: "Allows reads",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );
    const writeRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "WriteRole",
        Path: "/application/",
        Description: "Allows writes",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When we list Roles.
    const listRolesOutput = await simIam.listRoles(new ListRolesCommand());

    // Then all stored Roles are returned.
    assertArrayLength(listRolesOutput.Roles, 2);
    assertFalse(listRolesOutput.IsTruncated);
    assertUndefined(listRolesOutput.Marker);

    const listedRoleNames = listRolesOutput.Roles.map(
      (role) => role.RoleName,
    ).toSorted((a, b) => a.localeCompare(b));

    assertIdentical(listedRoleNames[0], "ReadRole");
    assertIdentical(listedRoleNames[1], "WriteRole");

    const readRole = listRolesOutput.Roles.find(
      (role) => role.RoleName === "ReadRole",
    );
    assertNonNullable(readRole);
    assertIdentical(readRole.Arn, readRoleOutput.Role.Arn);
    assertIdentical(readRole.RoleId, readRoleOutput.Role.RoleId);
    assertIdentical(readRole.Path, "/service-role/");
    assertIdentical(readRole.Description, "Allows reads");
    assertIdentical(
      readRole.AssumeRolePolicyDocument,
      readRoleOutput.Role.AssumeRolePolicyDocument,
    );
    assertInstanceOf(readRole.CreateDate, Date);

    const writeRole = listRolesOutput.Roles.find(
      (role) => role.RoleName === "WriteRole",
    );
    assertNonNullable(writeRole);
    assertIdentical(writeRole.Arn, writeRoleOutput.Role.Arn);
    assertIdentical(writeRole.RoleId, writeRoleOutput.Role.RoleId);
    assertIdentical(writeRole.Path, "/application/");
    assertIdentical(writeRole.Description, "Allows writes");
    assertIdentical(
      writeRole.AssumeRolePolicyDocument,
      writeRoleOutput.Role.AssumeRolePolicyDocument,
    );
    assertInstanceOf(writeRole.CreateDate, Date);
  });

  it("filters IAM Roles by path prefix", async () => {
    // Given IAM Roles exist in different paths.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ServiceRole",
        Path: "/service-role/",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ApplicationRole",
        Path: "/application/",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When we list Roles under one path prefix.
    const listRolesOutput = await simIam.listRoles(
      new ListRolesCommand({
        PathPrefix: "/service-role/",
      }),
    );

    // Then only matching Roles are returned.
    assertArrayLength(listRolesOutput.Roles, 1);
    assertIdentical(listRolesOutput.Roles[0].RoleName, "ServiceRole");
    assertIdentical(listRolesOutput.Roles[0].Path, "/service-role/");
    assertFalse(listRolesOutput.IsTruncated);
    assertUndefined(listRolesOutput.Marker);
  });

  it("paginates IAM Roles with markers", async () => {
    // Given more IAM Roles exist than a single requested page can hold.
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "AlphaRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "BetaRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "GammaRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    // When we request the first page.
    const firstPage = await simIam.listRoles(
      new ListRolesCommand({
        MaxItems: 2,
      }),
    );

    // Then the page is truncated and returns a marker.
    assertArrayLength(firstPage.Roles, 2);
    assertTrue(firstPage.IsTruncated);
    assertNonNullable(firstPage.Marker);

    const firstPageRoleNames = firstPage.Roles.map((role) => role.RoleName);

    // When we request the next page with that marker.
    const secondPage = await simIam.listRoles(
      new ListRolesCommand({
        Marker: firstPage.Marker,
        MaxItems: 2,
      }),
    );

    // Then the remaining Roles are returned.
    assertArrayLength(secondPage.Roles, 1);
    assertFalse(secondPage.IsTruncated);
    assertUndefined(secondPage.Marker);

    const allRoleNames = [
      ...firstPageRoleNames,
      ...secondPage.Roles.map((role) => role.RoleName),
    ].toSorted((a, b) => a.localeCompare(b));

    assertIdentical(allRoleNames[0], "AlphaRole");
    assertIdentical(allRoleNames[1], "BetaRole");
    assertIdentical(allRoleNames[2], "GammaRole");
  });

  it("rejects invalid MaxItems values", async () => {
    const simAws = new SimAws();
    const simIam = simAws.iam();

    // When ListRolesCommand is handled with MaxItems below the AWS range, then
    // it rejects instead of returning a truncated page without a usable marker.
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.listRoles(
        new ListRolesCommand({
          MaxItems: 0,
        }),
      );
    });

    assertInstanceOf(error, RangeError);
    assertIdentical(
      error.message,
      "ListRolesCommand.input.MaxItems must be an integer between 1 and 1000",
    );
  });

  it("rejects a stale Marker", async () => {
    const simAws = new SimAws();
    const accountId = makeSimAwsAccountId();
    const simIam = simAws.account(accountId).iam();

    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "CurrentRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          },
        }),
      }),
    );

    const staleMarker = Buffer.from("DeletedRole", "utf8").toString(
      "base64url",
    );

    // When ListRolesCommand is handled with a marker for a Role that is no
    // longer present, then it rejects instead of restarting from the first page.
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.listRoles(
        new ListRolesCommand({
          Marker: staleMarker,
        }),
      );
    });

    assertIdentical(error.name, "InvalidMarkerException");
    assertIdentical(error.message, "ListRolesCommand.input.Marker is invalid");
  });
});
