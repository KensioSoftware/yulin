/**
 * Declaring what a response cost, for code that meters token spend.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .byDefault({
    text: "A short summary.",
    usage: { inputTokens: 1400, outputTokens: 220 },
  });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

console.log(answered.usage.totalTokens); // 1620
