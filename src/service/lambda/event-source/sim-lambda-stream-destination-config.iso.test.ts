import { describe, expect, it } from "vitest";
import { simLambdaStreamDestinationConfig } from "./sim-lambda-stream-destination-config.js";
import { simAwsWithSqsEventSource } from "../../../../test/lambda/event-source-fixture.js";

describe("stream destination configuration", () => {
  it.each([
    undefined,
    {},
    { OnFailure: {} },
    { OnFailure: { Destination: "" } },
  ])("preserves an empty configuration %j", (config) => {
    // Given a configuration with no destination.
    // When it is validated.
    const parsed = simLambdaStreamDestinationConfig(config);
    // Then the empty configuration is preserved.
    expect(parsed).toStrictEqual(config);
  });

  it.each([
    null,
    "queue",
    [],
    { OnSuccess: {} },
    { OnFailure: null },
    { OnFailure: { Extra: true } },
    { OnFailure: { Destination: 1 } },
    { OnFailure: { Destination: "bad-arn" } },
    { OnFailure: { Destination: "arn:aws:s3:::failures" } },
    {
      OnFailure: {
        Destination: "arn:aws:lambda:us-east-1:111111111111:function:failure",
      },
    },
    {
      OnFailure: {
        Destination: "arn:aws:sqs:us-east-1:111111111111:failure.fifo",
      },
    },
    {
      OnFailure: {
        Destination: "arn:aws:sns:us-east-1:111111111111:failure.fifo",
      },
    },
  ])("refuses an unsupported configuration %j", (config) => {
    // Given a malformed or unsupported destination configuration.
    // When it is validated.
    // Then it fails before a mapping can silently ignore it.
    expect(() => simLambdaStreamDestinationConfig(config)).toThrow();
  });

  it("refuses destination configuration on a queue mapping", async () => {
    // Given an existing SQS event source.
    const { simAws } = await simAwsWithSqsEventSource();
    const mappings = await simAws
      .lambda()
      .listEventSourceMappings({ input: {} });
    const mapping = mappings.EventSourceMappings[0];
    // When another queue mapping requests a destination.
    // Then it is refused as an unsupported source configuration.
    await expect(
      simAws.lambda().createEventSourceMapping({
        input: {
          EventSourceArn: mapping?.EventSourceArn,
          FunctionName: mapping?.FunctionArn,
          DestinationConfig: {},
        },
      }),
    ).rejects.toThrow("DestinationConfig");
  });
});
