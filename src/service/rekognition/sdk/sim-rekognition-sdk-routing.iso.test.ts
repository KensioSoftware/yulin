import {
  DetectModerationLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../test/rekognition/image-fixture.js";
import { SimSdk } from "../../../sdk/index.js";

describe("Rekognition SDK interception", () => {
  it("routes an intercepted RekognitionClient to simulated Rekognition", async () => {
    // Given an intercepted Rekognition SDK client, with an image declared to
    // fail moderation.
    const simSdk = new SimSdk();
    simSdk.intercept(RekognitionClient);
    simSdk.simAws
      .rekognition()
      .moderation()
      .byDefault({ labels: ["Explicit Nudity"] });

    const rekognition = new RekognitionClient({ region: "us-east-1" });

    // When ordinary SDK code moderates an image.
    const detected = await rekognition.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: redPngBytes } }),
    );

    // Then the declared result comes back, with nothing touching the network.
    assertIdentical(detected.ModerationModelVersion, "7.0");
    assertStringIncludes(
      (detected.ModerationLabels ?? []).map((label) => label.Name).join(","),
      "Explicit Nudity",
    );

    simSdk.restoreAll();
  });
});
