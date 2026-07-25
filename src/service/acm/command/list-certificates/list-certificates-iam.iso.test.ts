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
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimAcm } from "../../sim-acm.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

describe("ACM ListCertificatesCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given a Certificate in an Account and Region-scoped ACM service.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simAcm = simAws.account(accountId).region(region).acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "root-listed.example.com",
      }),
    );

    // When ListCertificates is called without an explicit caller.
    const output = await simAcm.listCertificates(new ListCertificatesCommand());

    // Then IAM defaults to Account root and ACM returns the Certificate.
    assertArrayLength(output.CertificateSummaryList, 1);
    assertIdentical(
      output.CertificateSummaryList[0].DomainName,
      "root-listed.example.com",
    );
  });

  it("allows a Role when its action, resource, and condition match", async () => {
    // Given a Role allowed to list Certificates when its principal ARN matches.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "first.example.com",
      }),
    );
    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "second.example.com",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "CertificateLister",
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
        RoleName: "CertificateLister",
        PolicyName: "ConditionalCertificateListing",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:ListCertificates",
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

    // When the Role requests two status-filtered pages of Certificates.
    const firstPage = await simAcm.listCertificates(
      new ListCertificatesCommand({
        CertificateStatuses: ["PENDING_VALIDATION"],
        MaxItems: 1,
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );
    const secondPage = await simAcm.listCertificates(
      new ListCertificatesCommand({
        CertificateStatuses: ["PENDING_VALIDATION"],
        MaxItems: 1,
        NextToken: firstPage.NextToken,
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM allows both requests and ACM applies filtering and pagination.
    assertArrayLength(firstPage.CertificateSummaryList, 1);
    assertIdentical(
      firstPage.CertificateSummaryList[0].DomainName,
      "first.example.com",
    );
    assertArrayLength(secondPage.CertificateSummaryList, 1);
    assertIdentical(
      secondPage.CertificateSummaryList[0].DomainName,
      "second.example.com",
    );
  });

  it("implicitly denies a Certificate-scoped ListCertificates permission", async () => {
    // Given a Role whose ListCertificates policy uses a Certificate ARN instead of "*".
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "resource-scoped.example.com",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "CertificateScopedLister",
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
        RoleName: "CertificateScopedLister",
        PolicyName: "CertificateScopedListing",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:ListCertificates",
            Resource: `arn:aws:acm:eu-central-1:${accountId}:certificate/00000001`,
          },
        }),
      }),
    );

    // When the Role attempts the account and Region-level listing operation.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(new ListCertificatesCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the Certificate ARN does not match the required "*" resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "acm:ListCertificates");
    assertIdentical(error.resource, "*");
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role with the correct action and resource but a mismatched condition.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "condition-denied.example.com",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchCertificateLister",
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
        RoleName: "ConditionMismatchCertificateLister",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:ListCertificates",
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

    // When the Role attempts to list Certificates.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(new ListCertificatesCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the condition mismatch causes an implicit access denial.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "arn");
    assertIdentical(error.action, "acm:ListCertificates");
  });

  it("lets an explicit Deny override an Allow", async () => {
    // Given a Role with both Allow and Deny statements for ListCertificates.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "explicitly-denied.example.com",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedCertificateLister",
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
        RoleName: "DeniedCertificateLister",
        PolicyName: "ConflictingCertificateListing",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "acm:ListCertificates",
              Resource: "*",
            },
            {
              Effect: "Deny",
              Action: "acm:ListCertificates",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to list the Account and Region's Certificates.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(new ListCertificatesCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the explicit Deny wins and reports the IAM action and resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: acm:ListCertificates on resource: *`,
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given an Account and Region-scoped ACM service containing a Certificate.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simAcm = simAws.account(accountId).region(region).acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "anonymous-denied.example.com",
      }),
    );

    // When an explicitly anonymous caller attempts to list Certificates.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(new ListCertificatesCommand(), {
        caller: { kind: "anonymous" },
      }),
    );

    // Then IAM preserves anonymity and returns an access-denied response.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });

  it("uses allow-all authorization when SimAcm is instantiated directly", async () => {
    // Given a directly constructed ACM service with no IAM implementation supplied.
    const simAcm = new SimAcm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "standalone.example.com",
      }),
    );

    // When an anonymous caller lists Certificates through the standalone service.
    const output = await simAcm.listCertificates(
      new ListCertificatesCommand(),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits the request and ACM returns its state.
    assertArrayLength(output.CertificateSummaryList, 1);
    assertIdentical(
      output.CertificateSummaryList[0].DomainName,
      "standalone.example.com",
    );
  });
});
