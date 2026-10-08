import { playerCardImmune } from "./card-immunity";
import { canGainResources } from "./core";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
import { stewardFearTravelEntered } from "./steward-fear";
import {
  encodeDamageContext,
  readDamageContext,
  normalizeDamageContext,
  type DamageContext,
} from "./damage-context";
import { takePlayerDeck, putPlayerDeck } from "./core";
import { takePlayerDiscard } from "./board";
// Exact Dwarves of Durin starting-deck rules, including current FFG errata.
// https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf
import { card, name, plain } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import {
  choose,
  draw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
  stats,
} from "./core";
import {
  damage,
  discardAttachment,
  discardPlayerDeck,
  enterAlly,
  allyCanEnter,
  exhaustCharacter,
  progress,
  readyCharacter,
} from "./board";
import { applyCombatDamageConsequences } from "./combat";
import { CARROCK } from "./carrock";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  firstPlayer,
  activeSeat,
  allActiveLocations,
  attachmentController,
  allCharacters,
  allHeroes,
  ownerOf,
  seatView,
  selectSeat,
} from "./table";

export const DWARF_ATTACHMENT_ACTIONS = ["131011", "131013", "132018", "03003"];
const dwarves = (s: GameState, player: number) => {
  const p = seatView(s, player);
  return [...p.heroes, ...p.allies].filter((u) => hasTrait(u, "Dwarf"));
};
const readyAllies = (s: GameState) => s.allies.filter((u) => !u.exhausted);
const dwarfHeroes = (s: GameState) =>
  allHeroes(s).filter((u) => hasTrait(u, "Dwarf"));
const resourceRecipients = (s: GameState) =>
  allHeroes(s).filter((u) => canGainResources(s, u));
const numericCost = (code: string) => Number(card(code).cost) || 0;
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && !playerCardImmune(u),
  );
const mapLocations = (s: GameState) =>
  s.staging.filter(
    (u) =>
      locations(s).some((x) => x.id === u.id) &&
      u.code !== CARROCK.carrock &&
      !/cannot become the active location|cannot be the active location/i.test(
        plain(card(u.code).text),
      ),
  );
const lorePayers = (s: GameState) =>
  s.heroes.filter(
    (u) =>
      u.resources > 0 &&
      heirsCanSpendResources(s, u) &&
      hasResourceIcon(u, "lore"),
  );

function addResources(s: GameState, hero: Unit, amount: number) {
  requireRule(
    amount === 0 || canGainResources(s, hero),
    "This hero cannot gain resources from card effects.",
  );
  hero.resources += amount;
  gondorResourcesGained(s, hero, amount, true);
}

/** Passive bonuses apply to every Dwarf character, including other players'. */
export function dwarfStats(s: GameState, u: Unit) {
  const dain =
    hasTrait(u, "Dwarf") &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code) &&
    allHeroes(s).some((h) => h.code === "02116" && !h.blanked && !h.exhausted)
      ? 1
      : 0;
  const songs =
    seatView(s, ownerOf(s, u)).used.filter(
      (k) => k === `round:durin-song:${u.id}`,
    ).length * 2;
  return { will: dain + songs, attack: dain + songs, defense: songs };
}
export function dwarfResourceDrawBonus(s: GameState, player: number) {
  const p = seatView(s, player);
  return p.heroes.some((h) => h.code === "131004" && !h.blanked) &&
    dwarves(s, player).length >= 5
    ? 1
    : 0;
}
export const dwarfAdditionalCost = (code: string) => (code === "06143" ? 1 : 0);
export function dwarfPlayProblem(s: GameState, code: string): string | null {
  if (code === "131014" && readyAllies(s).length < 2)
    return "A Very Good Tale needs two ready allies you control.";
  if (
    code === "04030" &&
    !allCharacters(s).some((u) => hasTrait(u, "Dwarf") && u.exhausted)
  )
    return "Lure of Moria needs an exhausted Dwarf character.";
  if (code === "03004" && !dwarfHeroes(s).length)
    return "Durin's Song needs a Dwarf hero.";
  return null;
}
export function dwarfPlayTargets(s: GameState, code: string): Unit[] | null {
  if (["132018", "04061", "03003"].includes(code)) return dwarfHeroes(s);
  if (["131011", "131013"].includes(code)) return allHeroes(s);
  if (code === "03004") return dwarfHeroes(s);
  return null;
}

