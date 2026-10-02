import {
  encodeDamageContext,
  readDamageContext,
  normalizeDamageContext,
  type DamageContext,
} from "./damage-context";
import { takePlayerDeck } from "./core";
import { roadRivendellCannotCancel } from "./road-rivendell";
// Exact active and triggered abilities from Hunt for Gollum and Conflict at Carrock.
// Static modifiers, attachment limits and Song icons live in expansion-passives.
import { card, name } from "./cards";
import { redhornCanMakeActive } from "./redhorn-gate";
import type { Effect, GameState, Option, Unit } from "./types";
import {
  canPay,
  choose,
  draw,
  eligiblePayers,
  fx,
  get,
  log,
  make,
  opts,
  playCost,
  prepend,
  requireRule,
  shuffle,
  skip,
  stats,
} from "./core";
import {
  check,
  damage,
  discardCharacter,
  discardAttachment,
  returnAlly,
  readyCharacter,
  raiseThreat,
  spendEvent,
} from "./board";
import { isSacked } from "./carrock";
import { hasTrait } from "./expansion-passives";
import { applyCombatDamageConsequences } from "./combat";
import {
  allHeroes,
  allActiveLocations,
  removeActiveLocation,
  allCharacters,
  eachSeat,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";

type HuntSearch = "eagle" | "rohan" | "song";
const searchLabels: Record<HuntSearch, string> = {
  eagle: "The Eagles Are Coming!",
  rohan: "Mustering the Rohirrim",
  song: "Rivendell Minstrel",
};
function searchMatches(code: string, mode: HuntSearch) {
  const c = card(code);
  return mode === "eagle"
    ? /(?:^|\.\s*)Eagle\./.test(c.traits ?? "")
    : mode === "rohan"
      ? c.type_code === "ally" && /(?:^|\.\s*)Rohan\./.test(c.traits ?? "")
      : /(?:^|\.\s*)Song\./.test(c.traits ?? "");
}

/** Keep the unsearched portion inaccessible while Eagle choices remove copies. */
function search(s: GameState, mode: HuntSearch, count: number) {
  const top = s.deck.slice(0, count);
  const options = top.flatMap((code, index) =>
    searchMatches(code, mode)
      ? [
          {
            id: `hunt-search-${index}`,
            label: card(code).name,
            code,
            effects: [
              fx("huntSearchTake", { code, value: index, count, text: mode }),
            ],
          },
        ]
      : [],
  );
  if (!options.length) {
    shuffle(s, s.deck);
    log(
      s,
      `${searchLabels[mode]}: no matching cards remain in the search. The deck is shuffled.`,
    );
    return;
  }
  choose(
    s,
    searchLabels[mode],
    [
      ...options,
      {
        id: "skip",
        label: "Finish searching and shuffle the deck",
        effects: [fx("huntSearchFinish")],
      },
    ],
    mode === "eagle"
      ? "Choose any number of Eagle cards from the top five."
      : "Choose one matching card, or finish the search without taking a card.",
  );
}

export function expansionEventEffect(
  s: GameState,
  code: string,
  _target?: string,
  _cost = 0,
): boolean {
  switch (code) {
    case "02003":
      eachSeat(s, () => draw(s, 1));
      return true;
    case "02005":
      search(s, "eagle", Math.min(5, s.deck.length));
      return true;
    case "02007":
      search(s, "rohan", Math.min(10, s.deck.length));
      return true;
    case "02027":
      eachSeat(s, () => {
        let index = s.discard.length - 1;
        while (index >= 0 && card(s.discard[index]).type_code !== "attachment")
          index--;
        if (index < 0) return;
        const [code] = s.discard.splice(index, 1);
        s.hand.push(make(s, code));
        log(s, `Second Breakfast returns ${card(code).name} to hand.`, "good");
      });
      return true;
    default:
      return false;
  }
}

export const huntAbilityLabel = (code: string): string | undefined =>
  code === "02006"
    ? "Discard to ready a hero"
    : code === "02002"
      ? "Move Dúnedain Mark"
      : code === "02026"
        ? "Move Dúnedain Warning"
        : code === "02117"
          ? "Move Dúnedain Signal"
          : code === "02051"
            ? "Move Dúnedain Quest"
            : code === "02028"
              ? "Discard to damage staging enemies"
              : code === "02029"
                ? "Return the attached ally to hand"
                : code === "02032"
                  ? "Spend 1 Lore · +1 willpower"
                  : undefined;

export function huntAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (
    attachmentId &&
    u.attachments.some(
      (a) =>
        a.id === attachmentId &&
        ["02002", "02026", "02051", "02097", "02117"].includes(a.code),
    )
  ) {
    if (u.resources < 1) return "The attached hero needs 1 resource.";
    if (!allHeroes(s).some((h) => h.id !== u.id))
      return "Another hero is required.";
  } else if (
    !attachmentId &&
    u.code === "02006" &&
    !allHeroes(s).some((h) => h.exhausted)
  ) {
    return "A hero must be exhausted to be readied.";
  } else if (
    !attachmentId &&
    u.code === "02028" &&
    !s.staging.some((enemy) => card(enemy.code).type_code === "enemy")
  ) {
    return "An enemy must be in the staging area.";
  } else if (
    !attachmentId &&
    u.code === "02032" &&
    !eligiblePayers(s, card(u.code)).some((h) => h.resources > 0)
  ) {
    return "One Lore resource is required.";
  }
  return undefined;
}

