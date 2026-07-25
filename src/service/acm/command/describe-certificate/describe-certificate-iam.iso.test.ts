import {
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
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
import { SimAcm } from "../../sim-acm.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";

describe("ACM DescribeCertificateCommand IAM authorization", () => {
  it("allows the default Account root caller and returns certificate details", async () => {
    // Given a Certificate in an Account and Region-scoped ACM service.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simAcm = simAws.account(accountId).region(region).acm();

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "root-described.example.com",
        SubjectAlternativeNames: ["www.root-described.example.com"],
      }),
    );
    assertNonNullable(requestOutput.CertificateArn);

    // When DescribeCertificate is called without an explicit caller.
    const output = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
    );

    // Then IAM defaults to Account root and ACM builds the certificate detail.
    assertIdentical(
      output.Certificate?.CertificateArn,
      requestOutput.CertificateArn,
    );
    assertIdentical(
      output.Certificate.DomainName,
      "root-described.example.com",
    );
  });

  it("allows a Role to describe only the Certificate ARN granted by its policy", async () => {
    // Given two Certificates and a Role allowed to describe only the first ARN.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    const allowedCertificate = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "allowed.example.com",
      }),
    );
    assertNonNullable(allowedCertificate.CertificateArn);

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "other.example.com",
      }),
    );

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "SingleCertificateReader",
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
        RoleName: "SingleCertificateReader",
        PolicyName: "DescribeOneCertificate",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:DescribeCertificate",
            Resource: allowedCertificate.CertificateArn,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role describes the Certificate named by its policy.
    const output = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: allowedCertificate.CertificateArn,
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the ARN and ACM returns the matching Certificate detail.
    assertIdentical(
      output.Certificate?.CertificateArn,
      allowedCertificate.CertificateArn,
    );
    assertIdentical(output.Certificate.DomainName, "allowed.example.com");
  });

  it("implicitly denies a Role when its policy grants a different Certificate ARN", async () => {
    // Given a Role allowed to describe one Certificate while another Certificate exists.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(makeAwsRegionName()).acm();

    const allowedCertificate = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "permitted.example.com",
      }),
    );
    assertNonNullable(allowedCertificate.CertificateArn);

    const deniedCertificate = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "restricted.example.com",
      }),
    );
    assertNonNullable(deniedCertificate.CertificateArn);

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DifferentCertificateReader",
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
        RoleName: "DifferentCertificateReader",
        PolicyName: "DescribePermittedCertificate",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:DescribeCertificate",
            Resource: allowedCertificate.CertificateArn,
          },
        }),
      }),
    );

    // When the Role describes the Certificate not named by its policy.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({
          CertificateArn: deniedCertificate.CertificateArn,
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the requested action against that specific Certificate ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "acm:DescribeCertificate");
    assertIdentical(error.resource, deniedCertificate.CertificateArn);
  });

  it("implicitly denies a Role when its policy condition does not match", async () => {
    // Given a Role with a matching action and Certificate ARN but a mismatched principal condition.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(makeAwsRegionName()).acm();

    const certificate = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "condition-denied.example.com",
      }),
    );
    assertNonNullable(certificate.CertificateArn);

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchCertificateReader",
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
        RoleName: "ConditionMismatchCertificateReader",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:DescribeCertificate",
            Resource: certificate.CertificateArn,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role describes the otherwise authorized Certificate.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({
          CertificateArn: certificate.CertificateArn,
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the condition mismatch causes an implicit access denial.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "arn");
    assertIdentical(error.action, "acm:DescribeCertificate");
  });

  it("lets an explicit Deny override a wildcard Allow while another Certificate remains readable", async () => {
    // Given two Certificates and a Role denied one ARN despite a wildcard Allow.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simAcm = simAws.account(accountId).region(region).acm();

    const deniedCertificate = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "protected.example.com",
      }),
    );
    assertNonNullable(deniedCertificate.CertificateArn);

    const allowedCertificate = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "public.example.com",
      }),
    );
    assertNonNullable(allowedCertificate.CertificateArn);

    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "RestrictedCertificateReader",
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
        RoleName: "RestrictedCertificateReader",
        PolicyName: "RestrictedCertificateReads",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "acm:DescribeCertificate",
              Resource: "*",
            },
            {
              Effect: "Deny",
              Action: "acm:DescribeCertificate",
              Resource: deniedCertificate.CertificateArn,
            },
          ],
        }),
      }),
    );

    // When the Role describes the explicitly denied Certificate.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({
          CertificateArn: deniedCertificate.CertificateArn,
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then the explicit Deny wins.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.resource, deniedCertificate.CertificateArn);

    // And the broader Allow still permits ACM detail generation for another Certificate.
    const output = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: allowedCertificate.CertificateArn,
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );
    assertIdentical(output.Certificate?.DomainName, "public.example.com");
  });

  it("does not reveal a missing Certificate to an unauthorized anonymous caller", async () => {
    // Given ACM in an Account where an omitted caller would default to root.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simAcm = simAws.account(accountId).region(region).acm();
    const missingCertificateArn = `arn:aws:acm:${region}:${accountId}:certificate/missing`;

    // When an anonymous caller describes a Certificate ARN that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.describeCertificate(
        new DescribeCertificateCommand({
          CertificateArn: missingCertificateArn,
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then authorization fails before ACM can reveal that the Certificate is absent.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.resource, missingCertificateArn);
  });

  it("uses allow-all authorization when SimAcm is instantiated directly", async () => {
    // Given a directly constructed ACM service with no IAM implementation supplied.
    const simAcm = new SimAcm();

    const requestOutput = await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "standalone.example.com",
      }),
    );
    assertNonNullable(requestOutput.CertificateArn);

    // When an anonymous caller describes the Certificate through standalone SimAcm.
    const output = await simAcm.describeCertificate(
      new DescribeCertificateCommand({
        CertificateArn: requestOutput.CertificateArn,
      }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits the request and ACM returns the detail.
    assertIdentical(output.Certificate?.DomainName, "standalone.example.com");
  });
});
