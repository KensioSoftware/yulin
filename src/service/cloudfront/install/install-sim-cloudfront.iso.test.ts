import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { installSimCloudFront } from "./install-sim-cloudfront.js";
import { SimCloudFront } from "../sim-cloudfront.js";

describe("Sim CloudFront installer", () => {
  it("installs sim CloudFront into top-level sim AWS", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws.service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("installs sim CloudFront into sim AWS Region", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.region("eu-west-2").service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws.region("eu-west-2").service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("installs sim CloudFront into sim AWS Account", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.account("666666666666").service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws.account("666666666666").service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("installs sim CloudFront into sim AWS Account Region scope", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws
        .account("666666666666")
        .region("eu-west-2")
        .service("cloudFront" as never);
    });

    installSimCloudFront(simAws);

    const simCloudFront = simAws
      .account("666666666666")
      .region("eu-west-2")
      .service("cloudFront");

    assertInstanceOf(simCloudFront, SimCloudFront);
  });

  it("errors on trying to install twice into the same SimAws", () => {
    const simAws = new SimAws();

    installSimCloudFront(simAws);

    const error = assertThrowsError(() => {
      installSimCloudFront(simAws);
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Sim AWS service is already installed: cloudFront",
    );
  });
});