export function useExpansionAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (
      a &&
      ["02002", "02026", "02051", "02097", "02117", "02029"].includes(a.code)
    )
      requireRule(!a.blanked, "This attachment's rules text is blank.");
    if (a?.code === "02029") {
      requireRule(
        card(u.code).type_code === "ally",
        "Born Aloft must be attached to an ally.",
      );
      discardAttachment(s, u, a);
      returnAlly(s, u);
      return true;
    }
    if (!a || !["02002", "02026", "02051", "02097", "02117"].includes(a.code))
      return false;
    requireRule(
      !huntAbilityProblem(s, u, attachmentId),
      huntAbilityProblem(s, u, attachmentId) ?? "",
    );
    choose(
      s,
      card(a.code).name,
      opts(
        allHeroes(s).filter((h) => h.id !== u.id),
        (h) => [
          fx("huntMoveMark", {
            source: u.id,
            target: h.id,
            text: attachmentId,
            code: a.code,
          }),
        ],
      ),
      "Pay 1 resource from the attached hero's pool, then move this Signal to another hero.",
    );
    return true;
  }
  if (u.code === "02028") {
    requireRule(!huntAbilityProblem(s, u), huntAbilityProblem(s, u) ?? "");
    discardCharacter(s, u);
    for (const enemy of [...s.staging].filter(
      (enemy) => card(enemy.code).type_code === "enemy",
    ))
      damage(s, enemy.id, 1);
    log(
      s,
      "Beorning Beekeeper is discarded to deal 1 damage to each enemy in staging.",
      "good",
    );
    return true;
  }
  if (u.code === "02032") {
    requireRule(!huntAbilityProblem(s, u), huntAbilityProblem(s, u) ?? "");
    choose(
      s,
      "Longbeard Map-Maker",
      eligiblePayers(s, card(u.code))
        .filter((h) => h.resources > 0)
        .map((h) => ({
          id: h.id,
          label: `Spend 1 Lore resource from ${name(h)}`,
          code: h.code,
          effects: [fx("huntMapMaker", { target: u.id, source: h.id })],
        })),
      "This ally gains +1 willpower until the end of the phase. The action may be repeated.",
    );
    return true;
  }
  if (u.code !== "02006") return false;
  requireRule(!huntAbilityProblem(s, u), huntAbilityProblem(s, u) ?? "");
  choose(
    s,
    "Westfold Horse-breaker",
    opts(
      allHeroes(s).filter((h) => h.exhausted),
      (h) => [fx("huntHorseBreaker", { source: u.id, target: h.id })],
    ),
    "Discard this ally to ready the chosen hero.",
  );
  return true;
}

/** Bilbo modifies the framework draw; he does not create a separate draw event. */
export function huntResourceDrawBonus(s: GameState, player: number): number {
  const first = playerOrder(s)[0] ?? 0;
  return player === first &&
    livingSeats(s).some((i) =>
      seatView(s, i).heroes.some((h) => h.code === "02001" && !h.blanked),
    )
    ? 1
    : 0;
}

export function huntAllyEntered(s: GameState, u: Unit, played: boolean) {
  if (u.code === "02008" && played)
    prepend(
      s,
      fx("huntMinstrelResponse", { target: u.id, player: ownerOf(s, u) }),
    );
}

