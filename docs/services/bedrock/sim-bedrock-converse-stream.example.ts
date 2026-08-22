/**
 * Declaring a response in chunks and accumulating the stream.
 */

import { ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onPrompt("Summarise entry 1042", {
    chunks: ["Entry 1042 covers ", "the tone sandhi rules."],
  });

const answered = await simAws.bedrock().converseStream(
  new ConverseStreamCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

let accumulated = "";

for await (const event of answered.stream) {
  accumulated += event.contentBlockDelta?.delta.text ?? "";
}

console.log(accumulated); // "Entry 1042 covers the tone sandhi rules."
