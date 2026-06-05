import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { SimAws } from "../service/aws/sim-aws.js";
import { SimS3ServiceController } from "../service/s3/serve/sim-s3-controller.js";
import { SimAwsServiceControllerContainer } from "./sim-aws-service-controller-container.js";

describe("SimAwsServiceControllerContainer", () => {
  it("returns S3 service controller", () => {
    const container = new SimAwsServiceControllerContainer(new SimAws());

    const controller = container.controllerForService("s3");

    assertInstanceOf(controller, SimS3ServiceController);
  });

  it("returns same controller for same service", () => {
    const container = new SimAwsServiceControllerContainer(new SimAws());

    assertIdentical(
      container.controllerForService("s3"),
      container.controllerForService("s3"),
    );
  });

  it("throws for unimplemented service controller", () => {
    const container = new SimAwsServiceControllerContainer(new SimAws());

    const error = assertThrowsError(() => {
      container.controllerForService("dynamodb");
    });

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "No controller implemented for simulated AWS service dynamodb",
    );
  });
});
