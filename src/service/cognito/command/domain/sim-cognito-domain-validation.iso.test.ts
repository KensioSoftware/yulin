import { CreateUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCreateUserPoolDomainCommandInput } from "./user-pool-domain.command.js";

interface RefusedDomain {
  readonly label: string;
  readonly input: Omit<SimCreateUserPoolDomainCommandInput, "UserPoolId">;
  readonly says: string;
}

const refusedDomains: readonly RefusedDomain[] = [
  {
    label: "no domain at all",
    input: {},
    says: "Domain is required",
  },
  {
    label: "a prefix longer than a domain label",
    input: { Domain: "d".repeat(64) },
    says: "is too long",
  },
  {
    label: "a prefix with capitals in it",
    input: { Domain: "MyApp" },
    says: "is not a domain prefix",
  },
  {
    label: "a prefix ending in a hyphen",
    input: { Domain: "myapp-" },
    says: "is not a domain prefix",
  },
  {
    label: "a prefix containing a reserved word",
    input: { Domain: "myapp-cognito" },
    says: "contains the reserved word 'cognito'",
  },
  {
    label: "a custom domain that is not a subdomain",
    input: {
      Domain: "example.com",
      CustomDomainConfig: { CertificateArn: "arn:aws:acm:us-east-1:1:c/1" },
    },
    says: "is not a custom domain",
  },
  {
    label: "a custom domain with no certificate",
    input: { Domain: "auth.example.com", CustomDomainConfig: {} },
    says: "CustomDomainConfig CertificateArn is required",
  },
  {
    label: "failover routing",
    input: {
      Domain: "myapp-login",
      Routing: { Failover: { SecondaryRegion: "eu-west-1" } },
    },
    says: "multi-region failover routing",
  },
];

async function refusedDomainError(
  input: Omit<SimCreateUserPoolDomainCommandInput, "UserPoolId">,
  label: string,
): Promise<Error> {
  const cognito = new SimAws({
    defaultRegionName: "eu-west-2",
  }).cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );
  assertNonNullable(created.UserPool?.Id);

  return await assertThrowsErrorAsync(async () => {
    await cognito.createUserPoolDomain({
      input: { UserPoolId: created.UserPool?.Id, ...input },
    });
  }, label);
}

describe("sim Cognito user pool domain validation", () => {
  it("refuses a domain real Cognito would refuse", async () => {
    // Given each domain request that could not have been made on real AWS.
    // When each is used to create a domain.
    const outcomes = await Promise.all(
      refusedDomains.map(async (refused) => ({
        refused,
        error: await refusedDomainError(refused.input, refused.label),
      })),
    );

    // Then each is refused, saying what was wrong with it.
    for (const { refused, error } of outcomes) {
      assertStringIncludes(error.message, refused.says);
    }
  });
});
