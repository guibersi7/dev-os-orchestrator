/**
 * Portuguese is never singularized programmatically here.
 *
 * `"decisões".replace(/e?s$/, "")` yields `"decisõ"`, and the adjective has to
 * agree with the noun on top of that ("paradas" vs "parada"). Every builder that
 * counts something emits both forms explicitly and this module picks one.
 */
export type PluralPair = {
  /** [noun, consequence] as written for n === 1. */
  one: [string, string];
  /** [noun, consequence] as written for every other n, including 0. */
  many: [string, string];
};

export type PluralizedPhrase = {
  noun: string;
  consequence: string;
};

export function pluralize(n: number, pair: PluralPair): PluralizedPhrase {
  const [noun, consequence] = n === 1 ? pair.one : pair.many;
  return { noun, consequence };
}
