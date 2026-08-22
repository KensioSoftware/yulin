/**
 * Declaring a model-specific response body and invoking the model.
 */

import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onModel("amazon.titan-text-express-v1", {
    body: { results: [{ outputText: "Entry 1042 covers tone sandhi." }] },
  });

const answered = await simAws.bedrock().invokeModel(
  new InvokeModelCommand({
    modelId: "amazon.titan-text-express-v1",
    body: JSON.stringify({ inputText: "Summarise entry 1042" }),
  }),
);

console.log(JSON.parse(new TextDecoder().decode(answered.body)));
// { results: [ { outputText: "Entry 1042 covers tone sandhi." } ] }
