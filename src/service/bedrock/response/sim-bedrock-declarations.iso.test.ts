import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

describe("Bedrock response declarations", () => {
  it("refuses a response carrying both text and content blocks", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a response is declared twice over.
    const error = assertThrowsError(() => {
      simAws
        .bedrock()
        .responses()
        .byDefault({
          text: "Tone sandhi.",
          content: [{ text: "Tone sandhi." }],
        });
    });

    // Then it is refused where it was written.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "carries text and content");
  });

  it("refuses a response carrying both chunks and text", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a response says what the message holds two ways.
    const error = assertThrowsError(() => {
      simAws
        .bedrock()
        .responses()
        .byDefault({ text: "Tone sandhi.", chunks: ["Tone ", "sandhi."] });
    });

    // Then it is refused where it was written.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "declare one of them");
  });

  it("refuses a content block carrying text and a tool use at once", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a block says two things.
    const error = assertThrowsError(() => {
      simAws
        .bedrock()
        .responses()
        .onPrompt("Anything", {
          content: [{ text: "Looking it up.", toolUse: { name: "lookUp" } }],
        });
    });

    // Then it names the rule it was declared for.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "the prompt 'Anything'");
  });

  it("refuses a response with nothing to answer with", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a response declares only why it stopped.
    const error = assertThrowsError(() => {
      simAws.bedrock().responses().byDefault({ stopReason: "max_tokens" });
    });

    // Then it says what to declare instead.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "no text, no content and no body");
    assertStringIncludes(error.message, "Declare text, chunks or content");
  });

  it("refuses a negative token count", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a response reports fewer than no tokens.
    const error = assertThrowsError(() => {
      simAws
        .bedrock()
        .responses()
        .byDefault({ text: "Short.", usage: { outputTokens: -1 } });
    });

    // Then it is refused where it was written.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "never negative");
  });

  it("refuses a rule with no prompt to match", () => {
    // Given a simulated Bedrock.
    const simAws = new SimAws();

    // When a rule is declared for an empty prompt.
    const error = assertThrowsError(() => {
      simAws.bedrock().responses().onPrompt("", { text: "Anything." });
    });

    // Then it says a rule needs something to match.
    assertIdentical(error.name, "SimBedrockDeclarationError");
    assertStringIncludes(error.message, "needs a prompt to match");
  });
});
