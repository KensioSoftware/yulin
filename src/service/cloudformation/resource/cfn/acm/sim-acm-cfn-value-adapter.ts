import { SimAcmCertificate } from "../../../../acm/certificate/sim-acm-certificate.js";
import { SimAcmCertificateCfn } from "./sim-acm-certificate-cfn.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";

/**
 * The CloudFormation-facing value adapter for a simulated ACM Resource.
 */
export function acmValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::CertificateManager::Certificate" &&
    properties.simResource instanceof SimAcmCertificate
  ) {
    return new SimAcmCertificateCfn({ certificate: properties.simResource });
  }

  return undefined;
}