function chooseIdleHeroes(s: GameState, selected: string[]) {
  choose(
    s,
    "We Are Not Idle · Dwarf heroes",
    [
      ...opts(
        s.heroes.filter(
          (u) =>
            !u.exhausted && hasTrait(u, "Dwarf") && !selected.includes(u.id),
        ),
        (u) => [fx("dwarfIdleSelect", { ids: [...selected, u.id] })],
      ),
      {
        id: "done",
        label: `Exhaust ${selected.length} Dwarf heroes and draw 1 card`,
        effects: [fx("dwarfIdlePay", { ids: selected })],
      },
    ],
    "Choose X Dwarf heroes you control. X may be zero; allies cannot pay this cost.",
  );
}
export function dwarfEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  switch (code) {
    case "131014":
      requireRule(
        readyAllies(s).length >= 2,
        "A Very Good Tale needs two ready allies.",
      );
      choose(
        s,
        "A Very Good Tale · First ally",
        opts(readyAllies(s), (u) => [fx("dwarfTaleSecond", { source: u.id })]),
      );
      return true;
    case "04030":
      for (const u of allCharacters(s).filter((u) => hasTrait(u, "Dwarf")))
        readyCharacter(s, u);
      return true;
    case "03004": {
      const hero = dwarfHeroes(s).find((u) => u.id === target);
      requireRule(hero, "Choose a Dwarf hero for Durin's Song.");
      seatView(s, ownerOf(s, hero)).used.push(`round:durin-song:${hero.id}`);
      return true;
    }
    case "04129":
      chooseIdleHeroes(s, []);
      return true;
    case "06143":
      draw(s, 1);
      return true;
    default:
      return false;
  }
}
export const dwarfAbilityLabel = (code: string) =>
  ({
    "03002": "Move 1 resource to Bifur",
    "04035": "Reduce a location's threat",
    "03011": "Ready a Dwarf · Pay 1 Lore",
  })[code];
export function dwarfAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  const a = attachmentId
    ? u.attachments.find((a) => a.id === attachmentId)
    : undefined;
  const code = a?.code ?? u.code;
  if (attachmentId && (!a || !DWARF_ATTACHMENT_ACTIONS.includes(a.code)))
    return undefined;
  if (!a && u.blanked) return "This character's printed text is blank.";
  if (a && (a.blanked || a.facedown || (a.exhausted && a.code !== "131011")))
    return "This attachment must be ready and its printed text active.";
  if (code === "03002") {
    if (seatView(s, ownerOf(s, u)).used.includes(`round:bifur:${u.id}`))
      return "Bifur has already used this ability this round.";
    if (!canGainResources(s, u))
      return "Bifur cannot gain resources from card effects.";
    if (!allHeroes(s).some((h) => h.resources > 0))
      return "A hero needs a resource to pay for Bifur's ability.";
  }
  if (code === "04035") {
    if (u.exhausted) return "Bombur must be ready.";
    if (!locations(s).length) return "A location must be in play.";
  }
  if (code === "03011") {
    if (u.exhausted) return "Erebor Record Keeper must be ready.";
    if (!lorePayers(s).length) return "Pay 1 Lore resource from your heroes.";
  }
  if (code === "131011" && !u.exhausted)
    return "The attached hero is already ready.";
  if (code === "131013") {
    if (s.phase !== "travel") return "Thrór's Map is a Travel Action.";
    if (!mapLocations(s).length)
      return "An eligible location must be in staging.";
  }
  if (code === "132018" && !s.deck.length)
    return "Your deck has no cards to look at.";
  return undefined;
}
export function useDwarfAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = attachmentId
    ? u.attachments.find((a) => a.id === attachmentId)
    : undefined;
  const code = a?.code ?? u.code;
  if (!DWARF_ATTACHMENT_ACTIONS.includes(code) && !dwarfAbilityLabel(code))
    return false;
  requireRule(
    !dwarfAbilityProblem(s, u, attachmentId),
    dwarfAbilityProblem(s, u, attachmentId) ?? "",
  );
  if (code === "03002")
    choose(
      s,
      "Bifur · Pay 1 hero resource",
      opts(
        allHeroes(s).filter((h) => h.resources > 0),
        (h) => [fx("dwarfBifurMove", { source: u.id, target: h.id })],
      ),
    );
  else if (code === "04035")
    choose(
      s,
      "Bombur · Choose a location",
      opts(locations(s), (location) => [
        fx("dwarfBombur", { source: u.id, target: location.id }),
      ]),
    );
  else if (code === "03011")
    choose(
      s,
      "Erebor Record Keeper · Pay 1 Lore",
      opts(lorePayers(s), (payer) => [
        fx("dwarfRecordTarget", { source: u.id, target: payer.id }),
      ]),
    );
  else if (code === "131011") {
    discardAttachment(s, u, a!);
    readyCharacter(s, u);
  } else if (code === "131013")
    choose(
      s,
      "Thrór's Map · Make a location active",
      opts(mapLocations(s), (location) => [
        fx("dwarfMap", { source: u.id, target: location.id, text: a!.id }),
      ]),
    );
  else if (code === "03003")
    choose(
      s,
      "Narvi's Belt · Resource icon",
      ["leadership", "lore", "tactics", "spirit"].map((sphere) => ({
        id: sphere,
        label: sphere[0].toUpperCase() + sphere.slice(1),
        effects: [
          fx("dwarfBelt", { target: u.id, source: a!.id, text: sphere }),
        ],
      })),
    );
  else if (code === "132018") {
    a!.exhausted = true;
    choose(
      s,
      "King Under the Mountain · Keep one card",
      s.deck.slice(0, 2).map((c, i) => ({
        id: `keep-${i}`,
        code: c,
        label: card(c).name,
        effects: [fx("dwarfKingKeep", { value: i })],
      })),
    );
  }
  return true;
}

