import {
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
} from "@aws-sdk/client-route-53";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimRoute53 } from "../../sim-route53.js";

describe("Route53 ListHostedZonesByNameCommand IAM authorization", () => {
  it("allows the default Account root caller and returns hosted zones", async () => {
    // Given a Hosted Zone in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "root-listed.example.com",
        CallerReference: "root-listed-ref",
      }),
    );

    // When ListHostedZonesByName is called without an explicit caller.
    const output = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
    );

    // Then IAM defaults to Account root and Route53 returns the listing.
    assertArrayLength(output.HostedZones, 1);
    assertIdentical(output.HostedZones[0].Name, "root-listed.example.com.");
  });

  it("allows a Role when its action and wildcard resource match", async () => {
    // Given a Role allowed to list hosted zones.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "role-listed.example.com",
        CallerReference: "role-listed-ref",
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "HostedZoneLister",
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
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "HostedZoneLister",
        PolicyName: "ListHostedZones",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:ListHostedZonesByName",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role lists hosted zones.
    const output = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM permits the request and Route53 returns the full listing.
    assertArrayLength(output.HostedZones, 1);
    assertIdentical(output.HostedZones[0].Name, "role-listed.example.com.");
  });

  it("implicitly denies a Role when its principal condition does not match", async () => {
    // Given a Role with a ListHostedZonesByName policy conditioned on a different principal.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "condition-denied.example.com",
        CallerReference: "condition-denied-ref",
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchHostedZoneLister",
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
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchHostedZoneLister",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:ListHostedZonesByName",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to list hosted zones.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.listHostedZonesByName(new ListHostedZonesByNameCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM denies the request with the wildcard resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:ListHostedZonesByName");
    assertIdentical(error.resource, "*");
  });

  it("lets an explicit Deny override an Allow without returning a listing", async () => {
    // Given a Role with both Allow and Deny statements for listing hosted zones.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "explicitly-denied.example.com",
        CallerReference: "explicitly-denied-ref",
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedHostedZoneLister",
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
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DeniedHostedZoneLister",
        PolicyName: "ConflictingListHostedZones",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "route53:ListHostedZonesByName",
              Resource: "*",
            },
            {
              Effect: "Deny",
              Action: "route53:ListHostedZonesByName",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to list hosted zones.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.listHostedZonesByName(new ListHostedZonesByNameCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the explicit Deny wins and no listing is returned.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:ListHostedZonesByName");
    assertIdentical(error.resource, "*");

    // And the Account root can still list hosted zones in the same service.
    const output = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
    );
    assertArrayLength(output.HostedZones, 1);
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given Route53 in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();

    // When an explicitly anonymous caller attempts to list hosted zones.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.listHostedZonesByName(new ListHostedZonesByNameCommand(), {
        caller: { kind: "anonymous" },
      }),
    );

    // Then IAM preserves anonymity and denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });

  it("uses allow-all authorization when SimRoute53 is instantiated directly", async () => {
    // Given standalone Route53 with no supplied IAM implementation.
    const simRoute53 = new SimRoute53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "standalone.example.com",
        CallerReference: "standalone-ref",
      }),
    );

    // When an anonymous caller lists hosted zones through the standalone service.
    const output = await simRoute53.listHostedZonesByName(
      new ListHostedZonesByNameCommand(),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits the request and Route53 returns the listing.
    assertArrayLength(output.HostedZones, 1);
    assertIdentical(output.HostedZones[0].Name, "standalone.example.com.");
  });
});
