import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { readSimQueryRequest, SimQueryFields } from "./sim-query-request.js";

/**
 * Reading the AWS Query protocol's form encoding, which every Query service
 * states its input in.
 */
describe("reading a Query protocol request", () => {
  /**
   * A POST carrying form-encoded fields, which is what an SDK client sends.
   */
  function posted(body: string): Request {
    return new Request("http://localhost/", { method: "POST", body });
  }

  function fieldsOf(body: string): SimQueryFields {
    return new SimQueryFields(new URLSearchParams(body));
  }

  it("names the operation the Action field states", () => {
    // Given a request stating an operation and one of its members
    const request = posted("Action=Publish&Message=hello");

    // When it is read as the Query request it is
    const query = readSimQueryRequest(
      request,
      Buffer.from("Action=Publish&Message=hello"),
    );
    assertNonNullable(query, "a Query request");

    // Then the operation and its input both came off the form encoding
    assertIdentical(query.action, "Publish");
    assertIdentical(query.fields.text("Message"), "hello");
  });

  it("reads the fields of a GET out of the query string", () => {
    // Given a request that put its fields in the URL rather than in a body
    const request = new Request(
      "http://localhost/?Action=ListTopics&NextToken=100",
    );

    // When it is read with no body to read them from
    const query = readSimQueryRequest(request, new Uint8Array());
    assertNonNullable(query, "a Query request");

    // Then the query string answered instead
    assertIdentical(query.action, "ListTopics");
    assertIdentical(query.fields.text("NextToken"), "100");
  });

  it("is not a Query request without an Action", () => {
    // Given a form-encoded request naming no operation
    const body = Buffer.from("Version=2010-03-31");

    // When it is read
    const query = readSimQueryRequest(posted("Version=2010-03-31"), body);

    // Then there is no Query request to answer
    assertUndefined(query);
  });

  it("reads a flag and a blob back out of their text", () => {
    // Given the two members Query does not carry as plain text
    const fields = fieldsOf("Raw=true&Cooked=false&Label=cHJpbnRlZA==");

    // When each is read as what it stands for
    // Then the spelling turned back into the value
    assertTrue(fields.flag("Raw") ?? false);
    assertFalse(fields.flag("Cooked") ?? true);
    assertUndefined(fields.flag("Missing"));
    assertIdentical(
      Buffer.from(fields.binary("Label") ?? new Uint8Array()).toString("utf8"),
      "printed",
    );
    assertUndefined(fields.binary("Missing"));
  });

  it("orders list members by their subscript rather than by field order", () => {
    // Given a list whose tenth member was written before its second
    const fields = fieldsOf(
      "Tags.member.10.Key=ten&Tags.member.2.Key=two&Tags.member.1.Key=one",
    );

    // When the list is read
    const keys = fields.list("Tags", (tag) => tag.text("Key"));

    // Then it arrives in the order the subscripts put it in
    assertArrayEquals(keys ?? [], ["one", "two", "ten"]);
  });

  it("has nothing to say about a list nobody stated", () => {
    // Given a request stating no tags at all
    const fields = fieldsOf("Name=orders");

    // When the list is read
    // Then it is absent rather than empty, since a simulated service refusing
    // a member it does not implement has to tell the two apart
    assertUndefined(fields.list("Tags", (tag) => tag.text("Key")));
  });

  it("reads a map, dropping an entry that names no key", () => {
    // Given attributes of which one entry carries a value and no key
    const fields = fieldsOf(
      "Attributes.entry.1.key=DisplayName&Attributes.entry.1.value=Orders" +
        "&Attributes.entry.2.value=orphan&Attributes.entry.3.key=Empty",
    );

    // When the map is read
    const attributes = fields.attributes("Attributes") ?? {};

    // Then the keyed entries are there and the unkeyed one is gone
    assertIdentical(attributes["DisplayName"], "Orders");
    assertIdentical(attributes["Empty"], "");
    assertArrayLength(Object.keys(attributes), 2);
  });

  it("has nothing to say about a map nobody stated", () => {
    // Given a request stating no attributes
    const fields = fieldsOf(
      "TopicArn=arn:aws:sns:us-east-1:888888888888:orders",
    );

    // When the map is read
    // Then it is absent rather than empty
    assertUndefined(fields.attributes("Attributes"));
  });
});
