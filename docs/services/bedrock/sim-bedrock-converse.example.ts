/**
 * Declaring what a model answers one prompt with, and conversing with it.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws.bedrock().responses().onPrompt("Summarise entry 1042", {
  text: "Entry 1042 covers the tone sandhi rules.",
});

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

console.log(answered.output.message.content.at(0)?.text);
// "Entry 1042 covers the tone sandhi rules."
console.log(answered.stopReason); // "end_turn"
