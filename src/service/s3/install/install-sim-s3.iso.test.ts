import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { installSimS3, SimS3 } from "./install-sim-s3.js";

describe("Sim S3 installer", () => {
  it("installs sim S3 into top-level sim AWS", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.service("s3" as never);
    });

    installSimS3(simAws);

    const simS3 = simAws.service("s3");

    assertInstanceOf(simS3, SimS3);
  });

  it("installs sim S3 into sim AWS Region", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.region("eu-west-2").service("s3" as never);
    });

    installSimS3(simAws);

    const simS3 = simAws.region("eu-west-2").service("s3");

    assertInstanceOf(simS3, SimS3);
  });

  it("installs sim S3 into sim AWS Account", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws.account("666666666666").service("s3" as never);
    });

    installSimS3(simAws);

    const simS3 = simAws.account("666666666666").service("s3");

    assertInstanceOf(simS3, SimS3);
  });

  it("installs sim S3 into sim AWS Account Region scope", () => {
    const simAws = new SimAws();

    assertThrowsError(() => {
      simAws
        .account("666666666666")
        .region("eu-west-2")
        .service("s3" as never);
    });

    installSimS3(simAws);

    const simS3 = simAws
      .account("666666666666")
      .region("eu-west-2")
      .service("s3");

    assertInstanceOf(simS3, SimS3);
  });

  it("errors on trying to install twice into the same SimAws", () => {
    const simAws = new SimAws();

    installSimS3(simAws);

    const error = assertThrowsError(() => {
      installSimS3(simAws);
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "Sim AWS service is already installed: s3",
    );
  });
});
