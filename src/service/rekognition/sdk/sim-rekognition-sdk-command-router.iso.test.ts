import { assertArrayIncludesAll, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

describe("SimRekognitionSdkCommandRouter", () => {
  it("names every Command simulated Rekognition handles", () => {
    // Given a scoped simulated Rekognition.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws
      .rekognition()
      .sdkCommandRouter()
      .supportedCommandNames();

    // Then every simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "DetectModerationLabelsCommand",
      "DetectLabelsCommand",
      "DetectFacesCommand",
      "IndexFacesCommand",
      "ListFacesCommand",
      "SearchFacesByImageCommand",
      "DeleteFacesCommand",
    ]);
  });

  it("has no route for a Command simulated Rekognition does not handle", () => {
    // Given a scoped simulated Rekognition.
    const simAws = new SimAws();

    // When a detection operation that is not simulated yet is looked up.
    const route = simAws
      .rekognition()
      .sdkCommandRouter()
      .route("DetectTextCommand");

    // Then there is no route for it, so an intercepted client is told the
    // Command is unsupported rather than being answered with nothing.
    assertUndefined(route);
  });
});
