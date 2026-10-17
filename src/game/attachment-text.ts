import * as EredSupport from "./ered-mithrin-player-support";
import { batch4Scenario } from "./batch4-scenarios";
import * as Sands from "./beneath-sands";
import * as Race from "./race-harad";
import * as Drowned from "./drowned";
import * as Desert from "./desert-crossing";
import * as Umbar from "./escape-umbar";
import * as Mordor from "./long-arm-mordor";
import * as Mumakil from "./mumakil";
import { stormcallerAreaImmune } from "./stormcaller";
import { stormcallerState } from "./stormcaller-support";
import { trialsGrantedImmunity } from "./three-trials-support";
import { card } from "./cards";
import { heirsPlayerTraitGrants } from "./heirs-player-cards";
import { mainQuestUnit } from "./quest-state";
import { rohanDynamicTraits, rohanDynamicKeywords } from "./rohan-player-cards";
import { khazadBlanked } from "./khazad-dum";
import type { GameState, Unit } from "./types";
import { emynMuilAttachmentsBlanked } from "./emyn-muil";
import { allActiveLocations, allCharacters, allEngaged } from "./table";
import { allQuestUnits } from "./quest-state";
import { WEATHER } from "./weather-hills-support";
import * as Angmar from "./angmar-player";
import { greyHavensDynamicKeywords } from "./grey-havens-player";
import { ettenSideQuestBlanked } from "./ettenmoors";
import { templePlayerBlanked } from "./temple-player";

/** Keep printed-text effects consistent across stats, payment, actions and saves.
 * Blanking removes traits, keywords and abilities within the printed text box.
 * It preserves a card's title, ownership and physical attachment.
 */
export function syncAttachmentText(s: GameState, extra?: Unit) {
  const blanked =
    emynMuilAttachmentsBlanked(s) || Drowned.drownedAttachmentsBlanked(s);
  const cold = allQuestUnits(s).some((q) =>
    q.attachments.some((a) => a.code === WEATHER.cold && !a.blanked),
  );
  const quest = mainQuestUnit(s);
  const hosts = [
    ...(quest ? [quest] : []),
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...(stormcallerState(s)?.area ?? []),
    ...(s.raceHarad?.area ?? []),
    ...allActiveLocations(s),
    ...(s.prisoner ? [s.prisoner] : []),
    ...(s.captiveMendor ? [s.captiveMendor] : []),
    ...(s.mordor?.captured ?? []),
    ...(extra ? [extra] : []),
  ];
  for (const host of hosts) {
    if (
      trialsGrantedImmunity(s, host.code) ||
      stormcallerAreaImmune(s, host) ||
      Umbar.umbarImmune(s, host) ||
      Mordor.mordorImmune(s, host) ||
      Mumakil.mumakilImmune(s, host) ||
      Race.raceHaradAreaImmune(s, host) ||
      batch4Scenario(s).immune?.(s, host)
    )
      host.immuneToPlayerEffects = true;
    else delete host.immuneToPlayerEffects;
    for (const attachment of host.attachments) {
      if (blanked || attachment.facedown || attachment.namelessCard)
        attachment.blanked = true;
      else delete attachment.blanked;
      const traits = [
        ...heirsPlayerTraitGrants(s, attachment.id),
        ...EredSupport.eredMithrinPlayerAttachmentTraits(attachment),
      ];
      if (traits.length) attachment.dynamicTraits = traits;
      else delete attachment.dynamicTraits;
    }
    const normalBlanking =
      khazadBlanked(host) ||
      Mordor.mordorBlanked(s, host) ||
      (Mumakil.mumakilCharacterBlanked(s, host) &&
        !Mumakil.mumakilPreservesTraits(s, host)) ||
      (card(host.code).type_code === "attachment" && blanked);
    const safeBlanking = ettenSideQuestBlanked(s, host);
    const coldBlanking =
      cold &&
      host.damage > 0 &&
      ["hero", "ally", "objective-ally"].includes(card(host.code).type_code);
    const wrathBlanking =
      Sands.beneathSandsCharacterBlanked(s, host) ||
      batch4Scenario(s).characterBlanked?.(s, host) ||
      templePlayerBlanked(s, host) ||
      Desert.desertCrossingCharacterBlanked(s, host) ||
      (Mumakil.mumakilCharacterBlanked(s, host) &&
        Mumakil.mumakilPreservesTraits(s, host));
    if (normalBlanking || coldBlanking || safeBlanking || wrathBlanking)
      host.blanked = true;
    else delete host.blanked;
    if (coldBlanking && !normalBlanking && !wrathBlanking)
      host.printedKeywordsPreserved = true;
    else delete host.printedKeywordsPreserved;
    if (wrathBlanking && !normalBlanking && !coldBlanking && !safeBlanking)
      host.printedTraitsPreserved = true;
    else delete host.printedTraitsPreserved;
    const traits = [
      ...new Set([
        ...rohanDynamicTraits(s, host),
        ...heirsPlayerTraitGrants(s, host.id),
      ]),
    ];
    if (traits.length) host.dynamicTraits = traits;
    else delete host.dynamicTraits;
    const icons = [
      ...Angmar.angmarResourceIcons(s, host),
      ...EredSupport.eredMithrinPlayerResourceIcons(s, host),
    ];
    if (icons.length) host.dynamicResourceIcons = icons;
    else delete host.dynamicResourceIcons;
  }
  for (const host of hosts) {
    const keywords = [
      ...rohanDynamicKeywords(s, host),
      ...Angmar.angmarDynamicKeywords(s, host),
      ...greyHavensDynamicKeywords(s, host),
    ];
    if (keywords.length) host.dynamicKeywords = keywords;
    else delete host.dynamicKeywords;
  }
}
