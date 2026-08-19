/**
 * The service principal API Gateway invokes a Lambda function as.
 *
 * An `AWS::Lambda::Permission` for a proxy integration grants this principal,
 * so it lives at the service root rather than inside the serving layer that
 * evaluates the grant. That keeps the API model, which writes the permission
 * in test setup, from reaching into the layer that reads it.
 *
 * REST APIs and HTTP APIs are separate services and separate SDK clients, and
 * they invoke a function as the same principal. A permission granted to it
 * therefore says nothing about which of the two is calling, which is what the
 * source ARN says.
 */
export const simApiGatewayServicePrincipal = "apigateway.amazonaws.com";
