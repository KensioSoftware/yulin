import type { SimRekognitionFacesResult } from "./sim-rekognition-face-declaration.js";

/**
 * What DetectFaces answers with before anything is configured.
 *
 * This is the example response from the AWS DetectFaces documentation,
 * attribute for attribute, so an unconfigured detection answers with something
 * real Rekognition has actually returned rather than something invented here.
 * One face is the common shape: an uploaded photograph of a person.
 *
 * Which face comes back for an arbitrary image is a simulator convention. No
 * image is looked at, so a photograph of a lighthouse gets this face too.
 *
 * https://docs.aws.amazon.com/rekognition/latest/dg/faces-detect-images.html
 */
export const simRekognitionDefaultFaces: SimRekognitionFacesResult = {
  faces: [
    {
      boundingBox: {
        left: 0.08881539851427078,
        top: 0.151064932346344,
        width: 0.7919622659683228,
        height: 0.7510867118835449,
      },
      confidence: 99.99872589111328,
      ageRange: { low: 18, high: 26 },
      gender: { value: "Female", confidence: 99.85968780517578 },
      smile: { value: false, confidence: 89.77348327636719 },
      eyeglasses: { value: true, confidence: 99.99996948242188 },
      sunglasses: { value: true, confidence: 93.652374267578125 },
      beard: { value: false, confidence: 77.52591705322266 },
      mustache: { value: false, confidence: 94.489044189453125 },
      eyesOpen: { value: true, confidence: 98.57169342041016 },
      mouthOpen: { value: false, confidence: 74.33953094482422 },
      faceOccluded: { value: true, confidence: 99.99726104736328 },
      eyeDirection: {
        yaw: 16.299732,
        pitch: -6.407457,
        confidence: 99.968704,
      },
      pose: {
        roll: -5.83309268951416,
        yaw: -2.4244730472564697,
        pitch: 2.6216139793395996,
      },
      quality: { brightness: 96.16363525390625, sharpness: 95.51618957519531 },
      emotions: [
        { type: "SAD", confidence: 65.56403350830078 },
        { type: "CONFUSED", confidence: 31.277774810791016 },
        { type: "DISGUSTED", confidence: 15.553778648376465 },
        { type: "ANGRY", confidence: 8.012762069702148 },
        { type: "SURPRISED", confidence: 7.621500015258789 },
        { type: "FEAR", confidence: 7.243380546569824 },
        { type: "CALM", confidence: 5.8196024894714355 },
        { type: "HAPPY", confidence: 2.2830512523651123 },
      ],
      landmarks: {
        eyeLeft: { x: 0.30225440859794617, y: 0.41018882393836975 },
        eyeRight: { x: 0.6439348459243774, y: 0.40341562032699585 },
        mouthLeft: { x: 0.343580037355423, y: 0.6951127648353577 },
        mouthRight: { x: 0.6306480765342712, y: 0.6898072361946106 },
        nose: { x: 0.47164231538772583, y: 0.5763645172119141 },
        leftEyeBrowLeft: { x: 0.1732882857322693, y: 0.34452149271965027 },
        leftEyeBrowRight: { x: 0.3655243515968323, y: 0.33231860399246216 },
        leftEyeBrowUp: { x: 0.2671719491481781, y: 0.31669262051582336 },
        rightEyeBrowLeft: { x: 0.5613729953765869, y: 0.32813435792922974 },
        rightEyeBrowRight: { x: 0.7665090560913086, y: 0.3318614959716797 },
        rightEyeBrowUp: { x: 0.6612788438796997, y: 0.3082450032234192 },
        leftEyeLeft: { x: 0.2416982799768448, y: 0.4085965156555176 },
        leftEyeRight: { x: 0.36943578720092773, y: 0.41230902075767517 },
        leftEyeUp: { x: 0.29974061250686646, y: 0.3971870541572571 },
        leftEyeDown: { x: 0.30360740423202515, y: 0.42347756028175354 },
        rightEyeLeft: { x: 0.5755768418312073, y: 0.4081145226955414 },
        rightEyeRight: { x: 0.7050536870956421, y: 0.39924031496047974 },
        rightEyeUp: { x: 0.642906129360199, y: 0.39026668667793274 },
        rightEyeDown: { x: 0.6423097848892212, y: 0.41669243574142456 },
        noseLeft: { x: 0.4122826159000397, y: 0.5987403392791748 },
        noseRight: { x: 0.5394935011863708, y: 0.5960900187492371 },
        mouthUp: { x: 0.478581964969635, y: 0.6660456657409668 },
        mouthDown: { x: 0.483366996049881, y: 0.7497162818908691 },
        leftPupil: { x: 0.30225440859794617, y: 0.41018882393836975 },
        rightPupil: { x: 0.6439348459243774, y: 0.40341562032699585 },
        upperJawlineLeft: { x: 0.11031254380941391, y: 0.3980775475502014 },
        midJawlineLeft: { x: 0.19301874935626984, y: 0.7034031748771667 },
        chinBottom: { x: 0.4939905107021332, y: 0.8877836465835571 },
        midJawlineRight: { x: 0.7990140914916992, y: 0.6899225115776062 },
        upperJawlineRight: { x: 0.8548634648323059, y: 0.38160091638565063 },
      },
    },
  ],
};

/**
 * An image with nobody in it.
 *
 * This is the result to declare for a photograph of a landscape, or for the
 * upload a face detection is meant to reject.
 */
export const simRekognitionNoFaces: SimRekognitionFacesResult = { faces: [] };

/**
 * An image with three people in it, side by side.
 *
 * The faces carry a bounding box and a confidence each and nothing else, so a
 * request for `ALL` gets three faces with only the default attributes on them.
 * Declare the attributes the code under test reads.
 */
export const simRekognitionSeveralFaces: SimRekognitionFacesResult = {
  faces: [
    {
      boundingBox: { left: 0.08, top: 0.22, width: 0.19, height: 0.28 },
      confidence: 99.94,
    },
    {
      boundingBox: { left: 0.4, top: 0.18, width: 0.2, height: 0.3 },
      confidence: 99.87,
    },
    {
      boundingBox: { left: 0.7, top: 0.24, width: 0.18, height: 0.27 },
      confidence: 98.62,
    },
  ],
};
