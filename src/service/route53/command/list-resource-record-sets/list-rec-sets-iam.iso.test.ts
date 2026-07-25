import {
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
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
import { makeSimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";

async function createRoleWithPolicy(
  simAws: SimAws,
  accountId: string,
  roleName: string,
  policyDocument: (roleArn: string) => object,
): Promise<string> {
  const simIam = simAws.account(accountId).iam();

  const createRoleOutput = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: roleName,
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
  const policyDocumentJson = JSON.stringify(policyDocument(roleArn));

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "ListRecordSets",
      PolicyDocument: policyDocumentJson,
    }),
  );

  return roleArn;
}

describe("Route53 ListResourceRecordSetsCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given a Hosted Zone in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const route53 = simAws.account(accountId).route53();

    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "root-records.test",
        CallerReference: "root-records-ref",
      }),
    );
    const hostedZoneId = createOutput.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Hosted Zone ID");

    // When record sets are listed without an explicit caller.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );

    // Then IAM defaults to Account root and Route53 returns the listing.
    assertArrayLength(output.ResourceRecordSets, 0);
  });

  it("allows a Role granted the specific Hosted Zone ARN", async () => {
    // Given a Role allowed to list record sets in one Hosted Zone.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const route53 = simAws.account(accountId).route53();

    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "role-records.test",
        CallerReference: "role-records-ref",
      }),
    );
    const hostedZoneId = createOutput.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Hosted Zone ID");

    const roleArn = await createRoleWithPolicy(
      simAws,
      accountId,
      "RecordSetLister",
      () => ({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "route53:ListResourceRecordSets",
          Resource: `arn:aws:route53:::hostedzone/${hostedZoneId}`,
        },
      }),
    );

    // When the Role lists record sets in that Hosted Zone.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM permits the request.
    assertArrayLength(output.ResourceRecordSets, 0);
  });

  it("denies a Role granted a different Hosted Zone ARN", async () => {
    // Given a Role allowed to list record sets in some other Hosted Zone.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const route53 = simAws.account(accountId).route53();

    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "other-zone-records.test",
        CallerReference: "other-zone-records-ref",
      }),
    );
    const hostedZoneId = createOutput.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Hosted Zone ID");
    const otherHostedZoneId = makeSimRoute53HostedZoneId();

    const roleArn = await createRoleWithPolicy(
      simAws,
      accountId,
      "OtherZoneRecordSetLister",
      () => ({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "route53:ListResourceRecordSets",
          Resource: `arn:aws:route53:::hostedzone/${otherHostedZoneId}`,
        },
      }),
    );

    // When the Role lists record sets in the Hosted Zone it was not granted.
    const error = await assertThrowsErrorAsync(async () =>
      route53.listResourceRecordSets(
        new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM denies the request against the requested Hosted Zone ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:ListResourceRecordSets");
    assertIdentical(
      error.resource,
      `arn:aws:route53:::hostedzone/${hostedZoneId}`,
    );
  });

  it("denies an unauthorized caller without revealing whether the zone exists", async () => {
    // Given a simulated Route53 with no Hosted Zone for the requested ID.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const route53 = simAws.account(accountId).route53();
    const unknownHostedZoneId = makeSimRoute53HostedZoneId();

    // When an explicitly anonymous caller lists record sets for that ID.
    const error = await assertThrowsErrorAsync(async () =>
      route53.listResourceRecordSets(
        new ListResourceRecordSetsCommand({
          HostedZoneId: unknownHostedZoneId,
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then AccessDenied is returned rather than NoSuchHostedZone.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });

  it("uses allow-all authorization when SimRoute53 is instantiated directly", async () => {
    // Given standalone Route53 with no supplied IAM implementation.
    const simRoute53 = new SimRoute53();

    const createOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "standalone-records.test",
        CallerReference: "standalone-records-ref",
      }),
    );
    const hostedZoneId = createOutput.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Hosted Zone ID");

    // When an anonymous caller lists record sets through the standalone service.
    const output = await simRoute53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits the request.
    assertArrayLength(output.ResourceRecordSets, 0);
  });
});