/** Called with the resolved attack's original defenders, before combat is cleared. */
export function huntDefenseEffects(
  s: GameState,
  defenderIds: string[],
): Effect[] {
  return [...new Set(defenderIds)].flatMap((id) => {
    const u = get(s, id);
    return u?.code === "02004"
      ? [fx("huntGuardianDefense", { target: id, player: ownerOf(s, u) })]
      : [];
  });
}

/** Called by every leave-play path with the departing character's controller. */
export function expansionLeavesPlay(s: GameState, u: Unit, controller: number) {
  if (u.code === "02030")
    prepend(s, fx("huntEomundResponse", { player: controller }));
}

/** Cancel the triggered shadow, not the shadow card; no encounter text resolves. */
export function expansionShadowOptions(
  s: GameState,
  shadowCode: string,
): Option[] {
  if (
    !card(shadowCode).shadow ||
    allActiveLocations(s).some((u) => u.code === "02016")
  )
    return [];
  const defenders =
    s.combat?.defenderIds ??
    (s.combat?.defenderId ? [s.combat.defenderId] : []);
  return defenders.flatMap((id) => {
    const host = get(s, id);
    if (!host) return [];
    return host.attachments
      .filter((a) => a.code === "02033" && !a.exhausted && !a.blanked)
      .map((a) => ({
        id: `brand-${a.id}`,
        label: `Exhaust A Burning Brand · ${name(host)}`,
        code: "02033",
        effects: [
          fx("exhaustAttachment", {
            target: host.id,
            source: a.id,
            player: ownerOf(s, host),
          }),
        ],
      }));
  });
}

/** Damage is deferred until the owner chooses; lethal damage can be canceled. */
export function offerFrodoDamage(
  s: GameState,
  target: Unit,
  value: number,
  damageContext?: DamageContext | string,
  mockingVisited?: string[],
): boolean {
  const context = normalizeDamageContext(damageContext, mockingVisited);
  const controller = ownerOf(s, target),
    p = seatView(s, controller);
  if (
    target.code !== "02025" ||
    target.blanked ||
    value <= 0 ||
    isSacked(target) ||
    p.used.includes(`phase:frodo:${target.id}`)
  )
    return false;
  // Direct encounter effects cannot be canceled at The Eaves. Combat damage is a framework effect.
  if (
    (roadRivendellCannotCancel(s) ||
      allActiveLocations(s).some((u) => u.code === "02016")) &&
    !context.enemyId
  )
    return false;
  prepend(
    s,
    fx("huntFrodoResponse", {
      target: target.id,
      value,
      text: encodeDamageContext(context),
      player: controller,
    }),
  );
  return true;
}

/** Only encounter-deck reveals create this response; search/put-into-play does not. */
export function huntLocationRevealed(s: GameState, location: Unit) {
  if (
    !s.staging.some((u) => u.id === location.id) ||
    card(location.code).type_code !== "location" ||
    !redhornCanMakeActive(location)
  )
    return;
  const options = playerOrder(s).flatMap((player) => {
    const p = seatView(s, player);
    return p.hand.some((u) => u.code === "02009") && canPay(p, card("02009"))
      ? [
          {
            id: `strider-${player}`,
            label: `Play Strider's Path · ${playCost(p, card("02009"))} Lore${s.table ? ` · ${seatName(s, player)}` : ""}`,
            code: "02009",
            effects: [fx("huntStriderPath", { target: location.id, player })],
          },
        ]
      : [];
  });
  if (options.length)
    choose(
      s,
      `Strider's Path · ${name(location)}`,
      [...options, skip],
      "Travel to the newly revealed location without resolving its Travel effect.",
    );
}

