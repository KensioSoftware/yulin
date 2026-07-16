import {
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimRoute53 } from "../../sim-route53.js";

describe("Route53 GetHostedZoneCommand IAM authorization", () => {
  it("allows the default Account root caller and returns hosted zone details", async () => {
    // Given a Hosted Zone in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();

    const createOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "root-read.example.com",
        CallerReference: "root-read-ref",
      }),
    );
    assertNonNullable(createOutput.HostedZone?.Id);

    // When GetHostedZone is called without an explicit caller.
    const output = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: createOutput.HostedZone.Id }),
    );

    // Then IAM defaults to Account root and Route53 returns the Hosted Zone details.
    assertIdentical(output.HostedZone?.Id, createOutput.HostedZone.Id);
    assertIdentical(output.HostedZone.Name, "root-read.example.com.");
  });

  it("allows a Role to get only the Hosted Zone ARN granted by its policy", async () => {
    // Given two Hosted Zones and a Role allowed to get only the first.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const allowedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "allowed.example.com",
        CallerReference: "allowed-ref",
      }),
    );
    assertNonNullable(allowedOutput.HostedZone?.Id);

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "other.example.com",
        CallerReference: "other-ref",
      }),
    );

    const allowedArn = `arn:aws:route53:::hostedzone/${allowedOutput.HostedZone.Id}`;

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "SingleHostedZoneReader",
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
        RoleName: "SingleHostedZoneReader",
        PolicyName: "GetOneHostedZone",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:GetHostedZone",
            Resource: allowedArn,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role gets the Hosted Zone named by its policy.
    const output = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: allowedOutput.HostedZone.Id }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM permits the specific ARN and Route53 returns the matching details.
    assertIdentical(output.HostedZone?.Id, allowedOutput.HostedZone.Id);
    assertIdentical(output.HostedZone.Name, "allowed.example.com.");
  });

  it("implicitly denies a Role when its policy grants a different Hosted Zone ARN", async () => {
    // Given a Role allowed to get one Hosted Zone while another exists.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const allowedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "permitted.example.com",
        CallerReference: "permitted-ref",
      }),
    );
    assertNonNullable(allowedOutput.HostedZone?.Id);

    const deniedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "restricted.example.com",
        CallerReference: "restricted-ref",
      }),
    );
    assertNonNullable(deniedOutput.HostedZone?.Id);

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DifferentHostedZoneReader",
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

    const allowedArn = `arn:aws:route53:::hostedzone/${allowedOutput.HostedZone.Id}`;
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DifferentHostedZoneReader",
        PolicyName: "GetPermittedHostedZone",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:GetHostedZone",
            Resource: allowedArn,
          },
        }),
      }),
    );

    // When the Role gets the Hosted Zone not named by its policy.
    const deniedArn = `arn:aws:route53:::hostedzone/${deniedOutput.HostedZone.Id}`;
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.getHostedZone(
        new GetHostedZoneCommand({ Id: deniedOutput.HostedZone?.Id }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM denies the requested action against that specific Hosted Zone ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:GetHostedZone");
    assertIdentical(error.resource, deniedArn);
  });

  it("lets an explicit Deny override a wildcard Allow while another Hosted Zone remains readable", async () => {
    // Given two Hosted Zones and a Role denied one ARN despite a wildcard Allow.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const deniedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "protected.example.com",
        CallerReference: "protected-ref",
      }),
    );
    assertNonNullable(deniedOutput.HostedZone?.Id);

    const allowedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "public.example.com",
        CallerReference: "public-ref",
      }),
    );
    assertNonNullable(allowedOutput.HostedZone?.Id);

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedHostedZoneReader",
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

    const deniedArn = `arn:aws:route53:::hostedzone/${deniedOutput.HostedZone.Id}`;
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "RestrictedHostedZoneReader",
        PolicyName: "RestrictedHostedZoneReads",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "route53:GetHostedZone",
              Resource: "arn:aws:route53:::hostedzone/*",
            },
            {
              Effect: "Deny",
              Action: "route53:GetHostedZone",
              Resource: deniedArn,
            },
          ],
        }),
      }),
    );

    // When the Role gets the explicitly denied Hosted Zone.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.getHostedZone(
        new GetHostedZoneCommand({ Id: deniedOutput.HostedZone?.Id }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then the explicit Deny wins.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, deniedArn);

    // And the broader Allow still permits reads on the other Hosted Zone.
    const output = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: allowedOutput.HostedZone.Id }),
      { caller: { kind: "arn", arn: roleArn } },
    );
    assertIdentical(output.HostedZone?.Name, "public.example.com.");
  });

  it("does not reveal a missing Hosted Zone to an unauthorized anonymous caller", async () => {
    // Given Route53 in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();
    const missingId = "Z000000000000000000001";
    const missingArn = `arn:aws:route53:::hostedzone/${missingId}`;

    // When an anonymous caller gets a Hosted Zone ID that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.getHostedZone(new GetHostedZoneCommand({ Id: missingId }), {
        caller: { kind: "anonymous" },
      }),
    );

    // Then authorization fails before Route53 can reveal that the Hosted Zone is absent.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.resource, missingArn);
  });

  it("uses allow-all authorization when SimRoute53 is instantiated directly", async () => {
    // Given standalone Route53 with no supplied IAM implementation.
    const simRoute53 = new SimRoute53();

    const createOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "standalone.example.com",
        CallerReference: "standalone-ref",
      }),
    );
    assertNonNullable(createOutput.HostedZone?.Id);

    // When an anonymous caller gets the Hosted Zone through standalone SimRoute53.
    const output = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: createOutput.HostedZone.Id }),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits the request and Route53 returns the details.
    assertIdentical(output.HostedZone?.Name, "standalone.example.com.");
  });
});
