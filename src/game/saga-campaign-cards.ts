// The Lord of the Rings campaign's boons and burdens: Mr. Underhill, Gildor
// Inglorion, The Ring Draws Them, Old Bogey-stories and Ho! Tom Bombadil! (the
// Permanent stat boons are attachment rules in expansion-passives.ts;
// Gandalf's Delay is resolved at setup).
import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  choose,
  draw,
  fx,
  get,
  log,
  make,
  prepend,
  putPlayerDeck,
  requireRule,
  shuffle,
  stats,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  engage,
  enemyAddedToStaging,
  enterEnemyEngaged,
  exhaustCharacter,
  progressLocation,
} from "./board";
import {
  activeSeat,
  allEngaged,
  allHeroes,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { putPlayedEventInVictory } from "./event-resolution";
import { playerCardImmune } from "./card-immunity";
import { reduceThreat } from "./threat-reduction";
import { oneRingExhausted, ringBearer } from "./lotr-saga";
import { hasResourceIcon } from "./expansion-passives";
import {
  isSagaCampaign,
  SAGA,
  SAGA_BOONS,
  SAGA_BURDENS,
  sagaLateDeckCard,
  SOUTH_BOONS,
} from "./saga-campaign";
import { isHero } from "./card-types";
import { playerAttack } from "./combat";
import { raiseThreat } from "./board";
import { FF } from "./flight-ford-support";

type SagaCardsState = NonNullable<GameState["sagaCards"]>;
const state = (s: GameState): SagaCardsState =>
  (s.sagaCards ??= { ringDraws: 0, underhill: [] });
const first = (s: GameState) => s.table?.first ?? 0;
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");

/** Revealed campaign cards: Gildor Inglorion and The Ring Draws Them. */
export function sagaCampaignEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
): boolean {
  if (code === SAGA.gildor) {
    if (!fromReveal) {
      if (!replay) s.encounterDiscard.push(code);
      return true;
    }
    // "The first player gains control of Gildor Inglorion."
    const p = first(s);
    forOwner(s, p, () => {
      const u = make(s, code);
      u.owner = p;
      s.allies.push(u);
    });
    log(
      s,
      `Gildor Inglorion: ${s.table ? `${who(s, p)} gains` : "the first player gains"} control of him.`,
      "good",
    );
    return true;
  }
  if (code === SAGA.lust && !s.ringSouth && isSagaCampaign(s.campaign)) {
    if (!fromReveal || replay) {
      if (!replay) s.encounterDiscard.push(code);
      return true;
    }
    return sagaCampaignLustRevealed(s, code, activeSeat(s));
  }
  if (
    [SAGA.shadowFear, SAGA.pursued, SAGA.night, SAGA.illFate].includes(
      code as never,
    ) &&
    isSagaCampaign(s.campaign)
  ) {
    if (!replay && code !== SAGA.illFate) s.encounterDiscard.push(code);
    if (!fromReveal) {
      if (!replay && code === SAGA.illFate) s.encounterDiscard.push(code);
      return true;
    }
    const p = activeSeat(s);
    if (code === SAGA.shadowFear) {
      // "Treat the printed text box of each character in play as blank
      // (except for Traits) until the end of the round."
      state(s).fear = {
        round: s.round,
        ids: globalCharacters(s).map((u) => u.id),
      };
      log(
        s,
        "Shadow of Fear: the printed text box of each character in play is blank (except for Traits) until the end of the round.",
        "danger",
      );
    } else if (code === SAGA.pursued) {
      // "Each enemy engaged with a player, and not in the staging area, makes
      // an immediate attack."
      const ids = playerOrder(s).flatMap((i) =>
        seatView(s, i)
          .engaged.filter((u) =>
            ["enemy", "ship-enemy"].includes(card(u.code).type_code),
          )
          .map((u) => u.id),
      );
      log(
        s,
        ids.length
          ? "Pursued by the Enemy: each engaged enemy makes an immediate attack."
          : "Pursued by the Enemy: no enemy is engaged with a player.",
        "danger",
      );
      if (ids.length) prepend(s, fx("sagaPursued", { ids, player: p }));
    } else if (code === SAGA.night) {
      // "Put the topmost enemy of the encounter deck discard pile into play
      // engaged with you."
      let index = -1;
      for (let i = s.encounterDiscard.length - 1; i >= 0 && index < 0; i--)
        if (
          ["enemy", "ship-enemy"].includes(
            card(s.encounterDiscard[i]).type_code,
          )
        )
          index = i;
      if (index < 0) {
        log(s, "Followed by Night: there is no enemy in the discard pile.");
        return true;
      }
      const [enemyCode] = s.encounterDiscard.splice(index, 1);
      const enemy = make(s, enemyCode);
      log(
        s,
        `Followed by Night: ${name(enemy)} comes out of the discard pile to engage ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, p);
      // An enemy that cannot engage (as on The Great River) stays in play in
      // the staging area.
      if (!allEngaged(s).some((u) => u.id === enemy.id)) {
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
        log(
          s,
          `${name(enemy)} cannot engage and is added to the staging area.`,
        );
      }
    } else {
      // Ill Fate: "Attach to a hero you control."
      const heroes = seatView(s, p).heroes.filter(
        (h) => !sagaCampaignNoTreachery(h),
      );
      if (!heroes.length) {
        s.encounterDiscard.push(code);
        return true;
      }
      choose(
        s,
        `Ill Fate · Attach to a hero ${s.table ? `${seatName(s, p)} controls` : "you control"}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("sagaConditionAttach", {
              target: h.id,
              code: SAGA.illFate,
              player: p,
            }),
          ],
        })),
        card(SAGA.illFate).text,
      );
    }
    return true;
  }
  if (code === SAGA.voice && isSagaCampaign(s.campaign)) {
    if (!fromReveal || replay) {
      if (!replay) s.encounterDiscard.push(code);
      return true;
    }
    // "Remove a hero from the quest and attach Saruman's Voice to that hero."
    const all = globalCharacters(s).filter(
      (u) => isHero(u) && !sagaCampaignNoTreachery(u),
    );
    const questing = all.filter((u) => u.committed);
    const heroes = questing.length ? questing : all;
    if (!heroes.length) {
      s.encounterDiscard.push(code);
      return true;
    }
    choose(
      s,
      "Saruman's Voice · Remove a hero from the quest and attach Saruman's Voice to it",
      heroes.map((h) => ({
        id: h.id,
        code: h.code,
        label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
        effects: [fx("sagaVoiceAttach", { target: h.id })],
      })),
      card(SAGA.voice).text,
    );
    return true;
  }
  if (code === SAGA.ringDraws) {
    if (!replay) s.encounterDiscard.push(code);
    if (!fromReveal) return true;
    // When Revealed: at the end of the phase each staging enemy engages the first player.
    state(s).ringDraws += 1;
    log(
      s,
      "The Ring Draws Them: at the end of the phase, each enemy in the staging area engages the first player.",
      "danger",
    );
    return true;
  }
  return false;
}
/**
 * Lust for the Ring, earned at The Ring Goes South, revealed in a later
 * chapter (The Ring Goes South scripts its own copy): "When Revealed: Attach to
 * a non-[fellowship] hero in play."
 */
export function sagaCampaignLustRevealed(
  s: GameState,
  code: string,
  player: number,
): boolean {
  if (code !== SAGA.lust || s.ringSouth || !isSagaCampaign(s.campaign))
    return false;
  const heroes = globalCharacters(s).filter(
    (u) =>
      isHero(u) &&
      card(u.code).sphere_code !== "fellowship" &&
      !sagaCampaignNoTreachery(u),
  );
  if (!heroes.length) {
    s.encounterDiscard.push(code);
    log(s, "Lust for the Ring: there is no non-Fellowship hero in play.");
    return true;
  }
  choose(
    s,
    `Lust for the Ring · Attach to a non-Fellowship hero in play${s.table ? ` · ${seatName(s, player)}` : ""}`,
    heroes.map((h) => ({
      id: h.id,
      code: h.code,
      label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
      effects: [fx("sagaLustAttach", { target: h.id, player })],
    })),
    "Peril. After The One Ring exhausts, each player raises their threat by 1 and the attached hero's willpower is 0 until the end of the round.",
  );
  return true;
}
const lusted = (u: Unit) =>
  u.attachments.some((a) => a.code === SAGA.lust && !a.blanked);
/** Lust for the Ring's Forced, outside The Ring Goes South. */
export function sagaCampaignOneRingExhausted(s: GameState) {
  if (s.ringSouth || !isSagaCampaign(s.campaign)) return;
  for (const hero of globalCharacters(s).filter(
    (u) => isHero(u) && lusted(u),
  )) {
    for (const player of playerOrder(s))
      forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
    const q = state(s);
    q.lustZero = (q.lustZero ?? []).filter((x) => x.round === s.round);
    if (!q.lustZero.some((x) => x.id === hero.id))
      q.lustZero.push({ id: hero.id, round: s.round });
    log(
      s,
      `Lust for the Ring: each player raises their threat by 1 and ${name(hero)}'s willpower is 0 until the end of the round.`,
      "danger",
    );
  }
}
export const sagaCampaignWillpowerOverride = (s: GameState, u: Unit) =>
  s.sagaCards?.lustZero?.some((x) => x.id === u.id && x.round === s.round)
    ? 0
    : undefined;
