import type { SimHttpApiDomainNameConfiguration } from "../../domain/sim-http-api-domain-name.js";
import type { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";

const acceptedConfigurationOptions = [
  "CertificateArn",
  "CertificateName",
  "EndpointType",
  "SecurityPolicy",
];

/**
 * Read the `DomainNameConfigurations` a domain was created with.
 *
 * Nothing in them is applied. A simulated request arrives over plain HTTP on
 * localhost, so there is no TLS handshake for a certificate or a security
 * policy to take part in, and the configuration is recorded and reported back
 * the way `AWS::ApiGatewayV2::Api` records a `CorsConfiguration`. That is
 * where a test asserts the domain was given the certificate its stack meant to
 * give it.
 *
 * `EndpointType: "EDGE"` is refused. An edge-optimized custom domain is a
 * REST API feature, and an HTTP API domain is regional.
 */
export function simHttpApiDomainConfigurations(
  configurations: readonly SimHttpApiDomainNameConfiguration[] | undefined,
  unsimulated: SimApiGatewayV2UnsimulatedInput,
): readonly SimHttpApiDomainNameConfiguration[] {
  if (configurations === undefined) {
    return [];
  }

  return configurations.map((configuration, index) => {
    unsimulated.refuseUnaccepted(
      configuration,
      acceptedConfigurationOptions,
      `DomainNameConfigurations[${index}].`,
    );
    unsimulated.refuseUnless(
      "DomainNameConfigurations.EndpointType",
      configuration.EndpointType,
      "REGIONAL",
      "an edge-optimized custom domain name is a REST API feature",
    );

    return { ...configuration };
  });
}
