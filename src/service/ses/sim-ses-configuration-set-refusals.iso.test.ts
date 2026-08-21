import {
  CreateConfigurationSetCommand,
  DeleteConfigurationSetCommand,
  GetConfigurationSetCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesAlreadyExistsException,
  SimSesBadRequestException,
  SimSesNotFoundException,
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/** A simulated SES holding one configuration set. */
async function sesWithSet(): Promise<SimSesV2> {
  const ses = new SimAws().sesV2();

  await ses.createConfigurationSet(
    new CreateConfigurationSetCommand({
      ConfigurationSetName: "transactional",
    }),
  );

  return ses;
}

describe("simulated SES configuration set refusals", () => {
  it("refuses a second set with a name that is taken", async () => {
    // Given a set that exists.
    const ses = await sesWithSet();

    // When another is made under the same name.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "transactional",
        }),
      );
    });

    assertInstanceOf(error, SimSesAlreadyExistsException);
    assertStringIncludes(error.message, "transactional already exists");
  });

  it("refuses reading a set that was never created", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.getConfigurationSet(
        new GetConfigurationSetCommand({ ConfigurationSetName: "absent" }),
      );
    });

    assertInstanceOf(error, SimSesNotFoundException);
    assertStringIncludes(error.message, "absent does not exist");
  });

  it("refuses deleting a set that was never created", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.deleteConfigurationSet(
        new DeleteConfigurationSetCommand({ ConfigurationSetName: "absent" }),
      );
    });

    assertInstanceOf(error, SimSesNotFoundException);
  });

  it("refuses a set with no name", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet({ input: {} });
    });

    assertInstanceOf(error, SimSesBadRequestException);
    assertStringIncludes(error.message, "configurationSetName");
  });

  it("refuses a name longer than SES allows", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "a".repeat(65),
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
    assertStringIncludes(error.message, "less than or equal to 64");
  });

  it("refuses a suppression reason SES has no meaning for", async () => {
    // Given a set naming a reason that is neither a bounce nor a complaint.
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet({
        input: {
          ConfigurationSetName: "transactional",
          SuppressionOptions: { SuppressedReasons: ["UNSUBSCRIBE"] },
        },
      });
    });

    // Then it is refused rather than held. A reason nothing can act on would
    // read back as configured and mean nothing.
    assertInstanceOf(error, SimSesBadRequestException);
    assertStringIncludes(error.message, "BOUNCE, COMPLAINT");
  });

  it("refuses a TLS policy that is not one of the two", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet({
        input: {
          ConfigurationSetName: "transactional",
          DeliveryOptions: { TlsPolicy: "REQUIRED" },
        },
      });
    });

    assertInstanceOf(error, SimSesBadRequestException);
    assertStringIncludes(error.message, "REQUIRE, OPTIONAL");
  });

  it("refuses tracking options, which rewrite no link here", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "transactional",
          TrackingOptions: { CustomRedirectDomain: "click.example.com" },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertStringIncludes(error.message, "Open and click tracking");
  });

  it("refuses Virtual Deliverability Manager options", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "transactional",
          VdmOptions: { DashboardOptions: { EngagementMetrics: "ENABLED" } },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertStringIncludes(error.message, "Virtual Deliverability Manager");
  });

  it("refuses tags, and accepts an empty list of them", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.createConfigurationSet(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: "transactional",
          Tags: [{ Key: "team", Value: "orders" }],
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);

    // Code that always passes its tags is not using the feature when it has
    // none, so an empty list goes through.
    await ses.createConfigurationSet(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "transactional",
        Tags: [],
      }),
    );
  });
});