export function handleExpansionPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "huntSearchFinish":
      shuffle(s, s.deck);
      return true;
    case "huntSearchTake": {
      const index = e.value ?? -1,
        count = e.count ?? 0;
      const mode = e.text as HuntSearch;
      requireRule(
        index >= 0 &&
          index < count &&
          s.deck[index] === e.code &&
          searchMatches(e.code!, mode),
        "That card is not in the searched portion of the deck.",
      );
      const physical = takePlayerDeck(s, index),
        code = physical.code;
      s.hand.push(physical);
      log(s, `${searchLabels[mode]} adds ${card(code).name} to hand.`, "good");
      if (mode === "eagle") search(s, mode, count - 1);
      else shuffle(s, s.deck);
      return true;
    }
    case "huntMoveMark": {
      const host = get(s, e.source),
        target = get(s, e.target);
      const a = host?.attachments.find(
        (a) =>
          a.id === e.text &&
          !a.blanked &&
          ["02002", "02026", "02051", "02097", "02117"].includes(a.code),
      );
      requireRule(
        host &&
          target &&
          a &&
          host.id !== target.id &&
          card(target.code).type_code === "hero" &&
          host.resources > 0,
        "A Dúnedain Signal requires a resource and another hero.",
      );
      host.resources--;
      host.attachments = host.attachments.filter((x) => x.id !== a.id);
      target.attachments.push(a);
      log(
        s,
        `${card(a.code).name} moves from ${name(host)} to ${name(target)}.`,
      );
      return true;
    }
    case "huntMapMaker": {
      const mapMaker = get(s, e.target),
        payer = eligiblePayers(s, card("02032")).find(
          (h) => h.id === e.source && h.resources > 0,
        );
      requireRule(
        mapMaker?.code === "02032" && payer,
        "Longbeard Map-Maker requires one Lore resource.",
      );
      payer.resources--;
      mapMaker.tempWill = (mapMaker.tempWill ?? 0) + 1;
      return true;
    }
    case "huntEomundResponse":
      if (allCharacters(s).some((u) => u.exhausted && hasTrait(u, "Rohan")))
        choose(s, "Éomund's response", [
          {
            id: "ready-rohan",
            label: "Ready all Rohan characters in play",
            code: "02030",
            effects: [fx("huntEomundReady")],
          },
          skip,
        ]);
      return true;
    case "huntEomundReady":
      for (const u of allCharacters(s).filter((u) => hasTrait(u, "Rohan")))
        readyCharacter(s, u);
      return true;
    case "huntFrodoResponse": {
      const target = get(s, e.target);
      if (!target) return true;
      if (
        target.blanked ||
        isSacked(target) ||
        s.used.includes(`phase:frodo:${target.id}`)
      ) {
        prepend(s, { ...e, kind: "huntFrodoAccept" });
        return true;
      }
      choose(
        s,
        "Frodo Baggins · Damage response",
        [
          {
            id: "cancel-damage",
            label: `Raise threat by ${e.value ?? 0} to cancel all this damage`,
            code: "02025",
            effects: [
              fx("huntFrodoCancel", { target: target.id, value: e.value }),
            ],
          },
          {
            id: "accept-damage",
            label: `Take ${e.value ?? 0} damage`,
            code: "02025",
            effects: [{ ...e, kind: "huntFrodoAccept" }],
          },
        ],
        "Frodo may cancel one damage event per phase. Raising threat may eliminate his fellowship.",
      );
      return true;
    }
    case "huntFrodoCancel": {
      const target = get(s, e.target);
      requireRule(
        target?.code === "02025" &&
          !target.blanked &&
          !isSacked(target) &&
          !s.used.includes(`phase:frodo:${target.id}`),
        "Frodo's response is limited to once per phase.",
      );
      raiseThreat(s, e.value ?? 0, "player-card");
      s.used.push(`phase:frodo:${target.id}`);
      log(
        s,
        `Frodo cancels ${e.value ?? 0} damage and raises threat by that amount.`,
        "good",
      );
      check(s);
      return true;
    }
    case "huntFrodoAccept": {
      const context = readDamageContext(e);
      const target = get(s, e.target),
        enemy = get(s, context.enemyId);
      if (!target) return true;
      const remainingHealth = stats(s, target).health - target.damage;
      const amount = e.value ?? 0;
      const resolved = damage(s, target.id, amount, {
        ...context,
        bypassFrodo: true,
      });
      if (resolved && enemy)
        applyCombatDamageConsequences(
          s,
          target,
          enemy,
          amount,
          remainingHealth,
        );
      return true;
    }
    case "huntHorseBreaker": {
      const source = get(s, e.source),
        target = get(s, e.target);
      requireRule(
        source?.code === "02006" &&
          target &&
          card(target.code).type_code === "hero" &&
          target.exhausted,
        "An exhausted hero and Westfold Horse-breaker are required.",
      );
      discardCharacter(s, source);
      readyCharacter(s, target);
      log(
        s,
        `Westfold Horse-breaker is discarded to ready ${name(target)}.`,
        "good",
      );
      return true;
    }
    case "huntMinstrelResponse": {
      const u = get(s, e.target);
      if (u?.code === "02008")
        choose(s, "Rivendell Minstrel", [
          {
            id: "search",
            label: "Search the deck for one Song",
            code: "02008",
            effects: [fx("huntMinstrelSearch")],
          },
          skip,
        ]);
      return true;
    }
    case "huntMinstrelSearch":
      search(s, "song", s.deck.length);
      return true;
    case "huntGuardianDefense": {
      const guardian = get(s, e.target);
      if (guardian?.code !== "02004") return true;
      const payers = eligiblePayers(s, card("02004")).filter(
        (h) => card(h.code).type_code === "hero" && h.resources > 0,
      );
      if (!payers.length) {
        discardCharacter(s, guardian);
        log(
          s,
          "Winged Guardian is discarded: no Tactics resource is available.",
        );
        return true;
      }
      choose(
        s,
        "Winged Guardian · Forced",
        [
          ...payers.map((h) => ({
            id: `pay-${h.id}`,
            label: `Pay 1 Tactics resource from ${name(h)}`,
            code: h.code,
            effects: [
              fx("huntGuardianPay", { source: h.id, target: guardian.id }),
            ],
          })),
          {
            id: "discard",
            label: "Discard Winged Guardian",
            code: "02004",
            effects: [fx("huntGuardianDiscard", { target: guardian.id })],
          },
        ],
        "After this ally defends, pay one Tactics resource from its controller's hero pool or discard it.",
      );
      return true;
    }
    case "huntGuardianPay": {
      const guardian = get(s, e.target),
        payer = eligiblePayers(s, card("02004")).find(
          (h) =>
            card(h.code).type_code === "hero" &&
            h.id === e.source &&
            h.resources > 0,
        );
      requireRule(
        guardian?.code === "02004" && payer,
        "Winged Guardian requires one Tactics resource from its controller.",
      );
      payer.resources--;
      return true;
    }
    case "huntGuardianDiscard": {
      const guardian = get(s, e.target);
      if (guardian?.code === "02004") discardCharacter(s, guardian);
      return true;
    }
    case "huntLocationResponse": {
      const location = get(s, e.target);
      if (location) huntLocationRevealed(s, location);
      return true;
    }
    case "huntStriderPath": {
      const location = s.staging.find(
        (u) =>
          u.id === e.target &&
          card(u.code).type_code === "location" &&
          redhornCanMakeActive(u),
      );
      requireRule(location, "The revealed location is no longer in staging.");
      if (!spendEvent(s, "02009")) return true;
      const active = allActiveLocations(s);
      if (active.length > 1) {
        prepend(
          s,
          fx("huntStriderChooseActive", {
            target: location.id,
            player: s.table?.first ?? 0,
          }),
        );
      } else
        prepend(
          s,
          fx("huntStriderReplace", {
            target: location.id,
            source: active[0]?.id,
            player: s.table?.first ?? 0,
          }),
        );
      log(
        s,
        `Strider's Path travels to ${name(location)} without resolving its Travel effect.`,
        "good",
      );
      return true;
    }
    case "huntStriderChooseActive":
      choose(
        s,
        "Strider's Path · Active location",
        opts(allActiveLocations(s), (old) => [
          fx("huntStriderReplace", { target: e.target, source: old.id }),
        ]),
        "The first player chooses one active location to return to staging.",
      );
      return true;
    case "huntStriderReplace": {
      const next = s.staging.find((u) => u.id === e.target);
      requireRule(
        next && redhornCanMakeActive(next),
        "This location cannot become active from a player card effect.",
      );
      const old = allActiveLocations(s).find((u) => u.id === e.source);
      if (e.source)
        requireRule(old, "The chosen active location has left play.");
      if (old) {
        removeActiveLocation(s, old.id);
        s.staging.push(old);
      }
      prepend(
        s,
        fx("travelEnter", {
          target: e.target,
          player: s.table?.first ?? 0,
          flag: true,
          text: "strider-replace",
        }),
      );
      return true;
    }
    default:
      return false;
  }
}
