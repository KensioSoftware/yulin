import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/**
 * Create an identity and read it straight back, which is what a test asserting
 * on how an identity is configured does.
 */
async function created(
  ses: SimSesV2,
  input: ConstructorParameters<typeof CreateEmailIdentityCommand>[0],
): Promise<Awaited<ReturnType<SimSesV2["getEmailIdentity"]>>> {
  await ses.createEmailIdentity(new CreateEmailIdentityCommand(input));

  return await ses.getEmailIdentity(
    new GetEmailIdentityCommand({ EmailIdentity: input.EmailIdentity }),
  );
}

describe("SimSesV2 email identity settings", () => {
  it("signs a domain identity with Easy DKIM by default", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a domain identity is created with nothing said about DKIM.
    const identity = await created(ses, { EmailIdentity: "example.com" });

    // Then Easy DKIM is on with three tokens to publish, which is what real
    // SES sets up for a domain created through the v2 API.
    const dkim = identity.DkimAttributes;

    assertNonNullable(dkim);
    assertTrue(dkim.SigningEnabled);
    assertIdentical(dkim.SigningAttributesOrigin, "AWS_SES");
    assertArrayLength(dkim.Tokens, 3);
  });

  it("leaves an address identity without DKIM of its own", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an email address is created as an identity.
    const identity = await created(ses, {
      EmailIdentity: "hello@example.com",
    });

    // Then it has no DKIM, since the records carrying it belong to the domain
    // rather than to one mailbox at it.
    const dkim = identity.DkimAttributes;

    assertNonNullable(dkim);
    assertFalse(dkim.SigningEnabled);
    assertIdentical(dkim.Status, "NOT_STARTED");
    assertUndefined(dkim.Tokens);
  });

  it("holds the Bring Your Own DKIM attributes a request asks for", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created with a signing selector and key of its own.
    const identity = await created(ses, {
      EmailIdentity: "example.com",
      DkimSigningAttributes: {
        DomainSigningSelector: "selector1",
        DomainSigningPrivateKey: "MIIEvQIBADANBg",
      },
    });

    // Then it reports an external signing origin with no tokens of its own,
    // which is how real SES answers for a key the caller brought.
    const dkim = identity.DkimAttributes;

    assertNonNullable(dkim);
    assertIdentical(dkim.SigningAttributesOrigin, "EXTERNAL");
    assertUndefined(dkim.Tokens);
  });

  it("holds the next signing key length a request asks for", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created asking Easy DKIM for a longer key.
    const identity = await created(ses, {
      EmailIdentity: "example.com",
      DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
    });

    // Then the length comes back with Easy DKIM still in place, since a key
    // length says nothing about where the key comes from.
    const dkim = identity.DkimAttributes;

    assertNonNullable(dkim);
    assertIdentical(dkim.NextSigningKeyLength, "RSA_2048_BIT");
    assertIdentical(dkim.SigningAttributesOrigin, "AWS_SES");
  });

  it("holds the tags and configuration set a request names", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created with tags and a default configuration set.
    const identity = await created(ses, {
      EmailIdentity: "example.com",
      Tags: [{ Key: "team", Value: "orders" }],
      ConfigurationSetName: "transactional",
    });

    // Then both come back, so a test can assert the identity agrees with the
    // request that made it.
    assertIdentical(identity.ConfigurationSetName, "transactional");
    assertArrayLength(identity.Tags, 1);
    assertObjectEquals(identity.Tags[0], { Key: "team", Value: "orders" });
  });

  it("moves DKIM to verified along with the identity", async () => {
    // Given a domain identity that is still waiting on its verification.
    const simAws = new SimAws();
    const ses = simAws.sesV2();

    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );

    const pending = await ses.getEmailIdentity(
      new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );

    assertIdentical(pending.DkimAttributes?.Status, "PENDING");

    // When it is verified out of band, the way a real domain is by its DNS
    // records resolving.
    ses.verifyIdentity("example.com");

    // Then DKIM is verified with it, since the one act here stands for every
    // record a real identity waits on.
    const verified = await ses.getEmailIdentity(
      new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );

    assertIdentical(verified.DkimAttributes?.Status, "SUCCESS");
  });

  it("forwards feedback and names no configuration set by default", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created with nothing said about either.
    const identity = await created(ses, { EmailIdentity: "example.com" });

    // Then feedback forwarding is on, which is what an account does for an
    // identity whose bounces have nowhere else to go, and no configuration set
    // or MAIL FROM domain is named.
    assertTrue(identity.FeedbackForwardingStatus);
    assertUndefined(identity.ConfigurationSetName);
    assertUndefined(identity.MailFromAttributes);
  });

  it("drops half a tag rather than failing the request", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created with a tag whose value never arrived, which
    // is a shape the SDK's own types allow.
    const identity = await created(ses, {
      EmailIdentity: "example.com",
      Tags: [{ Key: "team", Value: undefined }],
    });

    // Then the identity is there with the tag left off, rather than a request
    // failing over something nothing here is billed or grouped by.
    assertNonNullable(identity.Tags);
    assertArrayEmpty(identity.Tags);
  });
});
