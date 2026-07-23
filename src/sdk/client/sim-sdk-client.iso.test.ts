import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimSdkInvalidClientError } from "../error/sim-sdk.error.js";
import {
  simSdkClientRegionName,
  simSdkClientServiceId,
} from "./sim-sdk-client.js";

describe("simulated SDK client service identity", () => {
  it("reads the service id from the client config", () => {
    const client = { config: { serviceId: "S3" } };

    assertIdentical(simSdkClientServiceId(client), "S3");
  });

  it("rejects a client that is not an object", () => {
    const error = assertThrowsError(() => simSdkClientServiceId("nope"));

    assertInstanceOf(error, SimSdkInvalidClientError);
  });

  it("rejects a client without a config", () => {
    const error = assertThrowsError(() => simSdkClientServiceId({}));

    assertInstanceOf(error, SimSdkInvalidClientError);
  });

  it("rejects a client config without a service id", () => {
    const error = assertThrowsError(() =>
      simSdkClientServiceId({ config: { serviceId: "" } }),
    );

    assertInstanceOf(error, SimSdkInvalidClientError);
  });
});

describe("simulated SDK client Region resolution", () => {
  it("uses a client Region configured as a string", async () => {
    const client = { config: { region: "eu-west-2" } };

    assertIdentical(
      await simSdkClientRegionName(client, "us-east-1"),
      "eu-west-2",
    );
  });

  it("resolves a client Region provider function", async () => {
    const client = { config: { region: () => Promise.resolve("eu-west-2") } };

    assertIdentical(
      await simSdkClientRegionName(client, "us-east-1"),
      "eu-west-2",
    );
  });

  it("falls back when the client has no Region configured", async () => {
    const client = { config: { serviceId: "S3" } };

    assertIdentical(
      await simSdkClientRegionName(client, "us-east-1"),
      "us-east-1",
    );
  });

  it("falls back when the client Region provider fails", async () => {
    const client = {
      config: {
        region: () => Promise.reject(new Error("Region is missing")),
      },
    };

    assertIdentical(
      await simSdkClientRegionName(client, "us-east-1"),
      "us-east-1",
    );
  });

  it("falls back when the client Region provider resolves a non-string", async () => {
    const client = { config: { region: () => Promise.resolve(42) } };

    assertIdentical(
      await simSdkClientRegionName(client, "us-east-1"),
      "us-east-1",
    );
  });

  it("rejects an unknown AWS Region name", async () => {
    const client = { config: { region: "narnia-1" } };

    const error = await assertThrowsErrorAsync(async () => {
      await simSdkClientRegionName(client, "us-east-1");
    });

    assertInstanceOf(error, SimSdkInvalidClientError);
  });
});
