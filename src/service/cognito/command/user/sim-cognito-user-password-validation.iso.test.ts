import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { PasswordPolicyType } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoInvalidPasswordException,
} from "../../error/sim-cognito.error.js";

/**
 * A pool holding one user, whose password policy the test chooses.
 */
async function setPassword(
  password: string | undefined,
  passwordPolicy?: PasswordPolicyType,
): Promise<void> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      Policies: { PasswordPolicy: passwordPolicy },
    }),
  );

  assertNonNullable(created.UserPool?.Id);

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: created.UserPool.Id,
      Username: "alice",
    }),
  );

  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: created.UserPool.Id,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );
}

describe("sim Cognito password policy", () => {
  it("refuses a password with no uppercase letter", async () => {
    // Given the default policy, which wants one.
    // When a password without one is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword("sup3rsecret!");
    });

    // Then it is refused, saying which rule it broke.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "must have uppercase characters");
  });

  it("refuses a password with no lowercase letter", async () => {
    // Given the default policy, which wants one.
    // When a password without one is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword("SUP3RSECRET!");
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "must have lowercase characters");
  });

  it("refuses a password with no digit", async () => {
    // Given the default policy, which wants one.
    // When a password without one is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword("SuperSecret!");
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "must have numeric characters");
  });

  it("refuses a password with no symbol", async () => {
    // Given the default policy, which wants one.
    // When a password without one is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword("Sup3rSecret");
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "must have symbol characters");
  });

  it("refuses a password whose only letters are outside basic Latin", async () => {
    // Given the default policy, which wants an uppercase letter.
    // When a password of Greek letters is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword("Δοκιμή1!");
    });

    // Then it is refused. Which characters count towards the uppercase and
    // lowercase rules is not documented, so only basic Latin counts here.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "must have uppercase characters");
  });

  it("refuses a password shorter than the pool wants", async () => {
    // Given a pool wanting twelve characters.
    // When a shorter password is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword("Sh0rt!", { MinimumLength: 12 });
    });

    // Then it is refused for its length.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "not long enough");
  });

  it("refuses a password longer than Cognito allows", async () => {
    // Given the default policy.
    // When a 257 character password is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword(`Sup3rSecret!${"a".repeat(245)}`);
    });

    // Then it is refused.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "256");
  });

  it("refuses a password that is not there at all", async () => {
    // Given the default policy.
    // When the password is left out.
    const error = await assertThrowsErrorAsync(async () => {
      await setPassword(undefined);
    });

    // Then it is a validation error rather than a policy failure, as real
    // Cognito rejects the request before it reaches the policy.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Password is required");
  });

  it("accepts a password a relaxed policy allows", async () => {
    // Given a pool wanting six characters and nothing else.
    // When a password meeting only that is set.
    await setPassword("simple", {
      MinimumLength: 6,
      RequireUppercase: false,
      RequireLowercase: false,
      RequireNumbers: false,
      RequireSymbols: false,
    });

    // Then it is accepted, because the pool's own policy is what applies.
  });
});
