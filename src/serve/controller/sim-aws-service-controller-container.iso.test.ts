import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { SimAws } from "../../service/aws/sim-aws.js";
import { SimS3ServiceController } from "../../service/s3/serve/sim-s3-controller.js";
import { SimAwsServiceControllerContainer } from "./sim-aws-service-controller-container.js";

describe("SimAwsServiceControllerContainer", () => {
  it("returns S3 service controller", () => {
    const simAws = new SimAws();

    const container = new SimAwsServiceControllerContainer({ simAws });

    const controller = container.controllerForService("s3");

    assertInstanceOf(controller, SimS3ServiceController);
  });

  it("returns same controller for same service", () => {
    const simAws = new SimAws();

    const container = new SimAwsServiceControllerContainer({ simAws });

    assertIdentical(
      container.controllerForService("s3"),
      container.controllerForService("s3"),
    );
  });

  it("throws for unimplemented service controller", () => {
    const simAws = new SimAws();

    const container = new SimAwsServiceControllerContainer({ simAws });

    const error = assertThrowsError(() => {
      container.controllerForService("dynamodb");
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "No controller for simulated AWS service dynamodb",
    );
  });
});