/** The burdens' shadow effects. */
export function sagaCampaignShadow(s: GameState, code: string): boolean {
  const c = s.combat;
  if (!c || !isSagaCampaign(s.campaign)) return false;
  if (code === SAGA.shadowFear) {
    c.ignoreDefense = true;
    log(
      s,
      "Shadow of Fear: the defending character does not count its defense.",
      "danger",
    );
    return true;
  }
  if (code === SAGA.pursued) {
    c.extraAttacks = (c.extraAttacks ?? 0) + 1;
    log(
      s,
      "Pursued by the Enemy: the attacking enemy makes an additional attack after this one.",
      "danger",
    );
    return true;
  }
  return false;
}
/** Shadow of Fear: the characters' printed text boxes are blank (Traits remain). */
export const sagaCampaignCharacterBlanked = (s: GameState, u: Unit) =>
  s.sagaCards?.fear?.round === s.round && s.sagaCards.fear.ids.includes(u.id);
const live = (u: Unit, code: string) =>
  u.attachments.find((a) => a.code === code && !a.blanked);
/** Grievous Wound: "After a hero takes damage, if Grievous Wound is unattached, attach to that hero." */
export function sagaCampaignDamageDealt(s: GameState, u: Unit, value: number) {
  if (!isSagaCampaign(s.campaign) || value <= 0 || !isHero(u)) return;
  const wound = s.staging.find((x) => x.code === SAGA.wound);
  if (!wound || u.damage >= stats(s, u).health) return;
  s.staging = s.staging.filter((x) => x.id !== wound.id);
  u.attachments.push({
    id: `a${s.nextId++}`,
    code: SAGA.wound,
    exhausted: false,
  });
  log(s, `Grievous Wound is attached to ${name(u)}.`, "danger");
}
/** Grievous Wound: "After attached hero exhausts, deal 1 damage to it." */
export function sagaCampaignCharacterExhausted(s: GameState, u: Unit) {
  if (isSagaCampaign(s.campaign) && live(u, SAGA.wound))
    prepend(s, fx("sagaWoundDamage", { target: u.id, player: ownerOf(s, u) }));
}
/**
 * After a character is destroyed: Overcome by Grief (unattached: attach to a
 * hero; attached: exhaust its hero, which cannot ready this round) and Ill
 * Fate (its hero's controller raises their threat by 2).
 */
export function sagaCampaignCharacterDestroyed(s: GameState, u: Unit) {
  if (!isSagaCampaign(s.campaign)) return;
  if (!["hero", "ally", "objective-ally"].includes(card(u.code).type_code))
    return;
  const controller = ownerOf(s, u);
  const effects: Effect[] = [];
  for (const hero of globalCharacters(s).filter(
    (h) => isHero(h) && h.id !== u.id,
  )) {
    if (ownerOf(s, hero) !== controller) continue;
    if (live(hero, SAGA.grief))
      effects.push(
        fx("sagaGriefExhaust", { target: hero.id, player: controller }),
      );
    if (live(hero, SAGA.illFate))
      effects.push(fx("sagaIllFate", { target: hero.id, player: controller }));
  }
  if (s.staging.some((x) => x.code === SAGA.grief))
    effects.push(fx("sagaGriefAttachOffer", { player: first(s) }));
  if (effects.length) prepend(s, ...effects);
}
/** Overcome by Grief: its hero cannot ready until the end of the round. */
export const sagaCampaignCannotReady = (s: GameState, u: Unit) =>
  !!s.sagaCards?.griefLock?.some((x) => x.id === u.id && x.round === s.round);
/** "If The One Ring is exhausted, this effect cannot be canceled." */
export const sagaCampaignCannotCancel = (s: GameState, code?: string) =>
  code === SAGA.ringDraws && oneRingExhausted(s);

/** The end of the phase: The Ring Draws Them's delayed engagement. */
export function sagaCampaignPhaseEnd(s: GameState): Effect[] {
  const out: Effect[] = [];
  const q = s.sagaCards;
  if (q?.ringDraws) {
    q.ringDraws = 0;
    out.push(fx("sagaRingDraws", { player: first(s) }));
  }
  // A Heavy Burden: "Forced: At the end of the planning phase, ..."
  if (
    s.phase === "planning" &&
    globalCharacters(s).some((u) =>
      u.attachments.some((a) => a.code === SAGA.heavy && !a.blanked),
    )
  )
    out.push(fx("sagaHeavyBurden", { player: first(s) }));
  return out;
}
/** Gildor Inglorion's Forced at the end of the round. */
export function sagaCampaignRoundEnd(s: GameState): Effect[] {
  return globalCharacters(s)
    .filter((u) => u.code === SAGA.gildor && !u.blanked)
    .map((u) => fx("sagaGildorEnd", { target: u.id, player: first(s) }));
}
/** Brace of Coneys: "Play only if you control the Ring-bearer." A Planning Action. */
export function sagaCampaignPlayProblem(s: GameState, u: Unit): string | null {
  if (u.code !== SAGA.coneys) return null;
  if (s.phase !== "planning") return "Brace of Coneys is a Planning Action.";
  const bearer = ringBearer(s);
  return bearer && ownerOf(s, bearer) === activeSeat(s)
    ? null
    : "Play Brace of Coneys only if you control the Ring-bearer.";
}
/** Brace of Coneys' cost: the victory display (it stays in the Campaign Pool). */
export function sagaCampaignEventCost(s: GameState, u: Unit) {
  if (u.code !== SAGA.coneys) return;
  putPlayedEventInVictory(s, u.code);
  log(s, "Brace of Coneys is added to the victory display.", "good");
}
export function sagaCampaignPlayerEvent(s: GameState, code: string): boolean {
  if (code !== SAGA.coneys) return false;
  prepend(s, fx("sagaConeys", { player: activeSeat(s) }));
  return true;
}
/** Brace of Coneys' four effects: the player chooses 2. */
const CONEYS = [
  { id: "heal", label: "Heal up to 2 damage from a hero" },
  { id: "resources", label: "Add 2 resources to a hero's pool" },
  { id: "draw", label: "Choose a player to draw 2 cards" },
  { id: "threat", label: "Reduce a player's threat by 2" },
] as const;
const coneysHeroes = (s: GameState, id: string) =>
  globalCharacters(s).filter(
    (h) => isHero(h) && (id === "heal" ? h.damage > 0 : canGainResources(s, h)),
  );
const coneysAvailable = (s: GameState, id: string) =>
  id === "heal" || id === "resources" ? coneysHeroes(s, id).length > 0 : true;
/** Heroes of the first player with a [fellowship] resource to spend. */
const fellowshipPayers = (s: GameState) =>
  seatView(s, first(s)).heroes.filter(
    (h) => hasResourceIcon(h, "fellowship") && h.resources > 0,
  );

/** Mr. Underhill's Action: the enemies engaged with you that it can choose. */
const underhillTargets = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter((e) =>
    ["enemy", "ship-enemy"].includes(card(e.code).type_code),
  );
/** The campaign cards' Actions; The Old Road's is offered in campaign mode only. */
export const sagaCampaignAbilityLabel = (code: string, s?: GameState) =>
  code === SAGA.underhill
    ? "Mr. Underhill · Add to the victory display: an engaged enemy cannot attack you this round"
    : code === SAGA.bogey
      ? "Old Bogey-stories · Add to the victory display: shuffle your hand into your deck, then draw 6"
      : code === SAGA.phial
        ? "Phial of Galadriel · Add to the victory display: each enemy engaged with you gets -4 attack this round"
        : code === SAGA.hairs
          ? "Three Golden Hairs · Add to the victory display: each player lowers their threat by 3 and draws 3 cards"
          : code === SAGA.rope
            ? "Lórien Rope · Add to the victory display: each location in the staging area gets -2 threat this phase"
            : code === SAGA.lembas
              ? "Leaf-wrapped Lembas · Add to the victory display: ready all heroes in play"
              : code === SAGA.hands
                ? "Hands of a Healer · Exhaust it and its hero: heal up to 3 damage from a hero"
                : code === SAGA.palantir
                  ? "Palantír of Orthanc · Exhaust it and Aragorn: discard the top encounter card"
                  : code === FF.oldRoad && s && isSagaCampaign(s.campaign)
                    ? "The Old Road · Place the top burden on the encounter deck to place 4 progress here"
                    : undefined;
/** The Old Road (Flight to the Ford) in play: the staging area or active. */
const oldRoadInPlay = (s: GameState, u: Unit) =>
  u.code === FF.oldRoad &&
  (s.staging.some((x) => x.id === u.id) || s.activeLocation?.id === u.id);
