import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimRoute53 } from "../../sim-route53.js";

describe("Route53 CreateHostedZoneCommand IAM authorization", () => {
  it("allows the default Account root caller and stores the Hosted Zone", async () => {
    // Given Route53 in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();

    // When a Hosted Zone is created without an explicit caller.
    const output = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "root-created.example.com",
        CallerReference: "root-created-ref",
      }),
    );

    // Then IAM defaults to Account root and Route53 stores the Hosted Zone.
    assertNonNullable(output.HostedZone?.Id);
    assertMapSize(simRoute53.hostedZones, 1);
    assertIdentical(output.HostedZone.Name, "root-created.example.com.");
  });

  it("allows a Role when its action, wildcard resource, and principal condition match", async () => {
    // Given a Role conditionally allowed to create Hosted Zones.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalHostedZoneCreator",
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
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionalHostedZoneCreator",
        PolicyName: "CreateConditionalHostedZone",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:CreateHostedZone",
            Resource: "arn:aws:route53:::hostedzone/*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role creates a Hosted Zone through the Route53 boundary.
    const output = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "role-created.example.com",
        CallerReference: "role-created-ref",
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the request and Route53 stores the Hosted Zone.
    assertNonNullable(output.HostedZone?.Id);
    assertMapSize(simRoute53.hostedZones, 1);
  });

  it("implicitly denies a Role when its principal condition does not match", async () => {
    // Given a Role with a CreateHostedZone policy conditioned on a different principal.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchHostedZoneCreator",
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
    const roleArn = roleCreation.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchHostedZoneCreator",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:CreateHostedZone",
            Resource: "arn:aws:route53:::hostedzone/*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to create a Hosted Zone.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.createHostedZone(
        new CreateHostedZoneCommand({
          Name: "condition-denied.example.com",
          CallerReference: "condition-denied-ref",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the request before Route53 allocates any state.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:CreateHostedZone");
    assertIdentical(error.resource, "arn:aws:route53:::hostedzone/*");
    assertMapSize(simRoute53.hostedZones, 0);
  });

  it("applies an explicit Deny before creating Route53 state", async () => {
    // Given a Role allowed to create Hosted Zones but explicitly denied.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedHostedZoneCreator",
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
    const roleArn = roleCreation.Role.Arn;
    const resource = "arn:aws:route53:::hostedzone/*";

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DeniedHostedZoneCreator",
        PolicyName: "ConflictingHostedZoneCreation",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "route53:CreateHostedZone",
              Resource: resource,
            },
            {
              Effect: "Deny",
              Action: "route53:CreateHostedZone",
              Resource: resource,
            },
          ],
        }),
      }),
    );

    // When the Role requests to create a Hosted Zone.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.createHostedZone(
        new CreateHostedZoneCommand({
          Name: "explicitly-denied.example.com",
          CallerReference: "explicitly-denied-ref",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins and Route53 allocates no state.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:CreateHostedZone");
    assertIdentical(error.resource, resource);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: route53:CreateHostedZone on resource: ${resource}`,
    );
    assertMapSize(simRoute53.hostedZones, 0);

    // And a permitted root caller can still create a Hosted Zone in the same service.
    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "root-permitted.example.com",
        CallerReference: "root-permitted-ref",
      }),
    );
    assertMapSize(simRoute53.hostedZones, 1);
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given Route53 in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();

    // When an explicitly anonymous caller attempts to create a Hosted Zone.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.createHostedZone(
        new CreateHostedZoneCommand({
          Name: "anonymous-denied.example.com",
          CallerReference: "anonymous-denied-ref",
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity, denies access, and Route53 retains no state.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertMapSize(simRoute53.hostedZones, 0);

    // And the same name can still be created by the default root caller.
    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "anonymous-denied.example.com",
        CallerReference: "anonymous-denied-ref",
      }),
    );
    assertMapSize(simRoute53.hostedZones, 1);
  });

  it("uses allow-all authorization when SimRoute53 is instantiated directly", async () => {
    // Given standalone Route53 with no supplied IAM implementation.
    const simRoute53 = new SimRoute53();

    // When an anonymous caller creates a Hosted Zone through the standalone service.
    const output = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "standalone.example.com",
        CallerReference: "standalone-ref",
      }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits creation and Route53 retains the Hosted Zone.
    assertNonNullable(output.HostedZone?.Id);
    assertMapSize(simRoute53.hostedZones, 1);
  });
});
