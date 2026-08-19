/**
 * The Swagger extension SAM writes a path with no method of its own under.
 */
const anyMethodKey = "x-amazon-apigateway-any-method";

/**
 * The methods of one path the SAM CLI reported.
 *
 * It spells them as the path followed by the Swagger operation keys under it,
 * as in `/rates/{id}['post', 'get']`, and each one comes back as the
 * `POST /rates/{id}` an API Gateway method is read as here.
 */
export function samEndpointMethods(endpoint: string): string[] {
  const [path = endpoint, keys = ""] = endpoint.split("[", 2);

  return keys
    .replaceAll(/[[\]']/g, "")
    .split(",")
    .map((key) => `${samHttpMethod(key.trim())} ${path}`);
}

/**
 * One Swagger operation key as the HTTP method it stands for.
 */
function samHttpMethod(key: string): string {
  return key === anyMethodKey ? "ANY" : key.toUpperCase();
}
