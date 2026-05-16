// Random option index -> display name lookup.
// Source: rAthena item_randomopt_db.yml (mirrored to src/shared/random_options.json)

import db from "../shared/random_options.json";

type OptionEntry = {
  name: string;
  display: string;
  suffix: string;
  _sign?: "negative";
};

const options = db.options as unknown as Record<string, OptionEntry>;

export type DecodedOption = {
  index: number;
  value: number;
  param: number;
  /** Rendered like `Dano crítico +8%` */
  text: string;
  /** Stable internal handle (rAthena enum name), `unknown_<idx>` if not in DB */
  key: string;
};

export function decodeOption(
  index: number,
  value: number,
  param: number = 0,
): DecodedOption {
  const e = options[String(index)];
  if (!e) {
    return {
      index,
      value,
      param,
      text: `Option ${index}: ${value}`,
      key: `unknown_${index}`,
    };
  }
  const sign = e._sign === "negative" ? "-" : "+";
  return {
    index,
    value,
    param,
    text: `${e.display} ${sign}${value}${e.suffix}`,
    key: e.name,
  };
}

/** Returns the display label for an index without a value (for filter UI). */
export function optionLabel(index: number): string {
  const e = options[String(index)];
  return e?.display ?? `Option ${index}`;
}
