import { createVerify, X509Certificate } from "node:crypto";
import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringEndsWith,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../test/sns/topic-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";

/**
 * The fields a signed SNS message carries.
 */
interface SnsEnvelope {
  readonly Type: string;
  readonly MessageId: string;
  readonly Subject?: string;
  readonly Message: string;
  readonly Timestamp: string;
  readonly TopicArn: string;
  readonly Signature: string;
  readonly SigningCertURL: string;
}

/**
 * Rebuild the string real SNS signs, the way a real verifier rebuilds it.
 *
 * The signed fields are in alphabetical order, each one its name and its value
 * followed by a newline, and a field the message does not carry is left out.
 */
function canonicalMessage(envelope: SnsEnvelope): string {
  const signed: readonly (readonly [string, string | undefined])[] = [
    ["Message", envelope.Message],
    ["MessageId", envelope.MessageId],
    ["Subject", envelope.Subject],
    ["Timestamp", envelope.Timestamp],
    ["TopicArn", envelope.TopicArn],
    ["Type", envelope.Type],
  ];

  return signed
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}\n${value ?? ""}\n`)
    .join("");
}

/**
 * Verify a signature against the certificate the simulation issued.
 */
function verifies(
  simAws: SimAws,
  envelope: SnsEnvelope,
  signed: string,
): boolean {
  const certificate = simAws.sns().signingCertificate(envelope.SigningCertURL);

  assertNonNullable(certificate, "The SigningCertURL names a certificate");

  return createVerify("RSA-SHA1")
    .update(signed, "utf8")
    .verify(certificate, envelope.Signature, "base64");
}

/**
 * Publish one message and read the envelope a subscribed queue received.
 */
async function deliveredEnvelope(subject?: string): Promise<{
  simAws: SimAws;
  envelope: SnsEnvelope;
}> {
  const { simAws, topicArn } = await simAwsWithTopic();
  const { queueUrl } = await simSnsSubscribedQueue(simAws, "orders", topicArn);

  await simAws.sns().publish(
    new PublishCommand({
      TopicArn: topicArn,
      Message: "order-1",
      ...(subject !== undefined && { Subject: subject }),
    }),
  );

  const body = await simSnsDeliveredMessage(simAws, queueUrl);

  assertNonNullable(body);

  return { simAws, envelope: JSON.parse(body) as SnsEnvelope };
}

describe("SNS message signature", () => {
  it("signs a delivered message so its signature verifies", async () => {
    // Given a message delivered to a subscribed queue.
    const { simAws, envelope } = await deliveredEnvelope("New order");

    // When the signature is checked against the certificate the message names.
    // Then it verifies, so a consumer can check a simulated message the way it
    // checks a real one.
    assertIdentical(envelope.Type, "Notification");
    assertTrue(verifies(simAws, envelope, canonicalMessage(envelope)));
  });

  it("fails to verify a message that has been changed", async () => {
    // Given a message delivered to a subscribed queue.
    const { simAws, envelope } = await deliveredEnvelope();

    // When the message is changed and the signature is checked again.
    const tampered = canonicalMessage({ ...envelope, Message: "order-2" });

    // Then it does not verify, which is the whole point of signing it.
    assertFalse(verifies(simAws, envelope, tampered));
  });

  it("names a certificate that is a certificate", async () => {
    // Given a message delivered to a subscribed queue.
    const { simAws, envelope } = await deliveredEnvelope();

    // When the certificate the message names is read.
    const pem = simAws.sns().signingCertificate(envelope.SigningCertURL);

    assertNonNullable(pem);

    const certificate = new X509Certificate(pem);

    // Then it is an X.509 certificate naming the simulated SNS host, which is
    // what the signing certificate URL names too.
    assertIdentical(certificate.subject, "CN=sns.us-east-1.yulin.invalid");
    assertStringIncludes(
      envelope.SigningCertURL,
      "https://sns.us-east-1.yulin.invalid/SimulatedNotificationService-",
    );
    assertStringEndsWith(envelope.SigningCertURL, ".pem");
  });

  it("hands out no certificate for a URL it did not issue", async () => {
    // Given a message delivered to a subscribed queue.
    const { simAws } = await deliveredEnvelope();

    // When a certificate is asked for by another URL.
    const pem = simAws
      .sns()
      .signingCertificate(
        "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-1.pem",
      );

    // Then there is none, so a message signed elsewhere is not verified
    // against this scope's key by accident.
    assertUndefined(pem);
  });
});
