import {
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
  PutRolePolicyCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamInvalidCredentials } from "../../../iam/credential/error/sim-iam-credential.error.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

describe("ACM ListCertificatesCommand IAM credential authorization", () => {
  it("allows IAM User credentials and paginates only the requested Region's Certificates", async () => {
    // Given two Certificates, another Region's Certificate, and a User allowed to list Certificates.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simAcm = simAws.region("eu-west-1").acm();

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
    await simAws
      .region("eu-west-2")
      .acm()
      .requestCertificate(
        new RequestCertificateCommand({
          DomainName: "other-region.example.com",
        }),
      );

    const userOutput = await simIam.createUser(
      new CreateUserCommand({
        UserName: "CredentialCertificateLister",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "CredentialCertificateLister",
        PolicyName: "ListCertificates",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:ListCertificates",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": userOutput.User.Arn,
              },
            },
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "CredentialCertificateLister",
      }),
    );

    // When the User requests the first filtered page using its access key.
    const firstPage = await simAcm.listCertificates(
      new ListCertificatesCommand({
        CertificateStatuses: ["PENDING_VALIDATION"],
        MaxItems: 1,
      }),
      {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: accessKeyOutput.AccessKey.SecretAccessKey,
          },
        },
      },
    );

    // Then authentication succeeds and ACM builds a page from the requested Region.
    assertArrayLength(firstPage.CertificateSummaryList, 1);
    assertIdentical(
      firstPage.CertificateSummaryList[0].DomainName,
      "first.example.com",
    );
    assertNonNullable(firstPage.NextToken);

    // And the continuation token reaches the next part of the listing simulation.
    const secondPage = await simAcm.listCertificates(
      new ListCertificatesCommand({
        CertificateStatuses: ["PENDING_VALIDATION"],
        MaxItems: 1,
        NextToken: firstPage.NextToken,
      }),
      {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: accessKeyOutput.AccessKey.SecretAccessKey,
          },
        },
      },
    );

    assertArrayLength(secondPage.CertificateSummaryList, 1);
    assertIdentical(
      secondPage.CertificateSummaryList[0].DomainName,
      "second.example.com",
    );
    assertUndefined(secondPage.NextToken);
  });

  it("allows assumed Role credentials through the underlying Role policy", async () => {
    // Given an assumable Role allowed to list Certificates and an ACM Certificate.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simAcm = simAws.region("us-east-1").acm();
    const roleArn = `arn:aws:iam::${accountId}:role/TemporaryCertificateLister`;

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "temporary-session.example.com",
      }),
    );
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TemporaryCertificateLister",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "TemporaryCertificateLister",
        PolicyName: "ListCertificates",
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

    const assumeRoleOutput = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "list-certificates-session",
      }),
    );
    const credentials = assumeRoleOutput.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    // When ACM receives the temporary access key, secret, and session token.
    const output = await simAcm.listCertificates(
      new ListCertificatesCommand(),
      {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretAccessKey,
            sessionToken: credentials.SessionToken,
          },
        },
      },
    );

    // Then the session resolves to the Role policy and ACM returns the Certificate.
    assertArrayLength(output.CertificateSummaryList, 1);
    assertIdentical(
      output.CertificateSummaryList[0].DomainName,
      "temporary-session.example.com",
    );
  });

  it("denies valid User credentials without ListCertificates permission", async () => {
    // Given a valid User access key whose policy permits a different ACM action.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simAcm = simAws.region("eu-central-1").acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "authorization-denied.example.com",
      }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "CertificateReader",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "CertificateReader",
        PolicyName: "DescribeCertificatesOnly",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:DescribeCertificate",
            Resource: `arn:aws:acm:eu-central-1:${accountId}:certificate/00000001`,
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "CertificateReader",
      }),
    );

    // When the authenticated User attempts the ListCertificates operation.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(new ListCertificatesCommand(), {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: accessKeyOutput.AccessKey.SecretAccessKey,
          },
        },
      }),
    );

    // Then authentication succeeds but IAM denies the required list action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "acm:ListCertificates");
    assertIdentical(error.resource, "*");
  });

  it("rejects an incorrect secret before building the Certificate page", async () => {
    // Given an authorized User access key and a Certificate that could be listed.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const simAcm = simAws.region("ap-southeast-1").acm();

    await simAcm.requestCertificate(
      new RequestCertificateCommand({
        DomainName: "credential-protected.example.com",
      }),
    );
    await simIam.createUser(
      new CreateUserCommand({
        UserName: "AuthorizedCertificateLister",
      }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "AuthorizedCertificateLister",
        PolicyName: "ListCertificates",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "acm:ListCertificates",
            Resource: "*",
          },
        }),
      }),
    );
    const accessKeyOutput = await simIam.createAccessKey(
      new CreateAccessKeyCommand({
        UserName: "AuthorizedCertificateLister",
      }),
    );

    // When the registered access key is supplied with an incorrect secret.
    const error = await assertThrowsErrorAsync(async () =>
      simAcm.listCertificates(new ListCertificatesCommand(), {
        caller: {
          kind: "credentials",
          credentials: {
            accessKeyId: accessKeyOutput.AccessKey.AccessKeyId,
            secretAccessKey: "incorrect-secret-access-key",
          },
        },
      }),
    );

    // Then credential authentication fails before authorization or page construction.
    assertInstanceOf(error, SimIamInvalidCredentials);
    assertIdentical(error.reason, "secret-access-key-mismatch");
  });
});
