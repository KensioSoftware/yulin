import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CheckIfPhoneNumberIsOptedOutCommand,
  ListPhoneNumbersOptedOutCommand,
  OptInPhoneNumberCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSnsAuthorizationErrorException } from "../../error/sim-sns.error.js";

const phoneNumber = "+15550100";

/**
 * A simulated AWS and a Role allowed only what one policy statement says.
 */
async function simAwsWithRole(
  statement: object,
): Promise<{ simAws: SimAws; caller: SimAwsCaller }> {
  const simAws = new SimAws();
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "Texter",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Texter",
      PolicyName: "TextPeople",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

describe("SNS SMS IAM authorization", () => {
  it("refuses a caller whose policy allows none of the SMS actions", async () => {
    // Given a Role allowed to read a topic and nothing else.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:GetTopicAttributes",
      Resource: "*",
    });
    const sns = simAws.sns();

    // When it reaches each command the SMS surface has.
    const errors = await Promise.all([
      assertThrowsErrorAsync(async () => {
        await sns.publish(
          new PublishCommand({ PhoneNumber: phoneNumber, Message: "hi" }),
          { caller },
        );
      }),
      assertThrowsErrorAsync(async () => {
        await sns.checkIfPhoneNumberIsOptedOut(
          new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
          { caller },
        );
      }),
      assertThrowsErrorAsync(async () => {
        await sns.listPhoneNumbersOptedOut(
          new ListPhoneNumbersOptedOutCommand({}),
          { caller },
        );
      }),
      assertThrowsErrorAsync(async () => {
        await sns.optInPhoneNumber(
          new OptInPhoneNumberCommand({ phoneNumber }),
          { caller },
        );
      }),
    ]);

    // Then each is refused, and the refused publish recorded nothing.
    for (const error of errors) {
      assertInstanceOf(error, SimSnsAuthorizationErrorException);
    }

    assertArrayEmpty(sns.sentSmsMessages());
  });

  it("admits a caller whose policy allows the SMS actions", async () => {
    // Given a Role allowed them against every resource, which is the only
    // resource these actions have.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: ["sns:Publish", "sns:CheckIfPhoneNumberIsOptedOut"],
      Resource: "*",
    });
    const sns = simAws.sns();

    // When it publishes to a number and checks the opt-out list.
    await sns.publish(
      new PublishCommand({ PhoneNumber: phoneNumber, Message: "hi" }),
      { caller },
    );

    const checked = await sns.checkIfPhoneNumberIsOptedOut(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
      { caller },
    );

    // Then the message was recorded and the check answered.
    assertArrayLength(sns.sentSmsMessages(), 1);
    assertFalse(checked.isOptedOut);
  });
});
