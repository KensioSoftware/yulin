/**
 * The version 7.0 content moderation label list, and the model version it is
 * the label list of.
 *
 * The two live together so they cannot drift apart. Real Rekognition moved
 * from 6.1 to 7.0 by renaming most of the top-level categories, so a response
 * naming one version's labels under the other version's number would describe
 * nothing AWS has ever returned.
 */

/**
 * The moderation model version this taxonomy is the taxonomy of.
 *
 * It is pinned here rather than anywhere else so that the version a response
 * reports and the labels it can carry cannot drift apart. Real Rekognition
 * moved from 6.1 to 7.0 by renaming most of the top-level categories, so a
 * response naming one version's labels under the other version's number would
 * describe nothing AWS has ever returned.
 */
export const simRekognitionModerationModelVersion = "7.0";

/**
 * Every label in the version 7.0 content moderation taxonomy, as a name and
 * the name of its parent. A top-level label has no parent.
 *
 * This is the whole taxonomy rather than a useful subset of it, because the
 * point of holding it at all is that a declared label expands to the same
 * ancestors real Rekognition would have returned with it.
 */
export const moderationLabels: readonly (readonly [string, string])[] = [
  ["Explicit", ""],
  ["Explicit Nudity", "Explicit"],
  ["Exposed Male Genitalia", "Explicit Nudity"],
  ["Exposed Female Genitalia", "Explicit Nudity"],
  ["Exposed Buttocks or Anus", "Explicit Nudity"],
  ["Exposed Female Nipple", "Explicit Nudity"],
  ["Explicit Sexual Activity", "Explicit"],
  ["Sex Toys", "Explicit"],
  ["Non-Explicit Nudity of Intimate parts and Kissing", ""],
  ["Non-Explicit Nudity", "Non-Explicit Nudity of Intimate parts and Kissing"],
  ["Bare Back", "Non-Explicit Nudity"],
  ["Exposed Male Nipple", "Non-Explicit Nudity"],
  ["Partially Exposed Buttocks", "Non-Explicit Nudity"],
  ["Partially Exposed Female Breast", "Non-Explicit Nudity"],
  ["Implied Nudity", "Non-Explicit Nudity"],
  [
    "Obstructed Intimate Parts",
    "Non-Explicit Nudity of Intimate parts and Kissing",
  ],
  ["Obstructed Female Nipple", "Obstructed Intimate Parts"],
  ["Obstructed Male Genitalia", "Obstructed Intimate Parts"],
  ["Kissing on the Lips", "Non-Explicit Nudity of Intimate parts and Kissing"],
  ["Swimwear or Underwear", ""],
  ["Female Swimwear or Underwear", "Swimwear or Underwear"],
  ["Male Swimwear or Underwear", "Swimwear or Underwear"],
  ["Violence", ""],
  ["Weapons", "Violence"],
  ["Graphic Violence", "Violence"],
  ["Weapon Violence", "Graphic Violence"],
  ["Physical Violence", "Graphic Violence"],
  ["Self-Harm", "Graphic Violence"],
  ["Blood & Gore", "Graphic Violence"],
  ["Explosions and Blasts", "Graphic Violence"],
  ["Visually Disturbing", ""],
  ["Death and Emaciation", "Visually Disturbing"],
  ["Emaciated Bodies", "Death and Emaciation"],
  ["Corpses", "Death and Emaciation"],
  ["Crashes", "Visually Disturbing"],
  ["Air Crash", "Crashes"],
  ["Drugs & Tobacco", ""],
  ["Products", "Drugs & Tobacco"],
  ["Pills", "Products"],
  ["Drugs & Tobacco Paraphernalia & Use", "Drugs & Tobacco"],
  ["Smoking", "Drugs & Tobacco Paraphernalia & Use"],
  ["Alcohol", ""],
  ["Alcohol Use", "Alcohol"],
  ["Drinking", "Alcohol Use"],
  ["Alcoholic Beverages", "Alcohol"],
  ["Rude Gestures", ""],
  ["Middle Finger", "Rude Gestures"],
  ["Gambling", ""],
  ["Hate Symbols", ""],
  ["Nazi Party", "Hate Symbols"],
  ["White Supremacy", "Hate Symbols"],
  ["Extremist", "Hate Symbols"],
];
