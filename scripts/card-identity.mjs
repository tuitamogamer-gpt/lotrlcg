// An OCTGN printing without a RingsDB UUID must match the card's actual
// mechanics. Same-name versions (notably both neutral Gandalf allies) can
// share their sphere, cost and every combat stat while having different rules.
const normalizedText = (text = "") =>
  String(text)
    .replace(/\\[nr]/g, " ")
    .replace(/<[^>]*>/g, "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const mechanicFingerprint = (card) =>
  JSON.stringify({
    rules: normalizedText(card.text),
    stats: ["cost", "threat", "willpower", "attack", "defense", "health"].map(
      (key) =>
        key === "cost" && card.type_code === "hero"
          ? ""
          : String(card[key] ?? card.printed_stats?.[key] ?? ""),
    ),
    unique: Boolean(card.is_unique),
  });
export const canonicalReprint = (candidates, printing) => {
  const fingerprint = mechanicFingerprint(printing);
  const matches = candidates.filter(
    (candidate) => mechanicFingerprint(candidate) === fingerprint,
  );
  // Never resolve an ambiguous or materially different version by insertion
  // order. The importer preserves its separate source identity instead.
  return matches.length === 1 ? matches[0] : undefined;
};
