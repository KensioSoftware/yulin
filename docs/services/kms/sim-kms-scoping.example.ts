/**
 * Simulated KMS keys are scoped to an account and region.
 */

import { CreateKeyCommand, DescribeKeyCommand } from "@aws-sdk/client-kms";

import { SimAws } from "@kensio/yulin";
import { SimKmsNotFoundException } from "@kensio/yulin/kms";

const simAws = new SimAws();

const created = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .kms()
  .createKey(new CreateKeyCommand({}));

try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .kms()
    .describeKey(new DescribeKeyCommand({ KeyId: created.KeyMetadata?.Arn }));
} catch (error) {
  console.log(error instanceof SimKmsNotFoundException); // true
}
