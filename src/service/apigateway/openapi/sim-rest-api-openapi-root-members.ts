/**
 * The root members that change what the API serves and are not simulated.
 */
export const simRestApiOpenApiRefusedRootMembers: readonly (readonly [
  string,
  string,
])[] = [
  [
    "servers",
    "a server URL sets the base path every method is served under, and base " +
      "path handling is not simulated",
  ],
  [
    "security",
    "a security requirement applying to every operation is not simulated, " +
      "because authorizing a method is not simulated",
  ],
  [
    "x-amazon-apigateway-policy",
    "a resource policy on the API is not simulated, so every request that " +
      "reaches a method here is served",
  ],
  [
    "x-amazon-apigateway-binary-media-types",
    "binary media types negotiated by Accept are not simulated",
  ],
  [
    "x-amazon-apigateway-gateway-responses",
    "gateway responses are not simulated, and a request nothing matches is " +
      "answered with API Gateway's own default",
  ],
  [
    "x-amazon-apigateway-request-validators",
    "request validation is not simulated, so a request the document declares " +
      "as invalid still reaches the handler",
  ],
  [
    "x-amazon-apigateway-api-key-source",
    "API keys and usage plans are not simulated",
  ],
  [
    "x-amazon-apigateway-endpoint-configuration",
    "endpoint types are not simulated, and every API is served on the one " +
      "generated endpoint",
  ],
  [
    "x-amazon-apigateway-minimum-compression-size",
    "response compression is not simulated",
  ],
];
