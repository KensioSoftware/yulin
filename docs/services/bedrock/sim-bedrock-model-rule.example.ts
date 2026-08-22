/**
 * Declaring one answer for every call to a model.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onModel("amazon.nova-pro-v1:0", { text: "A short summary." });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "amazon.nova-pro-v1:0",
    messages: [{ role: "user", content: [{ text: "Anything at all" }] }],
  }),
);

console.log(answered.output.message.content.at(0)?.text); // "A short summary."
