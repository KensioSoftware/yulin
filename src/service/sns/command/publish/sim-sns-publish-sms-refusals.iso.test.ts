import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../../error/sim-sns.error.js";

const phoneNumber = "+15550100";

describe("SNS publish to a phone number refusals", () => {
  it("refuses a phone number that is not in E.164 form", async () => {
    // Given a simulated SNS.
    const simAws = new SimAws();

    // When each badly formatted number is published to.
    const refusals = await Promise.all(
      ["5550100", "+0555010", "+1555abc0100", "+1555010012345678"].map(
        async (badNumber) =>
          assertThrowsErrorAsync(async () => {
            await simAws
              .sns()
              .publish(
                new PublishCommand({ PhoneNumber: badNumber, Message: "hi" }),
              );
          }),
      ),
    );

    // Then each is refused the way real SNS refuses a parameter it will not
    // take, naming the parameter.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsInvalidParameterException);
      assertStringIncludes(error.message, "PhoneNumber");
    }
  });

  it("refuses the reserved SMS attributes it would act on and does not", async () => {
    // Given a simulated SNS.
    const simAws = new SimAws();

    // When a publish carries one of the reserved attributes real SNS acts on.
    const refusals = await Promise.all(
      [
        "AWS.SNS.SMS.MaxPrice",
        "AWS.MM.SMS.OriginationNumber",
        "AWS.MM.SMS.EntityId",
      ].map(async (attributeName) =>
        assertThrowsErrorAsync(async () => {
          await simAws.sns().publish(
            new PublishCommand({
              PhoneNumber: phoneNumber,
              Message: "hi",
              MessageAttributes: {
                [attributeName]: { DataType: "String", StringValue: "0.50" },
              },
            }),
          );
        }),
      ),
    );

    // Then each is refused, since a price cap that capped nothing would be one
    // a test believed was applied.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsUnsimulatedInputException);
    }
  });
});
