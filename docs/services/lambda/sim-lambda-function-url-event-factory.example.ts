/**
 * Making a Lambda Function URL invocation event to call a handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import {
  lambdaFunctionUrlEventFactory,
  type SimLambdaFunctionUrlEvent,
  type SimLambdaFunctionUrlResult,
} from "@kensio/yulin/lambda";

function greeter(event: SimLambdaFunctionUrlEvent): SimLambdaFunctionUrlResult {
  return {
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: `Hello ${event.queryStringParameters?.["name"] ?? "world"}`,
  };
}

const event = lambdaFunctionUrlEventFactory.make({
  rawPath: "/greet",
  rawQueryString: "name=Yulin",
});

// Hello Yulin
console.log(greeter(event).body);

// A named variation of a request is a VariantFactory around it, as with any
// other @kensio/part-factory factory.
const formPostFactory = new VariantFactory(lambdaFunctionUrlEventFactory, {
  headers: { "content-type": "application/x-www-form-urlencoded" },
  requestContext: { http: { method: "POST" } },
});

const formPost = formPostFactory.make({
  rawPath: "/subscribe",
  body: "email=someone%40yulin.test",
});

// POST /subscribe
console.log(
  `${formPost.requestContext.http.method} ${formPost.requestContext.http.path}`,
);
