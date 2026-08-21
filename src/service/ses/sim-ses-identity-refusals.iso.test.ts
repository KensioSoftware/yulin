import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
} from "@aws-sdk/client-sesv2";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesAlreadyExistsException,
  SimSesBadRequestException,
  SimSesNotFoundException,
} from "./error/sim-ses.error.js";

describe("SimSesV2 email identity refusals", () => {
  it("refuses an identity that already exists", async () => {
    // Given an identity that has been created.
    const ses = new SimAws().sesV2();
    const command = new CreateEmailIdentityCommand({
      EmailIdentity: "hello@example.com",
    });

    await ses.createEmailIdentity(command);

    // When the same one is created again.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailIdentity(command);
    });

    // Then it fails, as creation is not idempotent on real SES.
    assertInstanceOf(error, SimSesAlreadyExistsException);
  });

  it("refuses reading an identity that is not there", async () => {
    // Given a simulated SES with nothing in it.
    const ses = new SimAws().sesV2();

    // When an identity nobody created is read.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.getEmailIdentity(
        new GetEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
      );
    });

    // Then it is a NotFoundException, as it is on real SES.
    assertInstanceOf(error, SimSesNotFoundException);
  });

  it("refuses deleting an identity that is not there", async () => {
    // Given a simulated SES with nothing in it.
    const ses = new SimAws().sesV2();

    // When an identity nobody created is deleted.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.deleteEmailIdentity(
        new DeleteEmailIdentityCommand({ EmailIdentity: "example.com" }),
      );
    });

    assertInstanceOf(error, SimSesNotFoundException);
  });

  it("refuses a name that is neither an address nor a domain", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When something that is neither is offered as an identity.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailIdentity(
        new CreateEmailIdentityCommand({ EmailIdentity: "not an identity" }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses an identity name longer than SES accepts", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created with a name past the length limit.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailIdentity(
        new CreateEmailIdentityCommand({
          EmailIdentity: `${"a".repeat(320)}@example.com`,
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a page size the operation does not offer", async () => {
    // Given a simulated SES with one identity.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("example.com");

    // When a listing asks for more than one page holds.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.listEmailIdentities(
        new ListEmailIdentitiesCommand({ PageSize: 5000 }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses an identity with no name", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When an identity is created with nothing to identify.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailIdentity(
        new CreateEmailIdentityCommand({ EmailIdentity: "" }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });
});
