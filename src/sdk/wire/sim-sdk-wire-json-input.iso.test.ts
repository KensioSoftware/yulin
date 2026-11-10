import { createPublicKey, verify } from "node:crypto";
import {
  CreateStreamCommand,
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
  PutRecordCommand,
} from "@aws-sdk/client-kinesis";
import {
  CreateKeyCommand,
  DecryptCommand,
  EncryptCommand,
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
} from "@aws-sdk/client-kms";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { faker } from "@faker-js/faker";
import {
  assertArrayEquals,
  assertArrayLength,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simSdkWireClientConfig } from "../../../test/sdk/wire/sim-sdk-wire-request-handler.js";
import { SimAws } from "../../service/aws/sim-aws.js";

describe("AWS JSON protocol input over the wire", () => {
  const randomBytes = (): Uint8Array =>
    Uint8Array.from(
      faker.helpers.multiple(() => faker.number.int(255), {
        count: 64,
      }),
    );

  it("signs the bytes of a RAW KMS message, not their base64 text", async () => {
    // Given an RSA signing key, and a KMS client that reaches it over the
    // wire as function code bundling its own SDK does.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const kms = new KMSClient(simSdkWireClientConfig(simAws));
    const { KeyMetadata } = await kms.send(
      new CreateKeyCommand({ KeySpec: "RSA_2048", KeyUsage: "SIGN_VERIFY" }),
    );
    assertNonNullable(KeyMetadata);
    const message = randomBytes();

    // When a RAW message is signed with PKCS #1 v1.5 padding.
    const { Signature } = await kms.send(
      new SignCommand({
        KeyId: KeyMetadata.Arn,
        Message: message,
        MessageType: "RAW",
        SigningAlgorithm: "RSASSA_PKCS1_V1_5_SHA_256",
      }),
    );

    // Then the signature verifies against the message and the key's public
    // half, outside KMS.
    const { PublicKey } = await kms.send(
      new GetPublicKeyCommand({ KeyId: KeyMetadata.Arn }),
    );
    assertNonNullable(PublicKey);
    assertNonNullable(Signature);
    const publicKey = createPublicKey({
      key: Buffer.from(PublicKey),
      format: "der",
      type: "spki",
    });
    assertTrue(verify("sha256", message, publicKey, Signature));
  });

  it("decrypts what it encrypted, byte for byte", async () => {
    // Given a symmetric key reached over the wire.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const kms = new KMSClient(simSdkWireClientConfig(simAws));
    const { KeyMetadata } = await kms.send(new CreateKeyCommand({}));
    assertNonNullable(KeyMetadata);
    const plaintext = randomBytes();

    // When plaintext is encrypted, and the ciphertext decrypted.
    const { CiphertextBlob } = await kms.send(
      new EncryptCommand({ KeyId: KeyMetadata.Arn, Plaintext: plaintext }),
    );
    const decrypted = await kms.send(new DecryptCommand({ CiphertextBlob }));

    // Then the same bytes come back.
    assertNonNullable(decrypted.Plaintext);
    assertArrayEquals([...decrypted.Plaintext], [...plaintext]);
  });

  it("stores a binary secret as its bytes", async () => {
    // Given a Secrets Manager client reaching the simulation over the wire.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const secretsManager = new SecretsManagerClient(
      simSdkWireClientConfig(simAws),
    );
    const secretName = `certificates/${faker.string.alpha(12)}`;
    const secretBinary = randomBytes();

    // When a binary secret is created over the wire.
    await secretsManager.send(
      new CreateSecretCommand({ Name: secretName, SecretBinary: secretBinary }),
    );

    // Then a client sending its Commands straight to the simulation reads
    // the same bytes back.
    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: secretName }));
    assertNonNullable(read.SecretBinary);
    assertArrayEquals([...read.SecretBinary], [...secretBinary]);
  });

  it("reads Kinesis records from a timestamp given over the wire", async () => {
    // Given a stream written to over the wire, once before a point in time
    // and once after it.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const kinesis = new KinesisClient(simSdkWireClientConfig(simAws));
    const streamName = `orders-${faker.string.alpha(12)}`;
    await kinesis.send(
      new CreateStreamCommand({ StreamName: streamName, ShardCount: 1 }),
    );
    const putRecord = async (data: Uint8Array): Promise<void> => {
      await kinesis.send(
        new PutRecordCommand({
          StreamName: streamName,
          PartitionKey: faker.string.uuid(),
          Data: data,
        }),
      );
    };
    await putRecord(randomBytes());
    await simAws.clock().advanceBy({ minutes: 5 });
    const pointInTime = simAws.clock().now();
    await simAws.clock().advanceBy({ minutes: 5 });
    const later = randomBytes();
    await putRecord(later);

    // When the stream is read from that point in time.
    const { StreamDescription } = await kinesis.send(
      new DescribeStreamCommand({ StreamName: streamName }),
    );
    const { ShardIterator } = await kinesis.send(
      new GetShardIteratorCommand({
        StreamName: streamName,
        ShardId: StreamDescription?.Shards?.[0]?.ShardId,
        ShardIteratorType: "AT_TIMESTAMP",
        Timestamp: pointInTime,
      }),
    );
    const { Records } = await kinesis.send(
      new GetRecordsCommand({ ShardIterator }),
    );

    // Then only the later record comes back, with the bytes that were
    // written.
    assertNonNullable(Records);
    assertArrayLength(Records, 1);
    assertNonNullable(Records[0].Data);
    assertArrayEquals([...Records[0].Data], [...later]);

    await simAws.backgroundTasksComplete();
  });
});
