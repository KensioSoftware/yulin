import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRekognitionBoundingBoxOutput } from "../../image/sim-rekognition-bounding-box.js";
import type { SimRekognitionImageInput } from "../../image/sim-rekognition-image-input.js";

/**
 * A face attribute Rekognition answers yes or no to, with how sure it is of
 * the answer.
 *
 * `Smile`, `Eyeglasses`, `Sunglasses`, `Beard`, `Mustache`, `EyesOpen`,
 * `MouthOpen` and `FaceOccluded` are all this shape on the wire, and all
 * separate types in the SDK, so one structural type stands in for each.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Smile.html
 */
export interface SimRekognitionFaceFeatureOutput {
  readonly Value: boolean;
  readonly Confidence: number;
}

/**
 * The gender predicted for a detected face.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Gender.html
 */
export interface SimRekognitionGenderOutput {
  readonly Value: string;
  readonly Confidence: number;
}

/**
 * The age range estimated for a detected face, in years.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_AgeRange.html
 */
export interface SimRekognitionAgeRangeOutput {
  readonly Low: number;
  readonly High: number;
}

/**
 * One emotion a detected face appears to express.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Emotion.html
 */
export interface SimRekognitionEmotionOutput {
  readonly Type: string;
  readonly Confidence: number;
}

/**
 * One facial landmark, located as ratios of the image's own size.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Landmark.html
 */
export interface SimRekognitionLandmarkOutput {
  readonly Type: string;
  readonly X: number;
  readonly Y: number;
}

/**
 * How a detected face is turned, in degrees.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_Pose.html
 */
export interface SimRekognitionPoseOutput {
  readonly Roll: number;
  readonly Yaw: number;
  readonly Pitch: number;
}

/**
 * How well a detected face was captured.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_ImageQuality.html
 */
export interface SimRekognitionImageQualityOutput {
  readonly Brightness: number;
  readonly Sharpness: number;
}

/**
 * Where a detected face is looking, in degrees.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_EyeDirection.html
 */
export interface SimRekognitionEyeDirectionOutput {
  readonly Yaw: number;
  readonly Pitch: number;
  readonly Confidence: number;
}

/**
 * One detected face.
 *
 * Every member is optional, as it is on AWS: a response carries the attributes
 * the request asked for and leaves the rest out entirely.
 *
 * https://docs.aws.amazon.com/rekognition/latest/APIReference/API_FaceDetail.html
 */
export interface SimRekognitionFaceDetailOutput {
  readonly BoundingBox?: SimRekognitionBoundingBoxOutput;
  readonly Confidence?: number;
  readonly Pose?: SimRekognitionPoseOutput;
  readonly Quality?: SimRekognitionImageQualityOutput;
  readonly Landmarks?: readonly SimRekognitionLandmarkOutput[];
  readonly AgeRange?: SimRekognitionAgeRangeOutput;
  readonly Gender?: SimRekognitionGenderOutput;
  readonly Emotions?: readonly SimRekognitionEmotionOutput[];
  readonly EyeDirection?: SimRekognitionEyeDirectionOutput;
  readonly Smile?: SimRekognitionFaceFeatureOutput;
  readonly Eyeglasses?: SimRekognitionFaceFeatureOutput;
  readonly Sunglasses?: SimRekognitionFaceFeatureOutput;
  readonly Beard?: SimRekognitionFaceFeatureOutput;
  readonly Mustache?: SimRekognitionFaceFeatureOutput;
  readonly EyesOpen?: SimRekognitionFaceFeatureOutput;
  readonly MouthOpen?: SimRekognitionFaceFeatureOutput;
  readonly FaceOccluded?: SimRekognitionFaceFeatureOutput;
}

/**
 * Minimal structural sim Rekognition DetectFaces command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/rekognition/command/DetectFacesCommand/
 */
export interface SimDetectFacesCommand {
  readonly input: SimDetectFacesCommandInput;
}

export interface SimDetectFacesCommandInput {
  readonly Image?: SimRekognitionImageInput | undefined;
  readonly Attributes?: readonly string[] | undefined;
}

/**
 * The DetectFaces response.
 *
 * `OrientationCorrection` is not carried, because AWS documents its value as
 * always null.
 */
export interface SimDetectFacesCommandOutput {
  readonly FaceDetails: readonly SimRekognitionFaceDetailOutput[];
  readonly $metadata: SimResponseMetadata;
}
