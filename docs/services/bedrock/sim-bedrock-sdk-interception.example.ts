/**
 * Answering production code that holds its own Bedrock Runtime client.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(BedrockRuntimeClient);

simSdk.simAws
  .account()
  .region("eu-west-2")
  .bedrock()
  .responses()
  .byDefault({ text: "Entry 1042 covers the tone sandhi rules." });

const client = new BedrockRuntimeClient({ region: "eu-west-2" });

const answered = await client.send(
  new ConverseCommand({
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages: [{ role: "user", content: [{ text: "Summarise entry 1042" }] }],
  }),
);

console.log(answered.output?.message?.content?.at(0)?.text);
// "Entry 1042 covers the tone sandhi rules."

client.destroy();
simSdk.restoreAll();
