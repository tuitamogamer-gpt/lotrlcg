import { trialsGrantedImmunity } from "./three-trials-support";
import { card } from "./cards";
import { heirsPlayerTraitGrants } from "./heirs-player-cards";
import { mainQuestUnit } from "./quest-state";
import { rohanDynamicTraits, rohanDynamicKeywords } from "./rohan-player-cards";
import { khazadBlanked } from "./khazad-dum";
import type { GameState, Unit } from "./types";
import { emynMuilAttachmentsBlanked } from "./emyn-muil";
import { allActiveLocations, allCharacters, allEngaged } from "./table";

/** Keep printed-text effects consistent across stats, payment, actions and saves.
 * Blanking removes traits, keywords and abilities within the printed text box.
 * It preserves a card's title, ownership and physical attachment.
 */
export function syncAttachmentText(s: GameState, extra?: Unit) {
  const blanked = emynMuilAttachmentsBlanked(s);
  const quest = mainQuestUnit(s);
  const hosts = [
    ...(quest ? [quest] : []),
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...(s.prisoner ? [s.prisoner] : []),
    ...(s.captiveMendor ? [s.captiveMendor] : []),
    ...(extra ? [extra] : []),
  ];
  for (const host of hosts) {
    if (trialsGrantedImmunity(s, host.code)) host.immuneToPlayerEffects = true;
    else delete host.immuneToPlayerEffects;
    for (const attachment of host.attachments) {
      if (blanked || attachment.facedown || attachment.namelessCard)
        attachment.blanked = true;
      else delete attachment.blanked;
      const traits = heirsPlayerTraitGrants(s, attachment.id);
      if (traits.length) attachment.dynamicTraits = traits;
      else delete attachment.dynamicTraits;
    }
    if (
      khazadBlanked(host) ||
      (card(host.code).type_code === "attachment" && blanked)
    )
      host.blanked = true;
    else delete host.blanked;
    const traits = [
      ...new Set([
        ...rohanDynamicTraits(s, host),
        ...heirsPlayerTraitGrants(s, host.id),
      ]),
    ];
    if (traits.length) host.dynamicTraits = traits;
    else delete host.dynamicTraits;
  }
  for (const host of hosts) {
    const keywords = rohanDynamicKeywords(s, host);
    if (keywords.length) host.dynamicKeywords = keywords;
    else delete host.dynamicKeywords;
  }
}