export function sagaCampaignAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  if (!attachmentId && u.code === FF.oldRoad) {
    if (!isSagaCampaign(s.campaign))
      return "Use this action only if you are playing campaign mode.";
    if (u.blanked) return "The Old Road's text is blank.";
    if (!oldRoadInPlay(s, u)) return "The Old Road is not in play.";
    if (!s.flightFord?.burdens.length) return "The burden deck is empty.";
    return null;
  }
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (a && [SAGA.hands, SAGA.palantir].includes(a.code as never)) {
    if (a.blanked) return `${card(a.code).name}'s text is blank.`;
    if (
      (a.owner ?? ownerOf(s, u)) !== activeSeat(s) &&
      ownerOf(s, u) !== activeSeat(s)
    )
      return `${card(a.code).name} belongs to another player.`;
    if (a.exhausted || u.exhausted)
      return `${card(a.code).name} and ${name(u)} must be ready.`;
    if (
      a.code === SAGA.hands &&
      !globalCharacters(s).some((h) => isHero(h) && h.damage > 0)
    )
      return "No hero has damage to heal.";
    if (a.code === SAGA.palantir) {
      if (!["quest", "staging"].includes(s.phase))
        return "This is a Quest Action.";
      if (!s.encounterDeck.length) return "The encounter deck is empty.";
    }
    return null;
  }
  if (a && GIFTS.includes(a.code)) {
    if (a.blanked) return `${card(a.code).name}'s text is blank.`;
    if ((a.owner ?? ownerOf(s, u)) !== activeSeat(s))
      return `${card(a.code).name} belongs to another player.`;
    return null;
  }
  if (a?.code === SAGA.bogey) {
    if (a.blanked) return "Old Bogey-stories' text is blank.";
    if ((a.owner ?? ownerOf(s, u)) !== activeSeat(s))
      return "Old Bogey-stories belongs to another player.";
    if (s.hand.length < 6)
      return "Old Bogey-stories needs a hand of at least 6 cards.";
    return null;
  }
  if (!a || a.code !== SAGA.underhill) return "No campaign card ability.";
  if (a.blanked) return "Mr. Underhill's text is blank.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "Mr. Underhill belongs to another player.";
  if (!underhillTargets(s, activeSeat(s)).length)
    return "Choose an enemy engaged with you.";
  return null;
}
export function sagaCampaignAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (!attachmentId && u.code === FF.oldRoad) {
    if (!isSagaCampaign(s.campaign)) return false;
    const problem = sagaCampaignAbilityProblem(s, u);
    requireRule(!problem, problem ?? "");
    const burden = s.flightFord!.burdens.shift()!;
    s.encounterDeck.unshift(burden);
    log(
      s,
      `The Old Road: ${card(burden).name} is placed from the burden deck on top of the encounter deck to place 4 progress on The Old Road.`,
    );
    progressLocation(s, u, 4);
    return true;
  }
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (a && [SAGA.hands, SAGA.palantir].includes(a.code as never)) {
    const problem = sagaCampaignAbilityProblem(s, u, attachmentId);
    requireRule(!problem, problem ?? "");
    a.exhausted = true;
    requireRule(exhaustCharacter(s, u), `${name(u)} cannot exhaust.`);
    const p = activeSeat(s);
    if (a.code === SAGA.hands) {
      choose(
        s,
        "Hands of a Healer · Heal up to 3 damage from a hero",
        globalCharacters(s)
          .filter((h) => isHero(h) && h.damage > 0)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)} · ${h.damage} damage`,
            effects: [fx("heal", { target: h.id, value: 3 })],
          })),
        card(SAGA.hands).text,
      );
      return true;
    }
    // Palantír of Orthanc.
    const top = s.encounterDeck.shift()!;
    s.encounterDiscard.push(top);
    const threat = card(top).threat ?? 0;
    const will = stats(s, u).will;
    log(
      s,
      `Palantír of Orthanc: ${card(top).name} (${threat} threat) is discarded from the encounter deck; ${name(u)} has ${will} willpower.`,
    );
    if (will > threat)
      choose(
        s,
        "Palantír of Orthanc · Add it to the victory display to choose a player who reveals 1 fewer encounter card this phase?",
        [
          ...playerOrder(s).map((player) => ({
            id: `player-${player}`,
            code: SAGA.palantir,
            label: `${s.table ? seatName(s, player) : "You"} reveal${s.table ? "s" : ""} 1 fewer encounter card`,
            effects: [
              fx("sagaPalantir", {
                source: a.id,
                target: u.id,
                value: player,
                player: p,
              }),
            ],
          })),
          { id: "skip", label: "Keep the Palantír", effects: [] },
        ],
        card(SAGA.palantir).text,
      );
    return true;
  }
  if (a && GIFTS.includes(a.code)) {
    const problem = sagaCampaignAbilityProblem(s, u, attachmentId);
    requireRule(!problem, problem ?? "");
    // Cost: the victory display; the removal from the Campaign Pool is
    // recorded when the scenario is won (The Road Darkens FAQ).
    u.attachments = u.attachments.filter((x) => x.id !== a.id);
    addVictoryCard(s, a.code);
    const spent = (state(s).spent ??= []);
    if (!spent.includes(a.code)) spent.push(a.code);
    giftEffect(s, a.code, activeSeat(s));
    return true;
  }
  if (a?.code === SAGA.bogey) {
    const problem = sagaCampaignAbilityProblem(s, u, attachmentId);
    requireRule(!problem, problem ?? "");
    // Cost: Old Bogey-stories goes to the victory display (it stays in the
    // Campaign Pool); then the whole hand is shuffled in and 6 are drawn.
    u.attachments = u.attachments.filter((x) => x.id !== a.id);
    addVictoryCard(s, a.code);
    const count = s.hand.length;
    for (const x of [...s.hand]) putPlayerDeck(s, x);
    s.hand = [];
    shuffle(s, s.deck);
    draw(s, 6);
    log(
      s,
      `Old Bogey-stories is added to the victory display: ${who(s, activeSeat(s))} ${s.table ? "shuffles" : "shuffle"} ${count} cards from hand into the deck and ${s.table ? "draws" : "draw"} 6.`,
      "good",
    );
    return true;
  }
  if (!a || a.code !== SAGA.underhill) return false;
  const problem = sagaCampaignAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  choose(
    s,
    "Mr. Underhill · Choose an enemy engaged with you",
    underhillTargets(s, p).map((e) => ({
      id: e.id,
      code: e.code,
      label: name(e),
      effects: [fx("sagaUnderhill", { source: a.id, target: e.id, player: p })],
    })),
  );
  return true;
}
/**
 * Flight to the Ford's campaign card: "Response: After an enemy is declared as
 * an attacker, shuffle the top card of the burden deck into the encounter
 * deck to cancel that attack." The attacked player is offered it.
 */
export function sagaCampaignAttackStarted(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  if (
    isSagaCampaign(s.campaign) &&
    s.scenarioId === "flight-to-the-ford" &&
    s.flightFord?.burdens.length
  )
    prepend(s, fx("sagaFordOffer", { target: enemy.id, player }));
}
/**
 * Ho! Tom Bombadil!: "Response: Add this card to the victory display and
 * remove it from the campaign pool to cancel the 'when revealed' effects of an
 * encounter card just revealed from the encounter deck." Offered to each
 * player holding it, like A Test of Will.
 */
export function sagaTomBombadilOptions(
  s: GameState,
  continuation: Effect,
): Option[] {
  if (!isSagaCampaign(s.campaign)) return [];
  return playerOrder(s).flatMap((player) => {
    const tom = seatView(s, player).hand.find((u) => u.code === SAGA.tom);
    if (!tom) return [];
    return [
      {
        id: s.table ? `tom-${player}` : "tom",
        label: `Play Ho! Tom Bombadil!${s.table ? ` · ${seatName(s, player)}` : ""}`,
        code: SAGA.tom,
        ability: {
          player,
          source: tom.id,
          code: SAGA.tom,
          type: "response" as const,
        },
        effects: [
          fx("eventPlay", {
            code: SAGA.tom,
            source: tom.id,
            player,
            effects: [
              fx("afterPlayerAbility", {
                effects: [{ ...continuation, flag: true }],
              }),
            ],
            cancelledEffects: [continuation],
          }),
        ],
      },
    ];
  });
}
/**
 * Ho! Tom Bombadil!'s cost: the victory display and out of the Campaign Pool.
 * As the Gift boons' FAQ rules, the removal is recorded only once the scenario
 * is defeated: a lost scenario is replayed with the boon still in the pool.
 */
export function sagaCampaignEventPlayed(s: GameState, u: Unit) {
  if (u.code !== SAGA.tom) return;
  putPlayedEventInVictory(s, u.code);
  if (isSagaCampaign(s.campaign)) {
    const spent = (state(s).spent ??= []);
    if (!spent.includes(SAGA.tom)) spent.push(SAGA.tom);
  }
  log(
    s,
    "Ho! Tom Bombadil! is added to the victory display and removed from the Campaign Pool (recorded when the scenario is won).",
    "good",
  );
}
/** The Gifts of Lórien's Actions, after their cost is paid. */
function giftEffect(s: GameState, code: string, p: number) {
  const giftName = card(code).name;
  if (code === SAGA.phial) {
    const enemies = seatView(s, p).engaged.filter(
      (e) =>
        ["enemy", "ship-enemy"].includes(card(e.code).type_code) &&
        !playerCardImmune(e),
    );
    for (const e of enemies) e.roundAttack = (e.roundAttack ?? 0) - 4;
    log(
      s,
      `${giftName} is added to the victory display: ${enemies.length ? `${enemies.map((e) => name(e)).join(", ")} ${enemies.length === 1 ? "gets" : "get"} -4 attack until the end of the round` : "no enemy is engaged with you"}.`,
      "good",
    );
  } else if (code === SAGA.hairs) {
    for (const player of playerOrder(s))
      forOwner(s, player, () => reduceThreat(s, 3, code));
    for (const player of playerOrder(s)) forOwner(s, player, () => draw(s, 3));
    log(
      s,
      `${giftName} is added to the victory display: each player lowers their threat by 3 and draws 3 cards.`,
      "good",
    );
  } else if (code === SAGA.rope) {
    const locations = s.staging.filter(
      (l) => card(l.code).type_code === "location" && !playerCardImmune(l),
    );
    for (const l of locations) l.tempThreat = (l.tempThreat ?? 0) - 2;
    log(
      s,
      `${giftName} is added to the victory display: each location in the staging area gets -2 threat until the end of the phase.`,
      "good",
    );
  } else if (code === SAGA.lembas) {
    const heroes = globalCharacters(s).filter((h) => isHero(h) && h.exhausted);
    log(
      s,
      `${giftName} is added to the victory display: all heroes in play ready.`,
      "good",
    );
    prepend(s, ...heroes.map((h) => fx("ready", { target: h.id })));
  }
}
const GIFTS: readonly string[] = [
  SAGA.phial,
  SAGA.hairs,
  SAGA.rope,
  SAGA.lembas,
];
const liveBoon = (u: Unit, code: string) =>
  u.attachments.find((a) => a.code === code && !a.blanked);
/**
 * After defenders are declared: Sting (after its hero exhausts to defend),
 * Forewarned (against a non-unique enemy, discard 1 shadow card) and
 * Saruman's Voice (its hero's controller discards 1 card).
 */
export function sagaCampaignDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
  exhausted: string[],
): Effect[] {
  if (!isSagaCampaign(s.campaign)) return [];
  return [
    ...defenders
      .filter((d) => exhausted.includes(d.id) && !!liveBoon(d, SAGA.sting))
      .map((d) =>
        fx("sagaSting", {
          target: enemy.id,
          source: d.id,
          player: liveBoon(d, SAGA.sting)!.owner ?? ownerOf(s, d),
        }),
      ),
    ...defenders
      .filter((d) => {
        const a = liveBoon(d, SAGA.forewarned);
        return (
          !!a &&
          !a.exhausted &&
          !card(enemy.code).is_unique &&
          enemy.shadows.length > 0
        );
      })
      .map((d) =>
        fx("sagaForewarned", {
          target: enemy.id,
          source: d.id,
          player: ownerOf(s, d),
        }),
      ),
    ...voiceDiscards(s, defenders),
  ];
}
/** Saruman's Voice: its hero's controller must discard 1 card from hand. */
const voiceDiscards = (s: GameState, units: Unit[]) =>
  units
    .filter((u) => !!liveBoon(u, SAGA.voice))
    .map((u) =>
      fx("sagaVoiceDiscard", { target: u.id, player: ownerOf(s, u) }),
    );
/** Intimidation and Saruman's Voice, after attackers are declared. */
export function sagaCampaignAttackersDeclared(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
): Effect[] {
  if (!isSagaCampaign(s.campaign)) return [];
  const only = attackers.length === 1 ? attackers[0] : undefined;
  const intimidation = only && liveBoon(only, SAGA.intimidation);
  return [
    ...(only &&
    intimidation &&
    !intimidation.exhausted &&
    !card(enemy.code).is_unique
      ? [
          fx("sagaIntimidation", {
            target: enemy.id,
            source: only.id,
            player: ownerOf(s, only),
          }),
        ]
      : []),
    ...voiceDiscards(s, attackers),
  ];
}
/** Intimidation: -2 defense for this attack (read once by the attack). */
export function sagaCampaignAttackDefensePenalty(s: GameState, enemy: Unit) {
  if (s.sagaCards?.intimidated !== enemy.id) return 0;
  delete s.sagaCards.intimidated;
  return 2;
}
/** Saruman's Voice, when its hero commits to the quest. */
export function sagaCampaignCommitted(s: GameState, committed: Unit[]) {
  if (isSagaCampaign(s.campaign)) prepend(s, ...voiceDiscards(s, committed));
}
/** Leader of Men: after its hero quests successfully. */
export function sagaCampaignQuestSucceeded(s: GameState) {
  if (!isSagaCampaign(s.campaign) || (s.lastQuest?.net ?? 0) <= 0) return;
  const offers = globalCharacters(s)
    .filter((h) => {
      const a = liveBoon(h, SAGA.leader);
      return isHero(h) && h.committed && !!a && !a.exhausted;
    })
    .map((h) => fx("sagaLeader", { target: h.id, player: ownerOf(s, h) }));
  if (offers.length) prepend(s, ...offers);
}
/**
 * The Searching Eye: "Forced: After you draw this card, ..."; Poisoned
 * Counsels outside Helm's Deep: discard all other cards in hand.
 */
export function sagaCampaignCardsDrawn(s: GameState, count: number) {
  if (!isSagaCampaign(s.campaign) || count <= 0) return;
  const eyes = s.hand.slice(-count).filter((u) => u.code === SAGA.searchingEye);
  if (eyes.length)
    prepend(
      s,
      ...eyes.map((u) =>
        fx("sagaSearchingEye", { target: u.id, player: activeSeat(s) }),
      ),
    );
  if (s.helmsDeep) return;
  if (!s.hand.slice(-count).some((u) => u.code === SAGA.counsels)) return;
  const others = s.hand.filter((u) => u.code !== SAGA.counsels);
  if (!others.length) return;
  s.hand = s.hand.filter((u) => u.code === SAGA.counsels);
  s.discard.push(...others.map((u) => u.code));
  log(
    s,
    `Poisoned Counsels: all other cards in hand are discarded (${others.length}).`,
    "danger",
  );
}
/** Palantír of Orthanc: the chosen player reveals 1 fewer card this phase. */
export function sagaCampaignRevealPlayers(s: GameState, players: number[]) {
  const mark = s.sagaCards?.palantir;
  if (!mark || mark.round !== s.round) return players;
  const i = players.indexOf(mark.player);
  return i < 0 ? players : players.filter((_, j) => j !== i);
}
/** Beyond All Hope: its hero cannot have treachery card attachments. */
export const sagaCampaignNoTreachery = (u: Unit) => !!liveBoon(u, SAGA.hope);
/** Glamdring (a campaign boon): after the attached character destroys an Orc enemy. */
export function sagaCampaignAttackKilled(
  s: GameState,
  ids: string[],
  traits: string[],
) {
  if (!isSagaCampaign(s.campaign) || !traits.includes("Orc")) return;
  for (const id of ids) {
    const u = get(s, id);
    const glamdring = u && liveBoon(u, SAGA.glamdring);
    if (u && glamdring)
      prepend(
        s,
        fx("sagaGlamdring", {
          target: u.id,
          player: glamdring.owner ?? ownerOf(s, u),
        }),
      );
  }
}
/**
 * Andúril (a campaign boon): "After an attack in which the attached hero
 * defended resolves, exhaust Andúril to target the enemy that just attacked.
 * Declare attached hero as an attacker against that enemy."
 */
export function sagaCampaignAfterDefense(
  s: GameState,
  completed: NonNullable<GameState["combat"]>,
) {
  if (!isSagaCampaign(s.campaign) || completed.redirectedToEnemy) return;
  const enemy = get(s, completed.enemyId);
  if (!enemy) return;
  const ids =
    completed.defenderIds ??
    (completed.defenderId ? [completed.defenderId] : []);
  for (const id of ids) {
    const u = get(s, id);
    const anduril = u && liveBoon(u, SAGA.anduril);
    if (u && anduril && !anduril.exhausted)
      prepend(
        s,
        fx("sagaAndurilOffer", {
          target: u.id,
          source: anduril.id,
          text: enemy.id,
          player: anduril.owner ?? ownerOf(s, u),
        }),
      );
  }
}
/** Mr. Underhill: the chosen enemy cannot attack that player this round. */
export const sagaCampaignEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) =>
  !!s.sagaCards?.underhill.some(
    (m) => m.enemy === enemy.id && m.player === player && m.round === s.round,
  );

export function sagaCampaignEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "sagaCrossroadsChoice": {
      // Journey to the Cross-roads' Setup: "Each player must choose: either
      // add 1 resource to each of his heroes' pools, or shuffle 1 copy of
      // Brace of Coneys into his deck."
      const p = e.player ?? first(s);
      choose(
        s,
        `Journey to the Cross-roads · ${s.table ? `${seatName(s, p)} must choose` : "Choose"}`,
        [
          {
            id: "resources",
            label: `Add 1 resource to each of ${s.table ? "their" : "your"} heroes' pools`,
            effects: [fx("sagaCrossroadsResources", { player: p })],
          },
          {
            id: "coneys",
            label: `Shuffle 1 copy of Brace of Coneys into ${s.table ? "their" : "your"} deck`,
            code: SAGA.coneys,
            effects: [fx("sagaCrossroadsConeys", { player: p })],
          },
        ],
        card(SAGA.crossroadsCard).text,
      );
      return true;
    }
    case "sagaCrossroadsResources": {
      const p = e.player ?? first(s);
      const heroes = seatView(s, p).heroes;
      for (const h of heroes) h.resources += 1;
      log(
        s,
        `Journey to the Cross-roads: ${who(s, p)} ${s.table ? "adds" : "add"} 1 resource to each of ${s.table ? "their" : "your"} heroes' pools.`,
        "good",
      );
      return true;
    }
    case "sagaCrossroadsConeys": {
      const p = e.player ?? first(s);
      sagaLateDeckCard(s, SAGA.coneys, p);
      const q = state(s);
      q.coneys = [...new Set([...(q.coneys ?? []), p])];
      log(
        s,
        `Journey to the Cross-roads: ${who(s, p)} ${s.table ? "shuffles" : "shuffle"} 1 copy of Brace of Coneys into ${s.table ? "their" : "your"} deck.`,
        "good",
      );
      return true;
    }
    case "sagaConeys": {
      // Brace of Coneys: 2 different effects, chosen one after the other.
      const p = e.player ?? activeSeat(s);
      const options = CONEYS.filter(
        (o) => o.id !== e.text && coneysAvailable(s, o.id),
      );
      if (!options.length) return true;
      choose(
        s,
        `Brace of Coneys · Choose an effect (${e.text ? 2 : 1} of 2)`,
        options.map((o) => ({
          id: o.id,
          label: o.label,
          effects: [
            fx("sagaConeysPick", { player: p, text: o.id }),
            ...(e.text ? [] : [fx("sagaConeys", { player: p, text: o.id })]),
          ],
        })),
        card(SAGA.coneys).text,
      );
      return true;
    }
    case "sagaConeysPick": {
      const p = e.player ?? activeSeat(s);
      if (e.text === "heal" || e.text === "resources") {
        const heroes = coneysHeroes(s, e.text);
        if (!heroes.length) return true;
        choose(
          s,
          e.text === "heal"
            ? "Brace of Coneys · Heal up to 2 damage from a hero"
            : "Brace of Coneys · Add 2 resources to a hero's pool",
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${e.text === "heal" ? ` (${h.damage} damage)` : ""}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
            effects: [
              e.text === "heal"
                ? fx("heal", {
                    target: h.id,
                    value: 2,
                    code: SAGA.coneys,
                    player: p,
                  })
                : fx("sagaConeysResources", { target: h.id, player: p }),
            ],
          })),
        );
        return true;
      }
      const kind = e.text === "draw" ? "sagaConeysDraw" : "sagaConeysThreat";
      const players = playerOrder(s);
      if (players.length === 1) {
        prepend(s, fx(kind, { player: p, value: players[0] }));
        return true;
      }
      choose(
        s,
        e.text === "draw"
          ? "Brace of Coneys · Choose a player to draw 2 cards"
          : "Brace of Coneys · Choose a player to reduce their threat by 2",
        players.map((player) => ({
          id: `player-${player}`,
          label: seatName(s, player),
          effects: [fx(kind, { player: p, value: player })],
        })),
      );
      return true;
    }
    case "sagaConeysResources": {
      const hero = get(s, e.target);
      if (hero && canGainResources(s, hero)) {
        hero.resources += 2;
        log(
          s,
          `Brace of Coneys: 2 resources are added to ${name(hero)}'s pool.`,
          "good",
        );
      }
      return true;
    }
    case "sagaConeysDraw": {
      const player = e.value ?? activeSeat(s);
      forOwner(s, player, () => draw(s, 2));
      log(
        s,
        `Brace of Coneys: ${who(s, player)} ${s.table ? "draws" : "draw"} 2 cards.`,
        "good",
      );
      return true;
    }
    case "sagaConeysThreat": {
      const player = e.value ?? activeSeat(s);
      forOwner(s, player, () => reduceThreat(s, 2, SAGA.coneys));
      log(
        s,
        `Brace of Coneys: ${who(s, player)} ${s.table ? "reduces their" : "reduce your"} threat by 2.`,
        "good",
      );
      return true;
    }
    case "sagaSearchingEye": {
      // The Searching Eye: "Forced: After you draw this card, either exhaust
      // each hero you control, or reveal the top card of the encounter
      // deck." As FAQ 1.44 rules for such choices, an option that cannot be
      // performed in full (an exhausted hero) is left when the other can be.
      const p = e.player ?? activeSeat(s);
      const heroes = seatView(s, p).heroes;
      const exhaust = heroes.length > 0 && heroes.every((h) => !h.exhausted);
      const reveal = s.encounterDeck.length > 0;
      const options: Option[] = [
        ...(exhaust || !reveal
          ? [
              {
                id: "exhaust",
                label: `Exhaust each hero ${s.table ? "they control" : "you control"}`,
                effects: [
                  fx("sagaSearchingEyeResolve", {
                    target: e.target,
                    player: p,
                    text: "exhaust",
                  }),
                ],
              },
            ]
          : []),
        ...(reveal || !exhaust
          ? [
              {
                id: "reveal",
                label: "Reveal the top card of the encounter deck",
                effects: [
                  fx("sagaSearchingEyeResolve", {
                    target: e.target,
                    player: p,
                    text: "reveal",
                  }),
                ],
              },
            ]
          : []),
      ];
      choose(
        s,
        `The Searching Eye · ${s.table ? `${seatName(s, p)} must choose` : "Choose"}`,
        options,
        card(SAGA.searchingEye).text,
      );
      return true;
    }
    case "sagaSearchingEyeResolve": {
      const p = e.player ?? activeSeat(s);
      // The treachery then goes to its owner's discard pile: it functions
      // like a player card.
      forOwner(s, p, () => {
        const eye = s.hand.find((u) => u.id === e.target);
        if (!eye) return;
        s.hand = s.hand.filter((u) => u.id !== eye.id);
        s.discard.push(eye.code);
      });
      if (e.text === "exhaust") {
        forOwner(s, p, () => {
          for (const h of s.heroes.filter((u) => !u.exhausted))
            exhaustCharacter(s, h);
        });
        log(
          s,
          `The Searching Eye: ${who(s, p)} ${s.table ? "exhausts" : "exhaust"} each hero ${s.table ? "they control" : "you control"}.`,
          "danger",
        );
      } else {
        log(
          s,
          "The Searching Eye: the top card of the encounter deck is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: p }));
      }
      return true;
    }
    case "sagaHeavyBurden": {
      // A Heavy Burden: "Forced: At the end of the planning phase, either
      // raise each player's threat by 1, or exhaust the Ring-bearer." The
      // first player chooses; only a ready Ring-bearer can be exhausted.
      const bearer = ringBearer(s);
      const options: Option[] = [
        {
          id: "threat",
          label: "Raise each player's threat by 1",
          effects: [fx("sagaHeavyThreat", { player: first(s) })],
        },
        ...(bearer && !bearer.exhausted
          ? [
              {
                id: "exhaust",
                label: `Exhaust the Ring-bearer, ${name(bearer)}`,
                code: bearer.code,
                effects: [
                  fx("sagaHeavyExhaust", {
                    target: bearer.id,
                    player: first(s),
                  }),
                ],
              },
            ]
          : []),
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `A Heavy Burden · ${s.table ? `${seatName(s, first(s))} chooses` : "Choose"}`,
        options,
        card(SAGA.heavy).text,
      );
      return true;
    }
    case "sagaHeavyThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
      log(s, "A Heavy Burden: each player raises their threat by 1.", "danger");
      return true;
    case "sagaHeavyExhaust": {
      const bearer = get(s, e.target);
      if (bearer && exhaustCharacter(s, bearer))
        log(
          s,
          `A Heavy Burden: the Ring-bearer, ${name(bearer)}, exhausts.`,
          "danger",
        );
      return true;
    }
    case "sagaSouthChoice": {
      // The Ring Goes South: each player chooses a boon card for their hand.
      const pending = state(s).southPending ?? [];
      const p = e.player ?? first(s);
      if (!pending.length) return true;
      choose(
        s,
        `The Ring Goes South · ${s.table ? `${seatName(s, p)} chooses` : "Choose"} a boon card to add to ${s.table ? "their" : "your"} hand`,
        pending.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("sagaSouthTake", { code, player: p })],
        })),
        card(SAGA.southCard).text,
      );
      return true;
    }
    case "sagaSouthTake": {
      const q = state(s);
      const code = e.code!;
      const p = e.player ?? first(s);
      if (!q.southPending?.includes(code)) return true;
      q.southPending = q.southPending.filter((x) => x !== code);
      forOwner(s, p, () => {
        const u = make(s, code);
        u.owner = p;
        s.hand.push(u);
        (q.setupHand ??= []).push(u.id);
      });
      const c = s.campaign!;
      c.deckBoons = { ...(c.deckBoons ?? {}), [code]: p };
      log(
        s,
        `The Ring Goes South: ${card(code).name} is added to ${s.table ? `${seatName(s, p)}'s` : "your"} hand.`,
        "good",
      );
      return true;
    }
    case "sagaSouthDeal": {
      // "If any of those boon cards remain unchosen, shuffle them into the
      // first player's deck."
      const q = state(s);
      const rest = q.southPending ?? [];
      delete q.southPending;
      if (!rest.length) return true;
      const p = e.player ?? first(s);
      forOwner(s, p, () => {
        s.deck.push(...rest);
        shuffle(s, s.deck);
      });
      const c = s.campaign!;
      c.deckBoons = {
        ...(c.deckBoons ?? {}),
        ...Object.fromEntries(rest.map((code) => [code, p])),
      };
      log(
        s,
        `The Ring Goes South: ${rest.map((code) => card(code).name).join(", ")} ${rest.length === 1 ? "is" : "are"} shuffled into the first player's deck.`,
      );
      return true;
    }
    case "sagaVoiceAttach": {
      const hero = get(s, e.target);
      if (!hero) {
        s.encounterDiscard.push(SAGA.voice);
        return true;
      }
      hero.committed = false;
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code: SAGA.voice,
        exhausted: false,
      });
      log(
        s,
        `Saruman's Voice: ${name(hero)} is removed from the quest, and Saruman's Voice is attached to it.`,
        "danger",
      );
      return true;
    }
    case "sagaVoiceDiscard": {
      // "... its controller must discard 1 card from his hand."
      const hero = get(s, e.target);
      const p = e.player ?? activeSeat(s);
      if (!hero || !live(hero, SAGA.voice) || !s.hand.length) return true;
      choose(
        s,
        `Saruman's Voice · ${s.table ? `${seatName(s, p)} discards` : "Discard"} 1 card from ${s.table ? "their" : "your"} hand`,
        s.hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("sagaVoiceDiscarded", { target: u.id, player: p })],
        })),
        card(SAGA.voice).text,
      );
      return true;
    }
    case "sagaVoiceDiscarded": {
      const u = s.hand.find((x) => x.id === e.target);
      if (!u) return true;
      s.hand = s.hand.filter((x) => x.id !== u.id);
      s.discard.push(u.code);
      log(s, `Saruman's Voice: ${name(u)} is discarded from hand.`, "danger");
      return true;
    }
    case "sagaIntimidation": {
      const enemy = get(s, e.target);
      const u = get(s, e.source);
      const a = u && liveBoon(u, SAGA.intimidation);
      if (!enemy || !u || !a || a.exhausted) return true;
      choose(
        s,
        `Intimidation · ${name(u)} attacks ${name(enemy)} alone`,
        [
          {
            id: "use",
            code: SAGA.intimidation,
            label: `Exhaust Intimidation: ${name(enemy)} gets -2 defense for this attack`,
            effects: [{ ...e, kind: "sagaIntimidate" }],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(SAGA.intimidation).text,
      );
      return true;
    }
    case "sagaIntimidate": {
      const u = get(s, e.source);
      const a = u && liveBoon(u, SAGA.intimidation);
      if (!a || a.exhausted) return true;
      a.exhausted = true;
      state(s).intimidated = e.target;
      log(
        s,
        "Intimidation: the enemy gets -2 defense for this attack.",
        "good",
      );
      return true;
    }
    case "sagaForewarned": {
      const enemy = get(s, e.target);
      const u = get(s, e.source);
      const a = u && liveBoon(u, SAGA.forewarned);
      if (!enemy || !u || !a || a.exhausted || !enemy.shadows.length)
        return true;
      choose(
        s,
        `Forewarned · ${name(u)} defends against ${name(enemy)}`,
        [
          {
            id: "use",
            code: SAGA.forewarned,
            label: "Exhaust Forewarned: discard 1 shadow card from that enemy",
            effects: [{ ...e, kind: "sagaForewarn" }],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(SAGA.forewarned).text,
      );
      return true;
    }
    case "sagaForewarn": {
      const enemy = get(s, e.target);
      const u = get(s, e.source);
      const a = u && liveBoon(u, SAGA.forewarned);
      if (!enemy || !a || a.exhausted || !enemy.shadows.length) return true;
      a.exhausted = true;
      const [code] = enemy.shadows.splice(0, 1);
      enemy.faceupShadows?.splice(0, 1);
      s.encounterDiscard.push(code);
      // Its pending reveal is gone with it.
      const i = s.queue.findIndex(
        (x) => x.kind === "shadowReveal" && x.code === code,
      );
      if (i >= 0) s.queue.splice(i, 1);
      log(
        s,
        `Forewarned: a shadow card of ${name(enemy)} is discarded.`,
        "good",
      );
      return true;
    }
    case "sagaLeader": {
      const hero = get(s, e.target);
      const a = hero && liveBoon(hero, SAGA.leader);
      if (!hero || !a || a.exhausted) return true;
      choose(
        s,
        `Leader of Men · ${name(hero)} quested successfully`,
        [
          {
            id: "use",
            code: SAGA.leader,
            label: `Exhaust Leader of Men: add 1 resource to ${name(hero)}'s pool`,
            effects: [{ ...e, kind: "sagaLeaderGain" }],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(SAGA.leader).text,
      );
      return true;
    }
    case "sagaLeaderGain": {
      const hero = get(s, e.target);
      const a = hero && liveBoon(hero, SAGA.leader);
      if (!hero || !a || a.exhausted) return true;
      a.exhausted = true;
      hero.resources += 1;
      log(
        s,
        `Leader of Men: 1 resource is added to ${name(hero)}'s pool.`,
        "good",
      );
      return true;
    }
    case "sagaPalantir": {
      const u = get(s, e.target);
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a) return true;
      u.attachments = u.attachments.filter((x) => x.id !== a.id);
      addVictoryCard(s, a.code);
      const q = state(s);
      if (!(q.spent ??= []).includes(a.code)) q.spent.push(a.code);
      q.palantir = { player: e.value ?? 0, round: s.round };
      log(
        s,
        `Palantír of Orthanc is added to the victory display: ${who(s, e.value ?? 0)} ${s.table ? "reveals" : "reveal"} 1 fewer encounter card this phase.`,
        "good",
      );
      return true;
    }
    case "sagaSeatOfSeeing": {
      // Seat of Seeing (campaign mode): "choose a burden card in play, in the
      // encounter deck, or in the discard pile, and remove it from the game.
      // Shuffle the encounter deck. (... remove that card from the campaign
      // pool.)"
      const options: Option[] = [];
      for (const u of s.staging.filter((x) => SAGA_BURDENS.includes(x.code)))
        options.push({
          id: `unit:${u.id}`,
          code: u.code,
          label: `${name(u)} · in the staging area`,
          effects: [{ ...e, kind: "sagaSeatRemove", target: u.id }],
        });
      for (const h of globalCharacters(s))
        for (const a of h.attachments.filter((x) =>
          SAGA_BURDENS.includes(x.code),
        ))
          options.push({
            id: `attachment:${a.id}`,
            code: a.code,
            label: `${card(a.code).name} · attached to ${name(h)}`,
            effects: [
              { ...e, kind: "sagaSeatRemove", target: h.id, source: a.id },
            ],
          });
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const code of [
          ...new Set(cards.filter((c) => SAGA_BURDENS.includes(c))),
        ])
          options.push({
            id: `${zone}:${code}`,
            code,
            label: `${card(code).name} · in the encounter ${zone === "deck" ? "deck" : "discard pile"}`,
            effects: [{ ...e, kind: "sagaSeatRemove", code, text: zone }],
          });
      if (!options.length) {
        log(
          s,
          "Seat of Seeing is explored: there is no burden card to remove.",
        );
        return true;
      }
      choose(
        s,
        "Seat of Seeing · Response: remove a burden card from the game?",
        [...options, { id: "skip", label: "Decline", effects: [] }],
        "Choose a burden card in play, in the encounter deck, or in the discard pile, and remove it from the game. Shuffle the encounter deck. (In campaign mode, remove that card from the campaign pool.)",
      );
      return true;
    }
    case "sagaSeatRemove": {
      let code = e.code;
      if (e.source) {
        const h = get(s, e.target);
        const a = h?.attachments.find((x) => x.id === e.source);
        if (!h || !a) return true;
        h.attachments = h.attachments.filter((x) => x.id !== a.id);
        code = a.code;
      } else if (e.target) {
        const u = s.staging.find((x) => x.id === e.target);
        if (!u) return true;
        s.staging = s.staging.filter((x) => x.id !== u.id);
        code = u.code;
      } else {
        const zone = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
        const i = zone.indexOf(code ?? "");
        if (i < 0) return true;
        zone.splice(i, 1);
      }
      if (!code) return true;
      (s.removedEncounter ??= []).push(code);
      shuffle(s, s.encounterDeck);
      const q = state(s);
      if (!(q.cleared ??= []).includes(code)) q.cleared.push(code);
      log(
        s,
        `Seat of Seeing: ${card(code).name} is removed from the game (and from the Campaign Pool when the scenario is won); the encounter deck is shuffled.`,
        "good",
      );
      return true;
    }
    case "sagaPursued": {
      // Each engaged enemy attacks in turn.
      const [id, ...rest] = (e.ids ?? []).filter((x) =>
        playerOrder(s).some((i) =>
          seatView(s, i).engaged.some((u) => u.id === x),
        ),
      );
      if (!id) return true;
      const enemy = get(s, id)!;
      const owner = playerOrder(s).find((i) =>
        seatView(s, i).engaged.some((u) => u.id === id),
      )!;
      prepend(
        s,
        fx("immediateAttack", { target: enemy.id, player: owner }),
        ...(rest.length
          ? [fx("sagaPursued", { ids: rest, player: e.player })]
          : []),
      );
      return true;
    }
    case "sagaConditionAttach": {
      // Ill Fate and Overcome by Grief become Condition attachments.
      const hero = get(s, e.target);
      const code = e.code!;
      const staged = s.staging.find((x) => x.code === code);
      if (code === SAGA.grief) {
        if (!staged) return true;
        s.staging = s.staging.filter((x) => x.id !== staged.id);
      }
      if (!hero) {
        s.encounterDiscard.push(code);
        return true;
      }
      hero.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
      log(s, `${card(code).name} is attached to ${name(hero)}.`, "danger");
      return true;
    }
    case "sagaGriefAttachOffer": {
      // "After a character is destroyed, if Overcome by Grief is unattached,
      // attach to a hero." The first player chooses the hero.
      if (!s.staging.some((x) => x.code === SAGA.grief)) return true;
      const heroes = globalCharacters(s).filter(isHero);
      if (!heroes.length) return true;
      choose(
        s,
        "Overcome by Grief · Forced: attach to a hero",
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [
            fx("sagaConditionAttach", { target: h.id, code: SAGA.grief }),
          ],
        })),
        card(SAGA.grief).text,
      );
      return true;
    }
    case "sagaGriefExhaust": {
      const hero = get(s, e.target);
      if (!hero || !live(hero, SAGA.grief)) return true;
      hero.exhausted = true;
      const q = state(s);
      q.griefLock = (q.griefLock ?? []).filter((x) => x.round === s.round);
      if (!q.griefLock.some((x) => x.id === hero.id))
        q.griefLock.push({ id: hero.id, round: s.round });
      log(
        s,
        `Overcome by Grief: ${name(hero)} is exhausted and cannot ready until the end of the round.`,
        "danger",
      );
      return true;
    }
    case "sagaIllFate": {
      const hero = get(s, e.target);
      if (!hero || !live(hero, SAGA.illFate)) return true;
      const p = e.player ?? ownerOf(s, hero);
      forOwner(s, p, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        `Ill Fate: ${who(s, p)} ${s.table ? "raises" : "raise"} ${s.table ? "their" : "your"} threat by 2.`,
        "danger",
      );
      return true;
    }
    case "sagaWoundDamage": {
      const hero = get(s, e.target);
      if (!hero || !live(hero, SAGA.wound)) return true;
      log(s, `Grievous Wound: 1 damage is dealt to ${name(hero)}.`, "danger");
      prepend(s, fx("damage", { target: hero.id, value: 1, player: e.player }));
      return true;
    }
    case "sagaGiftChoice": {
      // Breaking of the Fellowship's Setup: a Gift for a hero you control.
      const p = e.player ?? first(s);
      const taken = new Set(
        globalCharacters(s).flatMap((u) => u.attachments.map((a) => a.code)),
      );
      const gifts = GIFTS.filter((code) => !taken.has(code));
      const heroes = seatView(s, p).heroes;
      if (!gifts.length || !heroes.length) return true;
      choose(
        s,
        `Breaking of the Fellowship · ${s.table ? `${seatName(s, p)} chooses` : "Choose"} a Gift of Lórien for a hero ${s.table ? "they control" : "you control"}`,
        gifts.flatMap((code) =>
          heroes.map((h) => ({
            id: `${code}@${h.id}`,
            code,
            label: `${card(code).name} · ${name(h)}`,
            effects: [
              fx("sagaGiftAttach", {
                code,
                target: h.id,
                player: p,
                flag: true,
              }),
            ],
          })),
        ),
        card(SAGA.breakingCard).text,
      );
      return true;
    }
    case "sagaGiftSetup": {
      // An earned Gift: "Setup: Attach to a hero in play."
      const code = e.code!;
      const heroes = globalCharacters(s).filter(isHero);
      if (!heroes.length) return true;
      choose(
        s,
        `${card(code).name} · Setup: attach it to a hero in play`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [fx("sagaGiftAttach", { code, target: h.id })],
        })),
        card(code).text,
      );
      return true;
    }
    case "sagaGiftAttach": {
      const hero = get(s, e.target);
      const code = e.code!;
      if (!hero || hero.attachments.some((a) => a.code === code)) return true;
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code,
        exhausted: false,
        owner: ownerOf(s, hero),
      });
      const c = s.campaign!;
      if (e.flag && !c.boons.includes(code)) c.boons.push(code);
      log(
        s,
        `${card(code).name} is attached to ${name(hero)}${e.flag ? "; the players have earned it" : ""}.`,
        "good",
      );
      return true;
    }
    case "sagaLustAttach": {
      const hero = get(s, e.target);
      if (!hero) {
        s.encounterDiscard.push(SAGA.lust);
        return true;
      }
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code: SAGA.lust,
        exhausted: false,
      });
      log(s, `Lust for the Ring is attached to ${name(hero)}.`, "danger");
      return true;
    }
    case "sagaSting": {
      const enemy = get(s, e.target);
      if (!enemy || !s.encounterDeck.length) return true;
      choose(
        s,
        "Sting · Discard the top encounter card to damage the attacker?",
        [
          {
            id: "sting",
            code: SAGA.sting,
            label: "Discard the top card and deal damage equal to its threat",
            effects: [{ ...e, kind: "sagaStingResolve" }],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(SAGA.sting).text,
      );
      return true;
    }
    case "sagaStingResolve": {
      const code = s.encounterDeck.shift();
      if (!code) return true;
      s.encounterDiscard.push(code);
      const amount = card(code).threat ?? 0;
      log(
        s,
        `Sting discards ${card(code).name} from the encounter deck (${amount} threat).`,
        "good",
      );
      const enemy = get(s, e.target);
      if (enemy && amount > 0)
        prepend(
          s,
          fx("damage", { target: enemy.id, value: amount, player: e.player }),
        );
      return true;
    }
    case "sagaGlamdring": {
      const u = get(s, e.target);
      if (!u) return true;
      choose(
        s,
        `Glamdring · ${name(u)} destroyed an Orc enemy: draw 1 card?`,
        [
          {
            id: "draw",
            code: SAGA.glamdring,
            label: "Draw 1 card",
            effects: [{ ...e, kind: "sagaGlamdringDraw" }],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(SAGA.glamdring).text,
      );
      return true;
    }
    case "sagaGlamdringDraw":
      draw(s, 1);
      log(s, "Glamdring: 1 card is drawn.", "good");
      return true;
    case "sagaAndurilOffer": {
      const u = get(s, e.target);
      const anduril = u?.attachments.find(
        (a) => a.id === e.source && a.code === SAGA.anduril && !a.blanked,
      );
      const enemy = get(s, e.text);
      if (!u || !anduril || anduril.exhausted || !enemy) return true;
      choose(
        s,
        `Andúril · ${name(u)} defended against ${name(enemy)}`,
        [
          {
            id: "attack",
            code: SAGA.anduril,
            label: `Exhaust Andúril: ${name(u)} attacks ${name(enemy)}`,
            effects: [{ ...e, kind: "sagaAndurilAttack" }],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(SAGA.anduril).text,
      );
      return true;
    }
    case "sagaAndurilAttack": {
      const u = get(s, e.target);
      const anduril = u?.attachments.find(
        (a) => a.id === e.source && a.code === SAGA.anduril,
      );
      const enemy = get(s, e.text);
      if (!u || !anduril || anduril.exhausted || !enemy) return true;
      anduril.exhausted = true;
      log(s, `Andúril: ${name(u)} attacks ${name(enemy)}.`, "good");
      playerAttack(s, enemy, [u.id], false, "anduril");
      return true;
    }
    case "sagaBogeySetup": {
      // "Setup: The first player attaches Old Bogey-stories to a hero in play."
      const heroes = allHeroes(s);
      if (!heroes.length) return true;
      choose(
        s,
        "Old Bogey-stories · Setup: attach it to a hero in play",
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [fx("sagaBogeyAttach", { target: h.id })],
        })),
        card(SAGA.bogey).text,
      );
      return true;
    }
    case "sagaBogeyAttach": {
      const hero = get(s, e.target);
      if (!hero || hero.attachments.some((a) => a.code === SAGA.bogey))
        return true;
      // The hero's controller uses its Action.
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code: SAGA.bogey,
        exhausted: false,
        owner: ownerOf(s, hero),
      });
      log(s, `Old Bogey-stories is attached to ${name(hero)}.`, "good");
      return true;
    }
    case "sagaUnderhill": {
      const host = globalCharacters(s).find((h) =>
        h.attachments.some((a) => a.id === e.source),
      );
      const a = host?.attachments.find((x) => x.id === e.source);
      const enemy = get(s, e.target);
      if (!host || !a || !enemy) return true;
      // Added to the victory display (not discarded: Permanent allows it).
      host.attachments = host.attachments.filter((x) => x.id !== a.id);
      addVictoryCard(s, a.code);
      state(s).underhill.push({
        enemy: enemy.id,
        player: e.player ?? activeSeat(s),
        round: s.round,
      });
      log(
        s,
        `Mr. Underhill is added to the victory display: ${name(enemy)} cannot attack ${who(s, e.player ?? activeSeat(s))} until the end of the round.`,
        "good",
      );
      return true;
    }
    case "sagaFordOffer": {
      const enemy = get(s, e.target);
      if (!enemy || s.combat?.enemyId !== enemy.id) return true;
      if (!s.flightFord?.burdens.length) return true;
      choose(
        s,
        `Flight to the Ford · Campaign: cancel ${name(enemy)}'s attack?`,
        [
          {
            id: "cancel",
            code: SAGA.fordCard,
            label:
              "Shuffle the top card of the burden deck into the encounter deck to cancel that attack",
            effects: [{ ...e, kind: "sagaFordCancel" }],
          },
          { id: "skip", label: "Let the attack proceed", effects: [] },
        ],
        card(SAGA.fordCard).text,
      );
      return true;
    }
    case "sagaFordCancel": {
      const enemy = get(s, e.target);
      const c = s.combat;
      if (!enemy || !c || c.enemyId !== enemy.id) return true;
      const burden = s.flightFord?.burdens.shift();
      if (!burden) return true;
      s.encounterDeck.push(burden);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Flight to the Ford · Campaign: ${card(burden).name} is shuffled from the burden deck into the encounter deck, and ${name(enemy)}'s attack is canceled.`,
        "good",
      );
      const done = fx("enemyDone", {
        flag: true,
        player: c.attackPlayer ?? activeSeat(s),
      });
      if (c.immediate) {
        s.queue = s.queue.filter(
          (x) =>
            !(x.kind === "immediateChooseDefender" && x.target === enemy.id),
        );
        prepend(s, done);
        return true;
      }
      // The canceled attack ends (as Terrible to Behold).
      const end = s.queue.findIndex((x) => x.kind === "enemyDone");
      if (end >= 0) s.queue.splice(0, end + 1, done);
      else prepend(s, done);
      return true;
    }
    case "sagaRingDraws": {
      const enemies = s.staging.filter((u) =>
        ["enemy", "ship-enemy"].includes(card(u.code).type_code),
      );
      const p = first(s);
      for (const enemy of enemies)
        forOwner(s, p, () => engage(s, enemy, false));
      log(
        s,
        enemies.length
          ? `The Ring Draws Them: ${enemies.map((u) => name(u)).join(", ")} ${enemies.length === 1 ? "engages" : "engage"} the first player.`
          : "The Ring Draws Them: no enemy is in the staging area.",
        "danger",
      );
      return true;
    }
    case "sagaGildorEnd": {
      const gildor = get(s, e.target);
      if (!gildor) return true;
      const discard = fx("sagaGildorDiscard", { target: gildor.id });
      const payers = fellowshipPayers(s);
      if (!payers.length) {
        prepend(s, discard);
        return true;
      }
      choose(
        s,
        "Gildor Inglorion · Forced: discard him at the end of the round?",
        [
          ...payers.map((h) => ({
            id: h.id,
            code: h.code,
            label: `Spend 1 [fellowship] resource from ${name(h)} to keep Gildor Inglorion`,
            effects: [
              fx("sagaGildorKeep", { target: gildor.id, source: h.id }),
            ],
          })),
          {
            id: "discard",
            label: "Discard Gildor Inglorion",
            effects: [discard],
          },
        ],
      );
      return true;
    }
    case "sagaGildorKeep": {
      const hero = get(s, e.source);
      if (!hero || hero.resources < 1) return true;
      hero.resources -= 1;
      log(
        s,
        `Gildor Inglorion stays: 1 [fellowship] resource is spent from ${name(hero)}.`,
        "good",
      );
      return true;
    }
    case "sagaGildorDiscard": {
      const gildor = get(s, e.target);
      if (!gildor) return true;
      const p = playerOrder(s).find((i) =>
        seatView(s, i).allies.some((x) => x.id === gildor.id),
      );
      if (p === undefined) return true;
      forOwner(s, p, () => {
        for (const a of [...gildor.attachments])
          discardAttachment(s, gildor, a, true);
        s.allies = s.allies.filter((x) => x.id !== gildor.id);
        s.encounterDiscard.push(gildor.code);
      });
      log(s, "Gildor Inglorion is discarded at the end of the round.");
      return true;
    }
  }
  return false;
}
export function validateSagaCards(s: GameState) {
  const q = s.sagaCards;
  if (q === undefined) return true;
  return (
    !!q &&
    Number.isSafeInteger(q.ringDraws) &&
    q.ringDraws >= 0 &&
    Array.isArray(q.underhill) &&
    q.underhill.every(
      (m) =>
        !!m &&
        typeof m.enemy === "string" &&
        Number.isSafeInteger(m.player) &&
        Number.isSafeInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round,
    ) &&
    (q.setupHand === undefined ||
      (Array.isArray(q.setupHand) &&
        q.setupHand.every((id) => typeof id === "string"))) &&
    (q.southPending === undefined ||
      (Array.isArray(q.southPending) &&
        new Set(q.southPending).size === q.southPending.length &&
        q.southPending.every((code) => SOUTH_BOONS.includes(code)))) &&
    (q.lustZero === undefined ||
      (Array.isArray(q.lustZero) &&
        q.lustZero.every(
          (x) =>
            !!x &&
            typeof x.id === "string" &&
            Number.isSafeInteger(x.round) &&
            x.round >= 0 &&
            x.round <= s.round,
        ))) &&
    (q.fear === undefined ||
      (!!q.fear &&
        Number.isSafeInteger(q.fear.round) &&
        q.fear.round >= 0 &&
        q.fear.round <= s.round &&
        Array.isArray(q.fear.ids) &&
        q.fear.ids.every((id) => typeof id === "string"))) &&
    (q.griefLock === undefined ||
      (Array.isArray(q.griefLock) &&
        q.griefLock.every(
          (x) =>
            !!x &&
            typeof x.id === "string" &&
            Number.isSafeInteger(x.round) &&
            x.round >= 0 &&
            x.round <= s.round,
        ))) &&
    (q.intimidated === undefined || typeof q.intimidated === "string") &&
    (q.palantir === undefined ||
      (!!q.palantir &&
        Number.isSafeInteger(q.palantir.player) &&
        Number.isSafeInteger(q.palantir.round) &&
        q.palantir.round <= s.round)) &&
    (q.cleared === undefined ||
      (Array.isArray(q.cleared) &&
        new Set(q.cleared).size === q.cleared.length &&
        q.cleared.every((code) => SAGA_BURDENS.includes(code)))) &&
    (q.spent === undefined ||
      (Array.isArray(q.spent) &&
        new Set(q.spent).size === q.spent.length &&
        q.spent.every((code) => SAGA_BOONS.includes(code)))) &&
    (q.coneys === undefined ||
      (Array.isArray(q.coneys) &&
        new Set(q.coneys).size === q.coneys.length &&
        q.coneys.every(
          (p) =>
            Number.isSafeInteger(p) &&
            p >= 0 &&
            p < (s.table?.seats.length ?? 1),
        ))) &&
    (q.lateDeck === undefined ||
      (Array.isArray(q.lateDeck) &&
        q.lateDeck.length <= (s.table?.seats.length ?? 1) &&
        q.lateDeck.every(
          (codes) =>
            Array.isArray(codes) &&
            codes.every((code) => typeof code === "string" && !!code),
        ))) &&
    (isSagaCampaign(s.campaign) ||
      (!q.ringDraws &&
        !q.underhill.length &&
        !q.spent?.length &&
        !q.southPending?.length &&
        !q.cleared?.length &&
        !q.lustZero?.length &&
        !q.coneys?.length &&
        !q.lateDeck?.length))
  );
}
