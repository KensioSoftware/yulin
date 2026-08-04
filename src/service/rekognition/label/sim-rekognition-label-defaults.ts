import type { SimRekognitionLabelsResult } from "./sim-rekognition-label-declaration.js";

/**
 * The version of the label detection model these results come from.
 *
 * It is pinned beside the default result rather than made up per response,
 * because the two describe each other: the labels below are what this version
 * of the model reported for the image AWS documents them against.
 */
export const simRekognitionLabelModelVersion = "3.0";

/**
 * What DetectLabels answers with before anything is configured.
 *
 * This is the example response from the AWS DetectLabels documentation, label
 * for label, so an unconfigured detection answers with something real
 * Rekognition has actually returned rather than something invented here.
 * Which labels come back for an arbitrary image is a simulator convention: no
 * image is looked at, so a photograph of a lighthouse gets these too.
 *
 * https://docs.aws.amazon.com/rekognition/latest/dg/labels-detect-labels-image.html
 */
export const simRekognitionDefaultLabels: SimRekognitionLabelsResult = {
  labels: [
    {
      name: "Mobile Phone",
      confidence: 99.9364013671875,
      parents: ["Phone"],
      aliases: ["Cell Phone"],
      categories: ["Technology and Computing"],
      instances: [
        {
          boundingBox: {
            left: 0.3604024350643158,
            top: 0.09245597571134567,
            width: 0.26779675483703613,
            height: 0.8562285900115967,
          },
          confidence: 99.9364013671875,
        },
      ],
    },
  ],
};
