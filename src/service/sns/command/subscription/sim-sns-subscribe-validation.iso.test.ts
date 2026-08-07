import { assertInstanceOf, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  endpointRefusal,
  protocolRefusal,
  simSnsEndpointsThatAreNotQueues,
  simSnsUnsimulatedProtocols,
} from "../../../../../test/sns/subscription-fixture.js";
import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../../error/sim-sns.error.js";

describe("SNS Subscribe validation", () => {
  it("refuses a protocol real SNS has that is not simulated, by name", async () => {
    // Given a topic.
    // When a queue is subscribed over each protocol nothing delivers over.
    const refusals = await Promise.all(
      simSnsUnsimulatedProtocols.map(async (protocol) =>
        protocolRefusal(protocol),
      ),
    );

    // Then each is refused for what it is, rather than accepted as a
    // subscription that would never be delivered to.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsUnsimulatedInputException);
      assertStringIncludes(error.message, "is not simulated");
    }
  });

  it("refuses a protocol real SNS does not have at all", async () => {
    // Given a topic.
    // When a queue is subscribed over a misspelled protocol.
    const error = await protocolRefusal("SQS");

    // Then it is refused the way real SNS refuses one, rather than with the
    // simulator's own reason for a protocol it is missing.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "is not a subscription protocol");
  });

  it("refuses a request naming no protocol at all", async () => {
    // Given a topic.
    // When a queue is subscribed without saying how it is reached.
    const error = await protocolRefusal(undefined);

    // Then it is refused, since nothing says what the endpoint is.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "(none) is not a subscription");
  });

  it("refuses an endpoint that is not a queue ARN", async () => {
    // Given a topic.
    // When the sqs protocol is given something else as its endpoint, including
    // no endpoint at all.
    const refusals = await Promise.all(
      [...simSnsEndpointsThatAreNotQueues, undefined].map(async (endpoint) =>
        endpointRefusal(endpoint),
      ),
    );

    // Then each is refused, since an sqs subscription delivers to a queue and
    // none of these names one.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsInvalidParameterException);
      assertStringIncludes(error.message, "is not an SQS queue ARN");
    }
  });

  it("refuses a FIFO queue endpoint", async () => {
    // Given a topic.
    // When a FIFO queue is subscribed to it.
    const error = await endpointRefusal(
      "arn:aws:sqs:us-east-1:888888888888:orders.fifo",
    );

    // Then it is refused: only a FIFO topic delivers to a FIFO queue, and
    // there are no FIFO topics here.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
    assertStringIncludes(error.message, "only a FIFO topic");
  });
});
