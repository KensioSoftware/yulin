import {
  CreateUserPoolCommand,
  CreateUserPoolDomainCommand,
  DeleteUserPoolDomainCommand,
  DescribeUserPoolDomainCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

async function simCognitoWithPool(
  cognito = new SimAws({
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider(),
): Promise<SimCognitoWithPool> {
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  return { cognito, userPoolId: created.UserPool.Id };
}

describe("sim Cognito user pool domains", () => {
  it("creates a prefix domain served under the pool's region", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a prefix domain is created for it.
    const created = await cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "myapp-login",
      }),
    );

    // Then it is served under `auth.<region>.amazoncognito.com`, and no
    // CloudFront distribution comes back, as none does for a prefix domain.
    assertUndefined(created.CloudFrontDomain);

    const domain = cognito.findUserPoolDomainInAnyAccount("myapp-login");
    assertNonNullable(domain);
    assertIdentical(
      domain.hostname,
      "myapp-login.auth.eu-west-2.amazoncognito.com",
    );
    assertIdentical(domain.localHostname, "myapp-login.auth.eu-west-2");
  });

  it("describes a domain by its name alone", async () => {
    // Given a pool with a domain.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "myapp-login",
        ManagedLoginVersion: 2,
      }),
    );

    // When it is described, which names no pool.
    const described = await cognito.describeUserPoolDomain(
      new DescribeUserPoolDomainCommand({ Domain: "myapp-login" }),
    );

    // Then the description says which pool and account it belongs to.
    assertObjectMatches(described.DomainDescription, {
      UserPoolId: userPoolId,
      Domain: "myapp-login",
      Status: "ACTIVE",
      ManagedLoginVersion: 2,
      AWSAccountId: "888888888888",
    });
  });

  it("describes a domain nothing holds as an empty description", async () => {
    // Given a simulation with no domains in it.
    const { cognito } = await simCognitoWithPool();

    // When a domain that does not exist is described.
    const described = await cognito.describeUserPoolDomain(
      new DescribeUserPoolDomainCommand({ Domain: "nobodys-domain" }),
    );

    // Then the answer is empty rather than a refusal, as it is on real
    // Cognito.
    assertObjectMatches(described.DomainDescription, {});
    assertUndefined(described.DomainDescription.Domain);
  });

  it("creates a custom domain with the certificate it is served with", async () => {
    // Given a user pool.
    const { cognito, userPoolId } = await simCognitoWithPool();

    // When a custom domain is created for it.
    const created = await cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "auth.example.com",
        CustomDomainConfig: {
          CertificateArn:
            "arn:aws:acm:us-east-1:123456789012:certificate/a1b2c3d4",
        },
      }),
    );

    // Then a CloudFront distribution name comes back, as one does for a custom
    // domain, and the domain answers on the hostname the request chose.
    assertNonNullable(created.CloudFrontDomain);
    assertStringIncludes(created.CloudFrontDomain, ".cloudfront.net");

    const domain = cognito.findUserPoolDomainInAnyAccount("auth.example.com");
    assertNonNullable(domain);
    assertIdentical(domain.hostname, "auth.example.com");
    assertIdentical(domain.localHostname, "auth.example.com");
  });

  it("deletes a domain and frees its name for another pool", async () => {
    // Given two pools, the first of which holds a domain.
    const first = await simCognitoWithPool();
    const second = await simCognitoWithPool(first.cognito);
    await first.cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: first.userPoolId,
        Domain: "myapp-login",
      }),
    );

    // When the first pool's domain is deleted.
    await first.cognito.deleteUserPoolDomain(
      new DeleteUserPoolDomainCommand({
        UserPoolId: first.userPoolId,
        Domain: "myapp-login",
      }),
    );

    // Then the name is free, and the second pool can take it.
    assertUndefined(
      first.cognito.findUserPoolDomainInAnyAccount("myapp-login"),
    );

    await second.cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: second.userPoolId,
        Domain: "myapp-login",
      }),
    );

    assertIdentical(
      first.cognito.findUserPoolDomainInAnyAccount("myapp-login")?.userPoolId,
      second.userPoolId,
    );
  });

  it("refuses a domain another pool already holds", async () => {
    // Given a pool holding a domain, and another pool in a different account.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const first = await simCognitoWithPool(simAws.cognitoIdentityProvider());
    const second = await simCognitoWithPool(
      simAws
        .account("222222222222")
        .region("eu-west-2")
        .cognitoIdentityProvider(),
    );
    await first.cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: first.userPoolId,
        Domain: "myapp-login",
      }),
    );

    // When the other pool asks for the same domain.
    const error = await assertThrowsErrorAsync(async () => {
      await second.cognito.createUserPoolDomain(
        new CreateUserPoolDomainCommand({
          UserPoolId: second.userPoolId,
          Domain: "myapp-login",
        }),
      );
    });

    // Then it is refused, because a domain is unique across the whole of AWS
    // rather than within one account.
    assertStringIncludes(error.message, "already in use");
  });

  it("refuses a second domain on a pool that has one", async () => {
    // Given a pool that already has a domain.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "myapp-login",
      }),
    );

    // When another is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPoolDomain(
        new CreateUserPoolDomainCommand({
          UserPoolId: userPoolId,
          Domain: "myapp-other",
        }),
      );
    });

    // Then it is refused, because a pool has one domain.
    assertStringIncludes(error.message, "already has the domain 'myapp-login'");
  });

  it("refuses deleting a domain the pool does not hold", async () => {
    // Given a pool with a domain.
    const { cognito, userPoolId } = await simCognitoWithPool();
    await cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: userPoolId,
        Domain: "myapp-login",
      }),
    );

    // When a different domain is deleted from it.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.deleteUserPoolDomain(
        new DeleteUserPoolDomainCommand({
          UserPoolId: userPoolId,
          Domain: "someone-elses",
        }),
      );
    });

    // Then it is refused rather than taking the domain the pool does hold.
    assertStringIncludes(error.message, "No such domain or user pool exists.");
    assertNonNullable(cognito.findUserPoolDomainInAnyAccount("myapp-login"));
  });
});
