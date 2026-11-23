/**
 * Declaring a reply that matches the structured output schema a request asks for.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .bedrock()
  .responses()
  .onModel("qwen.qwen3-32b-v1:0", {
    text: JSON.stringify({ verdict: "approved", reason: "On topic." }),
  });

const answered = await simAws.bedrock().converse(
  new ConverseCommand({
    modelId: "qwen.qwen3-32b-v1:0",
    messages: [{ role: "user", content: [{ text: "Review entry 1042" }] }],
    outputConfig: {
      textFormat: {
        type: "json_schema",
        structure: {
          jsonSchema: {
            name: "entry_review",
            schema: JSON.stringify({
              type: "object",
              properties: {
                verdict: { type: "string", enum: ["approved", "rejected"] },
                reason: { type: "string" },
              },
              required: ["verdict", "reason"],
              additionalProperties: false,
            }),
          },
        },
      },
    },
  }),
);

console.log(answered.output.message.content.at(0)?.text);
// '{"verdict":"approved","reason":"On topic."}'
