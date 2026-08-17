import { ListPhoneNumbersOptedOutCommand } from "@aws-sdk/client-sns";
import { assertArrayLength, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("SNS opt-out list paging", () => {
  it("pages the listing at a hundred numbers", async () => {
    // Given more opted-out numbers than one page holds.
    const sns = new SimAws().sns();

    for (let index = 0; index < 101; index++) {
      sns.optOutPhoneNumber(`+1555${String(index).padStart(6, "0")}`);
    }

    // When the first page is read, and then the second.
    const first = await sns.listPhoneNumbersOptedOut(
      new ListPhoneNumbersOptedOutCommand({}),
    );
    const second = await sns.listPhoneNumbersOptedOut(
      new ListPhoneNumbersOptedOutCommand({ nextToken: first.nextToken }),
    );

    // Then the first page carries a token to the second, and the second
    // carries none, as real SNS pages its listings.
    assertArrayLength(first.phoneNumbers ?? [], 100);
    assertArrayLength(second.phoneNumbers ?? [], 1);
    assertUndefined(second.nextToken);
  });
});
