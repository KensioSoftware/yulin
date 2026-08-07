import {
  CreateUserPoolCommand,
  ListUserPoolsCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

async function simCognitoWithPools(
  ...poolNames: readonly string[]
): Promise<SimCognitoIdentityProvider> {
  const cognito = new SimAws().cognitoIdentityProvider();

  for (const poolName of poolNames) {
    // oxlint-disable-next-line no-await-in-loop -- pools are created in order
    await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: poolName }),
    );
  }

  return cognito;
}

describe("sim Cognito ListUserPools", () => {
  it("lists the pools in this scope in creation order", async () => {
    // Given three pools.
    const cognito = await simCognitoWithPools(
      "myapp-users",
      "myapp-staff",
      "myapp-test",
    );

    // When they are listed.
    const listed = await cognito.listUserPools(
      new ListUserPoolsCommand({ MaxResults: 60 }),
    );

    // Then each comes back, in the order they were created, with no ARN, as
    // real Cognito leaves the ARN out of a listing.
    assertArrayEquals(
      listed.UserPools?.map((pool) => pool.Name),
      ["myapp-users", "myapp-staff", "myapp-test"],
    );
    assertUndefined(listed.NextToken);

    const first = listed.UserPools[0];

    assertNonNullable(first);
    assertNonNullable(first.Id);
    assertNonNullable(first.CreationDate);
  });

  it("pages the listing with a token", async () => {
    // Given three pools.
    const cognito = await simCognitoWithPools(
      "myapp-users",
      "myapp-staff",
      "myapp-test",
    );

    // When they are asked for two at a time.
    const firstPage = await cognito.listUserPools(
      new ListUserPoolsCommand({ MaxResults: 2 }),
    );
    const secondPage = await cognito.listUserPools(
      new ListUserPoolsCommand({
        MaxResults: 2,
        NextToken: firstPage.NextToken,
      }),
    );

    // Then the token reaches the rest of them.
    assertArrayEquals(
      firstPage.UserPools?.map((pool) => pool.Name),
      ["myapp-users", "myapp-staff"],
    );
    assertArrayEquals(
      secondPage.UserPools?.map((pool) => pool.Name),
      ["myapp-test"],
    );
    assertUndefined(secondPage.NextToken);
  });

  it("insists on being told how many pools to return", async () => {
    // Given simulated Cognito.
    const cognito = await simCognitoWithPools("myapp-users");

    // When a listing asks for no particular number.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUserPools(new ListUserPoolsCommand({} as never));
    });

    // Then it is refused, as real Cognito requires MaxResults.
    assertIdentical(error.name, "InvalidParameterException");
    assertStringIncludes(error.message, "MaxResults is required");
  });

  it("refuses a page size outside the range Cognito allows", async () => {
    // Given simulated Cognito.
    const cognito = await simCognitoWithPools("myapp-users");

    // When more than sixty pools are asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUserPools(new ListUserPoolsCommand({ MaxResults: 61 }));
    });

    // Then it is refused.
    assertStringIncludes(error.message, "between 1 and 60");
  });

  it("refuses a token it did not issue", async () => {
    // Given two pools.
    const cognito = await simCognitoWithPools("myapp-users", "myapp-staff");

    // When a listing carries a token from somewhere else.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUserPools(
        new ListUserPoolsCommand({ MaxResults: 1, NextToken: "later" }),
      );
    });

    // Then it is refused rather than quietly starting again.
    assertStringIncludes(error.message, "not a token this simulation issued");
  });
});