/** Played-from-hand responses never trigger for Sneak Attack or mining effects. */
export function dwarfAllyEntered(s: GameState, u: Unit, played: boolean) {
  if (u.code === "06141")
    prepend(
      s,
      fx("dwarfProspectorResponse", { target: u.id, player: ownerOf(s, u) }),
    );
  if (played && u.code === "132006" && dwarves(s, ownerOf(s, u)).length >= 5)
    prepend(
      s,
      fx("dwarfGloinResponse", { target: u.id, player: ownerOf(s, u) }),
    );
  if (played && hasTrait(u, "Dwarf")) {
    const player = ownerOf(s, u);
    for (const host of allHeroes(s))
      for (const a of host.attachments)
        if (
          a.code === "04061" &&
          !a.blanked &&
          !a.exhausted &&
          attachmentController(s, host, a) === player
        )
          prepend(
            s,
            fx("dwarfLegacyResponse", {
              target: host.id,
              source: a.id,
              player,
            }),
          );
  }
}
export function dwarfCharactersCommitted(s: GameState, committed: Unit[]) {
  prepend(
    s,
    ...committed
      .filter((u) => u.code === "04102")
      .map((u) =>
        fx("dwarfLongbeardResponse", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}
/** Cards were moved atomically; optional responses run after the causing effect. */
export function dwarfDeckDiscarded(
  s: GameState,
  codes: string[],
  player: number,
) {
  prepend(
    s,
    ...codes
      .filter((code) => code === "12066" || code === "06143")
      .map((code) => fx("dwarfMiningResponse", { code, player })),
  );
}

/** Defer assigned damage just as Frodo does, before destruction or damage responses. */
export function dwarfDamageAssigned(
  s: GameState,
  hero: Unit,
  amount: number,
  damageContext?: DamageContext | string,
  mockingVisited: string[] = [],
): boolean {
  const context = normalizeDamageContext(damageContext, mockingVisited);
  if (
    amount <= 0 ||
    card(hero.code).type_code !== "hero" ||
    !allCharacters(s).some(
      (u) => u.code === "131009" && !u.blanked && !u.exhausted,
    )
  )
    return false;
  prepend(
    s,
    fx("dwarfDoriResponse", {
      target: hero.id,
      value: amount,
      text: encodeDamageContext(context),
      player: ownerOf(s, hero),
    }),
  );
  return true;
}

function finishMining(s: GameState, codes: string[], player = activeSeat(s)) {
  dwarfDeckDiscarded(s, codes, player);
}
function taleSelection(
  s: GameState,
  remaining: string[],
  budget: number,
  slots: number,
) {
  const options = remaining.flatMap((code, index) =>
    allyCanEnter(s, code) && numericCost(code) <= budget
      ? [
          {
            id: `tale-${index}`,
            code,
            label: `${card(code).name} · cost ${numericCost(code)}`,
            effects: [
              fx("dwarfTaleTake", {
                ids: remaining,
                value: index,
                count: slots,
                text: String(budget),
              }),
            ],
          },
        ]
      : [],
  );
  if (!slots || !options.length) {
    finishMining(s, remaining);
    return;
  }
  choose(
    s,
    "A Very Good Tale · Put allies into play",
    [
      ...options,
      {
        id: "done",
        label: "Finish the tale",
        effects: [fx("dwarfTaleFinish", { ids: remaining })],
      },
    ],
    `Up to ${slots} more ${slots === 1 ? "ally" : "allies"}; ${budget} total printed cost remains.`,
  );
}

export function handleDwarfPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "dwarfBifurMove": {
      const bifur = get(s, e.source),
        donor = get(s, e.target);
      requireRule(
        bifur?.code === "03002" &&
          donor &&
          allHeroes(s).some((h) => h.id === donor.id) &&
          donor.resources > 0 &&
          canGainResources(s, bifur) &&
          !seatView(s, ownerOf(s, bifur)).used.includes(
            `round:bifur:${bifur.id}`,
          ),
        "Bifur requires an available hero resource and unused ability.",
      );
      donor.resources--;
      addResources(s, bifur, 1);
      seatView(s, ownerOf(s, bifur)).used.push(`round:bifur:${bifur.id}`);
      return true;
    }
    case "dwarfBombur": {
      const source = get(s, e.source),
        location = locations(s).find((u) => u.id === e.target);
      requireRule(
        source?.code === "04035" && !source.exhausted && location,
        "Bombur requires a ready source and a location.",
      );
      exhaustCharacter(s, source);
      if (hasTrait(location, "Underground")) location.suppressed = true;
      else location.tempThreat = (location.tempThreat ?? 0) - 1;
      return true;
    }
    case "dwarfRecordTarget": {
      const source = get(s, e.source),
        payer = lorePayers(s).find((u) => u.id === e.target);
      requireRule(
        source?.code === "03011" && !source.exhausted && payer,
        "The Record Keeper requires a ready ally and 1 Lore resource.",
      );
      exhaustCharacter(s, source);
      spendResources(s, payer, 1);
      choose(
        s,
        "Erebor Record Keeper · Ready a Dwarf",
        opts(
          allCharacters(s).filter((u) => u.exhausted && hasTrait(u, "Dwarf")),
          (target) => [fx("dwarfRecordReady", { target: target.id })],
        ),
      );
      return true;
    }
    case "dwarfRecordReady": {
      const target = get(s, e.target);
      requireRule(
        target?.exhausted && hasTrait(target, "Dwarf"),
        "Choose an exhausted Dwarf.",
      );
      readyCharacter(s, target);
      return true;
    }
    case "dwarfMap": {
      const host = get(s, e.source),
        map = host?.attachments.find(
          (a) => a.id === e.text && a.code === "131013",
        ),
        location = mapLocations(s).find((u) => u.id === e.target);
      requireRule(
        s.phase === "travel" &&
          map &&
          !map.exhausted &&
          !map.blanked &&
          location,
        "Thrór's Map requires a ready attachment and a staging location.",
      );
      const active = allActiveLocations(s);
      if (active.length > 1) {
        const first = firstPlayer(s);
        selectSeat(s, first);
        choose(
          s,
          "Thrór's Map · Choose the active location to replace",
          opts(active, (old) => [
            { ...e, kind: "dwarfMapResolve", ids: [old.id], player: first },
          ]),
          "The first player chooses which active location returns to staging.",
        );
      } else {
        prepend(s, {
          ...e,
          kind: "dwarfMapResolve",
          ids: active.map((u) => u.id),
        });
      }
      return true;
    }
    case "dwarfMapResolve": {
      const host = get(s, e.source);
      const map = host?.attachments.find(
        (a) => a.id === e.text && a.code === "131013",
      );
      const location = mapLocations(s).find((u) => u.id === e.target);
      const active = allActiveLocations(s);
      const old = active.find((u) => u.id === e.ids?.[0]);
      requireRule(
        map &&
          !map.exhausted &&
          !map.blanked &&
          location &&
          (!active.length || old),
        "Choose an active location to replace.",
      );
      map.exhausted = true;
      if (old) s.staging.push(old);
      s.staging = s.staging.filter((u) => u.id !== location.id);
      const replaced = old
        ? active.map((u) => (u.id === old.id ? location : u))
        : [location];
      s.activeLocation = replaced[0];
      s.extraActiveLocations = replaced.slice(1);
      stewardFearTravelEntered(s, location);
      log(
        s,
        `Thrór's Map makes ${name(location)} active without travelling.`,
        "good",
      );
      return true;
    }
    case "dwarfBelt": {
      const host = get(s, e.target),
        belt = host?.attachments.find(
          (a) => a.id === e.source && a.code === "03003",
        );
      requireRule(
        host &&
          belt &&
          !belt.exhausted &&
          !belt.blanked &&
          ["leadership", "lore", "tactics", "spirit"].includes(e.text ?? ""),
        "Narvi's Belt requires a ready attachment and a sphere.",
      );
      belt.exhausted = true;
      host.phaseResourceIcons = [
        ...new Set([...(host.phaseResourceIcons ?? []), e.text!]),
      ];
      return true;
    }
    case "dwarfKingKeep": {
      const top = s.deck.slice(0, 2),
        index = e.value ?? -1;
      requireRule(
        index >= 0 && index < top.length,
        "Choose a card among the original top two.",
      );
      s.hand.push(takePlayerDeck(s, index));
      const discarded = discardPlayerDeck(
        s,
        top.length - 1,
        activeSeat(s),
        false,
      );
      top.splice(0, top.length, ...discarded);
      finishMining(s, top);
      return true;
    }
    case "dwarfTaleSecond": {
      const first = readyAllies(s).find((u) => u.id === e.source);
      requireRule(first, "Choose a ready ally you control.");
      choose(
        s,
        "A Very Good Tale · Second ally",
        opts(
          readyAllies(s).filter((u) => u.id !== first.id),
          (second) => [fx("dwarfTaleMine", { ids: [first.id, second.id] })],
        ),
      );
      return true;
    }
    case "dwarfTaleMine": {
      const allies = (e.ids ?? []).map((id) =>
        readyAllies(s).find((u) => u.id === id),
      );
      requireRule(
        allies.length === 2 &&
          allies.every(Boolean) &&
          allies[0]!.id !== allies[1]!.id,
        "Exhaust two different ready allies you control.",
      );
      const budget = allies.reduce((sum, u) => sum + numericCost(u!.code), 0);
      allies.forEach((u) => {
        exhaustCharacter(s, u!);
      });
      shuffle(s, s.deck);
      const discarded = discardPlayerDeck(s, 5, activeSeat(s), false);
      taleSelection(s, discarded, budget, 2);
      return true;
    }
    case "dwarfTaleTake": {
      const remaining = [...(e.ids ?? [])],
        index = e.value ?? -1,
        budget = Number(e.text),
        slots = e.count ?? 0;
      const code = remaining[index];
      requireRule(
        code &&
          slots > 0 &&
          s.discard.includes(code) &&
          allyCanEnter(s, code) &&
          numericCost(code) <= budget,
        "Choose an eligible ally discarded by this tale within the remaining budget.",
      );
      s.discard.splice(s.discard.lastIndexOf(code), 1);
      remaining.splice(index, 1);
      enterAlly(s, make(s, code));
      // Continue the event before any optional enters-play responses resolve.
      prepend(
        s,
        fx("dwarfTaleContinue", {
          ids: remaining,
          value: budget - numericCost(code),
          count: slots - 1,
        }),
      );
      return true;
    }
    case "dwarfTaleContinue":
      taleSelection(s, e.ids ?? [], e.value ?? 0, e.count ?? 0);
      return true;
    case "dwarfTaleFinish":
      finishMining(s, e.ids ?? []);
      return true;
    case "dwarfIdleSelect":
      chooseIdleHeroes(s, e.ids ?? []);
      return true;
    case "dwarfIdlePay": {
      const heroes = (e.ids ?? []).map((id) =>
        s.heroes.find(
          (h) => h.id === id && !h.exhausted && hasTrait(h, "Dwarf"),
        ),
      );
      requireRule(
        heroes.every(Boolean) && new Set(e.ids ?? []).size === heroes.length,
        "Select different ready Dwarf heroes you control.",
      );
      heroes.forEach((h) => {
        exhaustCharacter(s, h!);
      });
      if (heroes.length)
        choose(
          s,
          "We Are Not Idle · Receiving hero",
          opts(resourceRecipients(s), (hero) => [
            fx("dwarfIdleResources", { target: hero.id, value: heroes.length }),
          ]),
        );
      else draw(s, 1);
      return true;
    }
    case "dwarfIdleResources": {
      const hero = resourceRecipients(s).find((h) => h.id === e.target);
      requireRule(hero, "Choose a hero able to gain resources.");
      addResources(s, hero, e.value ?? 0);
      draw(s, 1);
      return true;
    }
    case "dwarfGloinResponse":
      if (!resourceRecipients(s).length) return true;
      choose(
        s,
        "Glóin · Five Dwarves",
        [
          ...opts(resourceRecipients(s), (hero) => [
            fx("dwarfGloinResources", { target: hero.id }),
          ]),
          skip,
        ],
        "After playing Glóin from hand, add 2 resources to a hero.",
      );
      return true;
    case "dwarfGloinResources": {
      const hero = resourceRecipients(s).find((h) => h.id === e.target);
      requireRule(hero, "Choose a hero able to gain resources.");
      addResources(s, hero, 2);
      return true;
    }
    case "dwarfLegacyResponse": {
      const host = get(s, e.target),
        attachment = host?.attachments.find(
          (a) => a.id === e.source && a.code === "04061",
        );
      if (!attachment || attachment.exhausted || attachment.blanked)
        return true;
      choose(s, "Legacy of Durin · Dwarf played", [
        {
          id: "draw",
          code: "04061",
          label: "Exhaust Legacy of Durin to draw 1 card",
          effects: [{ ...e, kind: "dwarfLegacyDraw" }],
        },
        skip,
      ]);
      return true;
    }
    case "dwarfLegacyDraw": {
      const host = get(s, e.target),
        attachment = host?.attachments.find(
          (a) => a.id === e.source && a.code === "04061",
        );
      requireRule(
        attachment && !attachment.exhausted && !attachment.blanked,
        "Legacy of Durin must be ready.",
      );
      attachment.exhausted = true;
      draw(s, 1);
      return true;
    }
    case "dwarfProspectorResponse":
      if (!s.deck.length) return true;
      choose(s, "Ered Nimrais Prospector · Entered play", [
        {
          id: "delve",
          code: "06141",
          label:
            "Discard 3 cards and shuffle one discarded card into your deck",
          effects: [fx("dwarfProspectorMine")],
        },
        skip,
      ]);
      return true;
    case "dwarfProspectorMine": {
      const start = s.discard.length;
      const discarded = discardPlayerDeck(s, 3, activeSeat(s), false);
      if (discarded.length < 3) {
        finishMining(s, discarded);
        return true;
      }
      choose(
        s,
        "Ered Nimrais Prospector · Recover one card",
        s.discard.map((code, index) => ({
          id: `recover-${index}`,
          label: card(code).name,
          code,
          effects: [
            fx("dwarfProspectorRecover", {
              code,
              value: index,
              ids: discarded,
              count: start,
            }),
          ],
        })),
      );
      return true;
    }
    case "dwarfProspectorRecover": {
      const index = e.value ?? -1;
      requireRule(
        s.discard[index] === e.code,
        "Choose a card from your discard pile.",
      );
      putPlayerDeck(s, takePlayerDiscard(s, index));
      shuffle(s, s.deck);
      const discarded = [...(e.ids ?? [])];
      // A recovered card is no longer in the discard zone to trigger its response.
      const recoveredNew = index - (e.count ?? 0);
      if (recoveredNew >= 0) discarded.splice(recoveredNew, 1);
      finishMining(s, discarded);
      return true;
    }
    case "dwarfLongbeardResponse": {
      const elder = get(s, e.target);
      if (elder?.code !== "04102" || !s.encounterDeck.length) return true;
      choose(s, "Longbeard Elder · Committed to quest", [
        {
          id: "look",
          code: "04102",
          label: "Look at the top encounter card",
          effects: [fx("dwarfLongbeardLook", { target: elder.id })],
        },
        skip,
      ]);
      return true;
    }
    case "dwarfLongbeardLook": {
      const elder = get(s, e.target),
        top = s.encounterDeck[0];
      requireRule(
        elder?.code === "04102" && top,
        "The Elder and an encounter card must remain in play.",
      );
      choose(
        s,
        "Longbeard Elder · Encounter card",
        [
          {
            id: "continue",
            code: top,
            label: "Continue",
            effects: [
              fx("dwarfLongbeardResult", { target: elder.id, code: top }),
            ],
          },
        ],
        "Look only: this card is not revealed and stays on top of the encounter deck.",
      );
      return true;
    }
    case "dwarfLongbeardResult": {
      const elder = get(s, e.target);
      if (!elder) return true;
      if (e.code && card(e.code).type_code === "location") progress(s, 1);
      else elder.tempWill = (elder.tempWill ?? 0) - 1;
      return true;
    }
    case "dwarfMiningResponse": {
      if (!e.code || !s.discard.includes(e.code)) return true;
      if (e.code === "12066") {
        if (!allyCanEnter(s, e.code)) return true;
        choose(s, "Ered Luin Miner · Discarded from deck", [
          {
            id: "enter",
            code: e.code,
            label: "Put Ered Luin Miner into play",
            effects: [fx("dwarfMinerEnter", { code: e.code })],
          },
          skip,
        ]);
      } else if (
        resourceRecipients(s).some((h) => ownerOf(s, h) === activeSeat(s))
      ) {
        choose(
          s,
          "Hidden Cache · Discarded from deck",
          [
            ...opts(
              s.heroes.filter((h) => canGainResources(s, h)),
              (hero) => [fx("dwarfCacheResources", { target: hero.id })],
            ),
            skip,
          ],
          "Add 2 resources to a hero you control. No event cost is paid.",
        );
      }
      return true;
    }
    case "dwarfMinerEnter":
      requireRule(
        s.discard.includes("12066") && allyCanEnter(s, "12066"),
        "This Miner must remain in your discard pile.",
      );
      s.discard.splice(s.discard.lastIndexOf("12066"), 1);
      enterAlly(s, make(s, "12066"));
      return true;
    case "dwarfCacheResources": {
      const hero = s.heroes.find(
        (h) => h.id === e.target && canGainResources(s, h),
      );
      requireRule(hero, "Hidden Cache adds resources to a hero you control.");
      addResources(s, hero, 2);
      return true;
    }
    case "dwarfDoriResponse": {
      const hero = get(s, e.target);
      if (!hero) return true;
      choose(
        s,
        `Dori · ${name(hero)} assigned ${e.value} damage`,
        [
          ...opts(
            allCharacters(s).filter(
              (u) => u.code === "131009" && !u.blanked && !u.exhausted,
            ),
            (dori) => [
              {
                ...e,
                kind: "dwarfDoriResolve",
                ids: [dori.id],
                player: ownerOf(s, dori),
              },
            ],
          ),
          {
            id: "skip",
            label: "Assign the damage to the hero",
            effects: [{ ...e, kind: "dwarfDoriResolve" }],
          },
        ],
        "Exhaust Dori to place all of this assigned damage on Dori instead. Hero immunity does not prevent this damage response.",
      );
      return true;
    }
    case "dwarfDoriResolve": {
      const hero = get(s, e.target),
        dori = e.ids?.length ? get(s, e.ids[0]) : null;
      requireRule(
        hero &&
          (!e.ids?.length || (dori?.code === "131009" && !dori.exhausted)),
        "The assigned hero and chosen Dori must still be in play.",
      );
      const context = readDamageContext(e);
      const target = dori ?? hero,
        remaining = stats(s, target).health - target.damage,
        enemy = get(s, context.enemyId);
      if (dori) exhaustCharacter(s, dori);
      const applied = damage(s, target.id, e.value ?? 0, {
        ...context,
        bypassDori: true,
      });
      if (enemy && applied)
        applyCombatDamageConsequences(
          s,
          target,
          enemy,
          e.value ?? 0,
          remaining,
        );
      return true;
    }
    default:
      return false;
  }
}
