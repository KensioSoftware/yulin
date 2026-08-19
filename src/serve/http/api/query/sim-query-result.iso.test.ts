import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimQueryProtocol } from "./sim-query-response.js";
import {
  queryList,
  queryMap,
  queryMembers,
  queryScalarList,
  queryStructure,
} from "./sim-query-result.js";

/**
 * Writing the XML a Query protocol service answers with, which is the half of
 * the protocol an SDK reads an operation's output out of.
 */
describe("writing a Query protocol response", () => {
  const protocol = new SimQueryProtocol(
    "https://sns.amazonaws.com/doc/2010-03-31/",
  );

  it("writes the members an operation produced and leaves out the rest", () => {
    // Given an output holding some of the members the operation can answer with
    const output = { TopicArn: "arn:aws:sns:us-east-1:888888888888:orders" };

    // When the operation's members are written
    const written = queryMembers(output, ["TopicArn", "NextToken"]);

    // Then the absent one wrote no element at all, rather than an empty one
    assertIdentical(
      written,
      "<TopicArn>arn:aws:sns:us-east-1:888888888888:orders</TopicArn>",
    );
  });

  it("writes a timestamp and a number as the text XML carries them", () => {
    // Given members of the two kinds that are not already text
    const output = { CreationTime: new Date(0), Count: 2 };

    // When they are written
    const written = queryMembers(output, ["CreationTime", "Count"]);

    // Then each arrived in the form an SDK parses it back out of
    assertStringIncludes(
      written,
      "<CreationTime>1970-01-01T00:00:00.000Z</CreationTime>",
    );
    assertStringIncludes(written, "<Count>2</Count>");
  });

  it("writes a member with no scalar form as its JSON", () => {
    // Given an output member that resolved to a structure, as a CloudFormation
    // Output whose value is a list does
    const output = { OutputValue: ["one", "two"] };

    // When it is written
    const written = queryMembers(output, ["OutputValue"]);

    // Then the caller can see what it is
    assertIdentical(
      written,
      "<OutputValue>[&quot;one&quot;,&quot;two&quot;]</OutputValue>",
    );
  });

  it("nests the members of a structure inside it", () => {
    // Given an output holding a structure, as an assumed-role session's
    // credentials are
    const output = {
      Credentials: { AccessKeyId: "ASIAEXAMPLE", Expiration: new Date(0) },
    };

    // When the structure is written
    const written = queryStructure(output, "Credentials", (credentials) =>
      queryMembers(credentials, ["AccessKeyId", "Expiration"]),
    );

    // Then its members are inside it rather than alongside it
    assertIdentical(
      written,
      "<Credentials><AccessKeyId>ASIAEXAMPLE</AccessKeyId>" +
        "<Expiration>1970-01-01T00:00:00.000Z</Expiration></Credentials>",
    );
  });

  it("writes nothing for a structure the operation left out", () => {
    // Given an operation that answered without one of its structures, as a
    // refused request does
    const output = {};

    // When it is written
    // Then there is no element at all, rather than an empty one
    assertIdentical(
      queryStructure(output, "Credentials", () => ""),
      "",
    );
  });

  it("wraps each item of a list in a member element", () => {
    // Given a listing of structures
    const output = { Topics: [{ TopicArn: "one" }, { TopicArn: "two" }] };

    // When the list is written
    const written = queryList(output, "Topics", (topic) =>
      queryMembers(topic, ["TopicArn"]),
    );

    // Then each item is one member of the list
    assertIdentical(
      written,
      "<Topics><member><TopicArn>one</TopicArn></member>" +
        "<member><TopicArn>two</TopicArn></member></Topics>",
    );
  });

  it("wraps each item of a list of values in a member element", () => {
    // Given a listing of values rather than of structures
    const output = { phoneNumbers: ["+15550100", "+15550111"] };

    // When the list is written
    const written = queryScalarList(output, "phoneNumbers");

    // Then each value is one member of the list
    assertIdentical(
      written,
      "<phoneNumbers><member>+15550100</member>" +
        "<member>+15550111</member></phoneNumbers>",
    );
  });

  it("writes a map as the key and value entries Query has", () => {
    // Given an attributes map
    const output = { Attributes: { DisplayName: "Orders" } };

    // When it is written
    const written = queryMap(output, "Attributes");

    // Then each pair is one entry
    assertIdentical(
      written,
      "<Attributes><entry><key>DisplayName</key><value>Orders</value></entry></Attributes>",
    );
  });

  it("writes nothing for a list or a map the operation left out", () => {
    // Given an output holding none of them
    const output = {};

    // When each is written
    // Then nothing is, since there is no listing and no map to describe
    assertIdentical(
      queryList(output, "Topics", () => ""),
      "",
    );
    assertIdentical(queryScalarList(output, "phoneNumbers"), "");
    assertIdentical(queryMap(output, "Attributes"), "");
  });

  it("names an item of a list that is not a structure as an empty one", () => {
    // Given a listing whose items are values where structures were expected
    const output = { Topics: ["one"] };

    // When the list is written as structures
    const written = queryList(output, "Topics", (topic) =>
      queryMembers(topic, ["TopicArn"]),
    );

    // Then the item is written empty rather than made up
    assertIdentical(written, "<Topics><member></member></Topics>");
  });

  it("wraps a result in the envelope named after its operation", async () => {
    // When an operation's result is answered
    const response = protocol.response(
      "CreateTopic",
      "<TopicArn>one</TopicArn>",
    );

    // Then it arrived in the envelope an SDK reads the output out of, under
    // the namespace this service states
    const body = await response.text();
    assertIdentical(response.status, 200);
    assertStringIncludes(
      body,
      'xmlns="https://sns.amazonaws.com/doc/2010-03-31/"',
    );
    assertStringIncludes(
      body,
      "<CreateTopicResult><TopicArn>one</TopicArn></CreateTopicResult>",
    );
    assertStringIncludes(body, "<ResponseMetadata><RequestId>");
  });

  it("reports what a simulated operation threw, under the name it threw it as", async () => {
    // Given a simulated service error carrying the status real AWS answers with
    class NotFoundException extends Error {
      public override readonly name = "NotFoundException";
      public readonly $metadata = { httpStatusCode: 404 };
    }
    const error = new NotFoundException("no such topic");

    // When it is reported
    const response = protocol.failure(error);

    // Then the SDK has the name to raise it under
    assertIdentical(response.status, 404);
    assertStringIncludes(
      await response.text(),
      "<Code>NotFoundException</Code>",
    );
  });

  it("reports something thrown that is not an error at all as a fault", async () => {
    // When the simulator itself went wrong rather than the request
    const response = protocol.failure("dropped");

    // Then the failure is the receiver's rather than the sender's
    const body = await response.text();
    assertIdentical(response.status, 500);
    assertStringIncludes(body, "<Type>Receiver</Type>");
    assertStringIncludes(body, "<Code>InternalFailure</Code>");
  });
});
