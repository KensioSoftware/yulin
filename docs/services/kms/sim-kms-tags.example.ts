/**
 * Tagging a key and deciding an encryption on its tags.
 */

import {
  CreateKeyCommand,
  EncryptCommand,
  ListResourceTagsCommand,
  TagResourceCommand,
} from "@aws-sdk/client-kms";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const created = await simAws
  .kms()
  .createKey(
    new CreateKeyCommand({ Tags: [{ TagKey: "team", TagValue: "orders" }] }),
  );
const KeyId = created.KeyMetadata?.KeyId;

await simAws.kms().tagResource(
  new TagResourceCommand({
    KeyId,
    Tags: [{ TagKey: "stage", TagValue: "test" }],
  }),
);

const listed = await simAws
  .kms()
  .listResourceTags(new ListResourceTagsCommand({ KeyId }));

console.log(listed.Tags);
// [ { TagKey: 'team', TagValue: 'orders' }, { TagKey: 'stage', TagValue: 'test' } ]

await simAws.iam().createRole({
  input: {
    RoleName: "OrdersEncrypter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  },
});

// The key's default policy delegates to IAM, so this identity policy is
// what decides.
await simAws.iam().putRolePolicy({
  input: {
    RoleName: "OrdersEncrypter",
    PolicyName: "EncryptWithOwnTeam",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "kms:Encrypt",
        Resource: "*",
        Condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
    }),
  },
});

const encrypted = await simAws
  .kms()
  .encrypt(
    new EncryptCommand({ KeyId, Plaintext: new TextEncoder().encode("hi") }),
    {
      caller: {
        kind: "arn",
        arn: "arn:aws:iam::123456789012:role/OrdersEncrypter",
      },
    },
  );

console.log(encrypted.KeyId === created.KeyMetadata?.Arn); // true
