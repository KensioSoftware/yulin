import {
  CompleteWebAuthnRegistrationCommand,
  CreateUserPoolDomainCommand,
  DeleteWebAuthnCredentialCommand,
  ListWebAuthnCredentialsCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoPasskeyCredential,
  simCognitoRegisterPasskey,
  simCognitoRelyingPartyId,
  simCognitoWithPasskeyPool,
} from "../../../../../test/cognito/passkey-fixture.js";
import {
  simCognitoSignedIn,
  simCognitoUsername,
} from "../../../../../test/cognito/signed-in-fixture.js";

describe("sim Cognito passkey registration", () => {
  it("answers a signed-in user with the options a passkey is made from", async () => {
    // Given a pool that registers passkeys against a relying party, with a
    // user signed in with its password.
    const setUp = await simCognitoWithPasskeyPool();

    // When that user starts registering one.
    const started = await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    // Then it is answered with what a browser passes to
    // navigator.credentials.create(): the relying party, the user handle, the
    // algorithm the pool will take, and a challenge to sign.
    const options = started.CredentialCreationOptions;

    assertNonNullable(options);
    assertObjectMatches(options, {
      rp: { id: simCognitoRelyingPartyId, name: "myapp-users" },
      user: { name: simCognitoUsername, displayName: simCognitoUsername },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { userVerification: "required" },
      excludeCredentials: [],
    });
    assertTypeString(options.challenge);
  });

  it("registers the passkey the user's authenticator made", async () => {
    // Given a signed-in user of a pool that registers passkeys.
    const setUp = await simCognitoWithPasskeyPool();

    // When it registers one, and reads back what it has.
    const credential = await simCognitoRegisterPasskey(setUp);
    const listed = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({ AccessToken: setUp.accessToken }),
    );

    // Then the pool holds the credential the authenticator created, against
    // the relying party the pool names.
    assertArrayLength(listed.Credentials ?? [], 1);
    assertObjectMatches(listed.Credentials?.[0] ?? {}, {
      CredentialId: credential.id,
      RelyingPartyId: simCognitoRelyingPartyId,
      FriendlyCredentialName: simCognitoRelyingPartyId,
      AuthenticatorAttachment: "platform",
      AuthenticatorTransports: ["internal", "hybrid"],
    });
  });

  it("excludes a registered passkey from the next registration", async () => {
    // Given a user that has registered one passkey.
    const setUp = await simCognitoWithPasskeyPool();
    const first = await simCognitoRegisterPasskey(setUp);

    // When it starts registering another.
    const started = await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    // Then the one it has is excluded, so an authenticator already holding it
    // makes a second rather than replacing the first.
    assertObjectMatches(started.CredentialCreationOptions ?? {}, {
      excludeCredentials: [
        {
          type: "public-key",
          id: first.id,
          transports: ["internal", "hybrid"],
        },
      ],
    });
  });

  it("holds more than one passkey for a user, a page at a time", async () => {
    // Given a user that has registered two passkeys.
    const setUp = await simCognitoWithPasskeyPool();
    const first = await simCognitoRegisterPasskey(setUp);
    const second = await simCognitoRegisterPasskey(setUp);

    // When they are listed one to a page.
    const firstPage = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({
        AccessToken: setUp.accessToken,
        MaxResults: 1,
      }),
    );
    const secondPage = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({
        AccessToken: setUp.accessToken,
        MaxResults: 1,
        NextToken: firstPage.NextToken,
      }),
    );

    // Then both come back, oldest first, and the second page ends the listing.
    assertIdentical(firstPage.Credentials?.[0]?.CredentialId, first.id);
    assertIdentical(secondPage.Credentials?.[0]?.CredentialId, second.id);
    assertUndefined(secondPage.NextToken);
  });

  it("forgets a passkey the user deletes", async () => {
    // Given a user with two registered passkeys.
    const setUp = await simCognitoWithPasskeyPool();
    const first = await simCognitoRegisterPasskey(setUp);
    const second = await simCognitoRegisterPasskey(setUp);

    // When it deletes the first.
    await setUp.cognito.deleteWebAuthnCredential(
      new DeleteWebAuthnCredentialCommand({
        AccessToken: setUp.accessToken,
        CredentialId: first.id,
      }),
    );

    const listed = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({ AccessToken: setUp.accessToken }),
    );

    // Then only the other one is left.
    assertArrayLength(listed.Credentials ?? [], 1);
    assertIdentical(listed.Credentials?.[0]?.CredentialId, second.id);
  });

  it("registers a passkey whose authenticator named no transports", async () => {
    // Given a user part way through a registration, whose authenticator says
    // nothing usable about how the passkey can be reached.
    const setUp = await simCognitoWithPasskeyPool();

    await setUp.cognito.startWebAuthnRegistration(
      new StartWebAuthnRegistrationCommand({ AccessToken: setUp.accessToken }),
    );

    const credential = simCognitoPasskeyCredential(setUp);

    // When that credential is registered.
    await setUp.cognito.completeWebAuthnRegistration(
      new CompleteWebAuthnRegistrationCommand({
        AccessToken: setUp.accessToken,
        Credential: {
          ...credential,
          response: { ...credential.response, transports: "internal" },
        },
      }),
    );

    const listed = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({ AccessToken: setUp.accessToken }),
    );

    // Then the passkey is registered with no transports at all.
    assertArrayLength(
      listed.Credentials?.[0]?.AuthenticatorTransports ?? [],
      0,
    );
  });

  it("registers against the pool's hosted domain where it names no relying party", async () => {
    // Given a signed-in user of a pool with a hosted domain and no
    // WebAuthnConfiguration of its own.
    const setUp = await simCognitoSignedIn();

    await setUp.cognito.createUserPoolDomain(
      new CreateUserPoolDomainCommand({
        UserPoolId: setUp.userPoolId,
        Domain: "myapp-login",
      }),
    );

    // When it registers a passkey.
    await simCognitoRegisterPasskey(setUp);

    const listed = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({ AccessToken: setUp.accessToken }),
    );

    // Then the passkey is registered against the domain, which is what real
    // Cognito falls back to.
    assertIdentical(
      listed.Credentials?.[0]?.RelyingPartyId,
      "myapp-login.auth.eu-west-2.amazoncognito.com",
    );
  });

  it("takes a page size of zero as the whole page", async () => {
    // Given a user with one registered passkey.
    const setUp = await simCognitoWithPasskeyPool();
    const registered = await simCognitoRegisterPasskey(setUp);

    // When they are listed with the zero Cognito documents as a valid page
    // size.
    const listed = await setUp.cognito.listWebAuthnCredentials(
      new ListWebAuthnCredentialsCommand({
        AccessToken: setUp.accessToken,
        MaxResults: 0,
      }),
    );

    // Then the passkey comes back rather than the request being refused.
    assertIdentical(listed.Credentials?.[0]?.CredentialId, registered.id);
  });

  it("moves the user's last modified date on when its passkeys change", async () => {
    // Given a signed-in user of a pool that registers passkeys.
    const setUp = await simCognitoWithPasskeyPool();
    const user = setUp.cognito.userPool(setUp.userPoolId).users[0];

    assertNonNullable(user);

    const before = user.lastModifiedDate;

    // When a passkey is registered a minute later.
    await setUp.simAws.clock().advanceBy({ minutes: 1 });
    await simCognitoRegisterPasskey(setUp);

    // Then the user has changed, as it does for every other change to it.
    assertTrue(user.lastModifiedDate > before);
  });
});
