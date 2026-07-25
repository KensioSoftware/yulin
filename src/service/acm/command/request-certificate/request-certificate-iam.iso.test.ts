import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimAcm } from "../../sim-acm.js";

describe("ACM RequestCertificateCommand IAM authorization", () => {
  it("allows the default Account root caller and stores the Certificate", async () => {
    // Given ACM in a known simulated Account and Region.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simAcm = simAws.account(accountId).region(region).acm();

    // When a Certificate is requested without an explicit caller.
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "root-requested.example.com",
      }),
    );

    // Then IAM defaults to Account root and ACM exposes the stored Certificate.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand(),
    );
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "root-requested.example.com",
    );
  });

  it("allows a Role when its action, wildcard Certificate resource, and condition match", async () => {
    // Given a Role allowed to request Certificates in one Account and Region.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalCertificateRequester",
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
        RoleName: "ConditionalCertificateRequester",
        PolicyName: "RequestConditionalCertificate",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:RequestCertificate",
            Resource: `arn:aws:acm:${region}:${accountId}:certificate/*`,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role requests a Certificate in the authorized Account and Region.
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "role-requested.example.com",
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the request and ACM makes the Certificate available.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand(),
    );
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "role-requested.example.com",
    );
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role with the correct action and resource but another principal's condition.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchCertificateRequester",
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
        RoleName: "ConditionMismatchCertificateRequester",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:RequestCertificate",
            Resource: `arn:aws:acm:${region}:${accountId}:certificate/*`,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role requests an otherwise authorized Certificate.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.requestCertificate(
        new RequestCertificateCommand({
          DomainName: "condition-denied.example.com",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the request and ACM does not create Certificate state.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "acm:RequestCertificate");
    assertIdentical(error.caller.kind, "arn");

    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand(),
    );
    assertArrayLength(listOutput.CertificateSummaryList, 0);
  });

  it("lets an explicit Deny override an Allow without allocating a Certificate", async () => {
    // Given a Role with both Allow and Deny statements for certificate requests.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedCertificateRequester",
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
    const resource = `arn:aws:acm:${region}:${accountId}:certificate/*`;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DeniedCertificateRequester",
        PolicyName: "ConflictingCertificateRequest",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "acm:RequestCertificate",
              Resource: resource,
            },
            {
              Effect: "Deny",
              Action: "acm:RequestCertificate",
              Resource: resource,
            },
          ],
        }),
      }),
    );

    // When the Role requests a Certificate.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.requestCertificate(
        new RequestCertificateCommand({
          DomainName: "explicitly-denied.example.com",
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins and reports the Account and Region wildcard ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "acm:RequestCertificate");
    assertIdentical(error.resource, resource);

    // And a permitted root request still reaches ACM certificate storage.
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "root-permitted.example.com",
      }),
    );

    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand(),
    );
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "root-permitted.example.com",
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given ACM in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simAcm = simAws.account(accountId).region(region).acm();

    // When an explicitly anonymous caller requests a Certificate.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.requestCertificate(
        new RequestCertificateCommand({
          DomainName: "anonymous-denied.example.com",
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity, denies access, and ACM stores nothing.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);

    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand(),
    );
    assertArrayLength(listOutput.CertificateSummaryList, 0);
  });

  it("uses allow-all authorization when SimAcm is instantiated directly", async () => {
    // Given standalone ACM with no supplied IAM implementation.
    const simAcm = new SimAcm();

    // When an anonymous caller requests a Certificate through standalone ACM.
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "standalone.example.com",
      }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits the request and ACM retains its state.
    const listOutput = await simAcm.listCertificates(
      new ListCertificatesCommand(),
    );
    assertArrayLength(listOutput.CertificateSummaryList, 1);
    assertIdentical(
      listOutput.CertificateSummaryList[0].DomainName,
      "standalone.example.com",
    );
  });
});
