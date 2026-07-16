import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
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

describe("Route53 ChangeResourceRecordSetsCommand IAM authorization", () => {
  it("allows the default Account root caller and applies the record change", async () => {
    // Given a Hosted Zone in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();

    const createOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "root-write.example.com",
        CallerReference: "root-write-ref",
      }),
    );
    assertNonNullable(createOutput.HostedZone?.Id);

    // When ChangeResourceRecordSets is called without an explicit caller.
    const output = await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT" as const,
              ResourceRecordSet: {
                Name: "test.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "1.2.3.4" }],
              },
            },
          ],
        },
      }),
    );

    // Then IAM defaults to Account root and Route53 accepts the change.
    assertNonNullable(output.ChangeInfo?.Id);
  });

  it("allows a Role to change records only in the Hosted Zone granted by its policy", async () => {
    // Given two Hosted Zones and a Role allowed to change records only in the first.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const allowedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "allowed.example.com",
        CallerReference: "allowed-write-ref",
      }),
    );
    assertNonNullable(allowedOutput.HostedZone?.Id);

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "other.example.com",
        CallerReference: "other-write-ref",
      }),
    );

    const allowedArn = `arn:aws:route53:::hostedzone/${allowedOutput.HostedZone.Id}`;

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "SingleZoneWriter",
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
        RoleName: "SingleZoneWriter",
        PolicyName: "WriteOneHostedZone",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:ChangeResourceRecordSets",
            Resource: allowedArn,
          },
        }),
      }),
    );

    // When the Role changes records in the Hosted Zone named by its policy.
    const output = await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: allowedOutput.HostedZone.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT" as const,
              ResourceRecordSet: {
                Name: "test.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "1.2.3.4" }],
              },
            },
          ],
        },
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM permits the specific ARN and Route53 accepts the change.
    assertNonNullable(output.ChangeInfo?.Id);
  });

  it("implicitly denies a Role when its policy grants a different Hosted Zone ARN", async () => {
    // Given a Role allowed to change one Hosted Zone while another exists.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simRoute53 = simAws.account(accountId).route53();

    const allowedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "permitted.example.com",
        CallerReference: "permitted-write-ref",
      }),
    );
    assertNonNullable(allowedOutput.HostedZone?.Id);

    const deniedOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "restricted.example.com",
        CallerReference: "restricted-write-ref",
      }),
    );
    assertNonNullable(deniedOutput.HostedZone?.Id);

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DifferentZoneWriter",
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
        RoleName: "DifferentZoneWriter",
        PolicyName: "WritePermittedHostedZone",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "route53:ChangeResourceRecordSets",
            Resource: allowedArn,
          },
        }),
      }),
    );

    // When the Role tries to change records in the Hosted Zone not in its policy.
    const deniedArn = `arn:aws:route53:::hostedzone/${deniedOutput.HostedZone.Id}`;
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: deniedOutput.HostedZone?.Id,
          ChangeBatch: {
            Changes: [
              {
                Action: "UPSERT" as const,
                ResourceRecordSet: {
                  Name: "test.example.com",
                  Type: "A",
                  TTL: 300,
                  ResourceRecords: [{ Value: "1.2.3.4" }],
                },
              },
            ],
          },
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM denies the requested action against that specific Hosted Zone ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:ChangeResourceRecordSets");
    assertIdentical(error.resource, deniedArn);
  });

  it("does not reveal a missing Hosted Zone to an unauthorized anonymous caller", async () => {
    // Given Route53 in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simRoute53 = simAws.account(accountId).route53();
    const missingId = "Z000000000000000000001";
    const missingArn = `arn:aws:route53:::hostedzone/${missingId}`;

    // When an anonymous caller tries to change records in a non-existent Hosted Zone.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: missingId,
          ChangeBatch: {
            Changes: [
              {
                Action: "UPSERT" as const,
                ResourceRecordSet: {
                  Name: "test.example.com",
                  Type: "A",
                  TTL: 300,
                  ResourceRecords: [{ Value: "1.2.3.4" }],
                },
              },
            ],
          },
        }),
        { caller: { kind: "anonymous" } },
      ),
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
        CallerReference: "standalone-write-ref",
      }),
    );
    assertNonNullable(createOutput.HostedZone?.Id);

    // When an anonymous caller changes records through standalone SimRoute53.
    const output = await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT" as const,
              ResourceRecordSet: {
                Name: "test.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "1.2.3.4" }],
              },
            },
          ],
        },
      }),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits the request and Route53 accepts the change.
    assertNonNullable(output.ChangeInfo?.Id);
  });
});
