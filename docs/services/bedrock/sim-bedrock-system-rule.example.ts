/**
 * Declaring a response for each of two features that share one model.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const responses = simAws.bedrock().responses();

responses.onSystem("Review the entry and answer with a JSON verdict.", {
  text: JSON.stringify({ verdict: "approved" }),
});
responses.onSystem("Translate the entry into English.", {
  text: "The translated entry.",
});

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "amazon.nova-pro-v1:0",
    system: [{ text: "Translate the entry into English." }],
    messages: [{ role: "user", content: [{ text: "Entry 1042" }] }],
  }),
);

console.log(answered.output.message.content.at(0)?.text);
// "The translated entry."
