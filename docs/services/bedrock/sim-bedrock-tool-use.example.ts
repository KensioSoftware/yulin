/**
 * Declaring a tool call for the code under test to handle.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onPrompt("What is in entry 1042?", {
    content: [
      {
        toolUse: {
          toolUseId: "tooluse-1",
          name: "lookUpEntry",
          input: { entryId: "1042" },
        },
      },
    ],
  });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "What is in entry 1042?" }] }],
  }),
);

console.log(answered.stopReason); // "tool_use"
console.log(answered.output.message.content.at(0)?.toolUse?.name);
// "lookUpEntry"
