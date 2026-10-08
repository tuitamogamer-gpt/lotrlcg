import { reduceThreat } from "./threat-reduction";
import { playerCardImmune } from "./card-immunity";
import { cannotReady } from "./core";
import { movableHand } from "./hand-rules";
import { canGainResources } from "./core";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
import { takePlayerDeck } from "./core";
// The Long Dark: printed and errata-reviewed player rules.
import { engagedEnemies } from "./considered-engagement";
import { card } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  draw,
  fx,
  get,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
} from "./core";
import {
  damage,
  exhaustCharacter,
  readyCharacter,
  spendEvent,
  discardHandCard,
  takePlayerDiscard,
} from "./board";
import {
  effectiveTraits,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  activeSeat,
  allCharacters,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
const ownCharacters = (s: GameState) => [...s.heroes, ...s.allies];
const istari = (s: GameState) =>
  ownCharacters(s).filter(
    (u) => !u.exhausted && !khazadCannotExhaust(u) && hasTrait(u, "Istari"),
  );
const damaged = (s: GameState) =>
  allCharacters(s).filter((u) => rhosgobelHealingAllowed(s, u));
const lorePayers = (s: GameState) =>
  s.heroes.filter(
    (h) =>
      h.resources > 0 &&
      heirsCanSpendResources(s, h) &&
      hasResourceIcon(h, "lore"),
  );
const canReadyWarden = (s: GameState, source?: string) => {
  const u = get(s, source);
  return (
    !!u &&
    u.exhausted &&
    !cannotReady(u, s) &&
    lorePayers(s).reduce((n, h) => n + h.resources, 0) >= 2
  );
};
const tacticsEvents = (s: GameState) =>
  s.discard
    .map((code, index) => ({ code, index }))
    .filter(
      ({ code }) =>
        card(code).type_code === "event" &&
        card(code).sphere_code === "tactics",
    );
const groupHamaUses = (s: GameState) =>
  new Set(
    playerOrder(s).flatMap((i) =>
      seatView(s, i).used.filter((k) => k.startsWith("game:hama:")),
    ),
  ).size;
const markerExists = (s: GameState, marker: string) =>
  playerOrder(s).some((i) => seatView(s, i).used.includes(marker));
const stagedEnemies = (s: GameState) =>
  s.staging.filter(
    (u) => card(u.code).type_code === "enemy" && !playerCardImmune(u),
  );
export function longDarkPlayerStats(s: GameState, u: Unit) {
  const attack =
    u.code === "04079" && !u.blanked
      ? Math.min(
          4,
          seatView(s, ownerOf(s, u)).allies.filter(
            (a) => a.id !== u.id && hasTrait(a, "Dwarf"),
          ).length,
        )
      : 0;
  return { will: 0, attack, defense: 0 };
}
export const longDarkPlayerIgnoreEngagement = (s: GameState, u: Unit) =>
  markerExists(s, `round:fresh-tracks:${u.id}`);
export const longDarkPlayerEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) => markerExists(s, `phase:out-of-sight:${enemy.id}:${player}`);
export function longDarkPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "04078")
    return "Fresh Tracks responds to an enemy added to staging; use its response window.";
  if (code === "04081" && !engagedEnemies(s).length)
    return "Out of Sight needs enemies engaged with you.";
  if (code === "04084" && (!istari(s).length || !s.deck.length))
    return "Word of Command needs a ready controlled Istari and a card in your deck.";
  return null;
}
export function longDarkPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  return code === "04084" ? istari(s) : null;
}
export function longDarkPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (code !== "04081" && code !== "04084") return false;
  requireRule(
    !longDarkPlayerPlayProblem(s, code),
    longDarkPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "04081")
    for (const enemy of engagedEnemies(s))
      s.used.push(`phase:out-of-sight:${enemy.id}:${activeSeat(s)}`);
  if (code === "04084") {
    const source = istari(s).find((u) => u.id === target);
    requireRule(
      source && exhaustCharacter(s, source),
      "Exhaust an Istari character you control.",
    );
    choose(s, "Word of Command · Search your deck", [
      ...s.deck.map((code, index) => ({
        id: `card-${index}`,
        label: card(code).name,
        code,
        effects: [fx("longDarkCommandTake", { code, value: index })],
      })),
      {
        id: "none",
        label: "Take no card and shuffle",
        effects: [fx("longDarkCommandTake", { value: -1 })],
      },
    ]);
  }
  return true;
}
export const longDarkPlayerAbilityLabel = (code: string) =>
  code === "04077"
    ? "Discard 1 · draw 1"
    : code === "04083"
      ? "Exhaust · heal up to 2 characters"
      : undefined;
export function longDarkPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (
    u.code === "04077" &&
    (markerExists(s, `round:erestor:${u.id}`) || !movableHand(s).length)
  )
    return "Erestor needs a hand card and can act once per round.";
  if (
    u.code === "04083" &&
    (u.exhausted || khazadCannotExhaust(u) || !damaged(s).length)
  )
    return "Warden of Healing needs to be ready and a damaged character able to heal.";
  return undefined;
}
export function useLongDarkPlayerAbility(s: GameState, u: Unit): boolean {
  if (!longDarkPlayerAbilityLabel(u.code)) return false;
  requireRule(
    !longDarkPlayerAbilityProblem(s, u),
    longDarkPlayerAbilityProblem(s, u) ?? "",
  );
  if (u.code === "04077")
    choose(
      s,
      "Erestor · Discard your card",
      opts(movableHand(s), (hand) => [
        fx("longDarkErestorDiscard", { source: u.id, target: hand.id }),
      ]),
    );
  if (u.code === "04083") {
    requireRule(exhaustCharacter(s, u), "Warden cannot exhaust.");
    wardenChoose(s, u.id, []);
  }
  return true;
}
function wardenChoose(s: GameState, source: string, selected: string[]) {
  choose(s, "Warden of Healing · Up to two different characters", [
    ...damaged(s)
      .filter((u) => !selected.includes(u.id))
      .map((u) => ({
        id: u.id,
        label: card(u.code).name,
        code: u.code,
        effects: [
          fx("longDarkWardenSelect", { source, ids: [...selected, u.id] }),
        ],
      })),
    {
      id: "heal",
      label: selected.length
        ? `Heal ${selected.length} selected character${selected.length === 1 ? "" : "s"}`
        : "Heal no character",
      effects: [fx("longDarkWardenHeal", { source, ids: selected })],
    },
  ]);
}
export function longDarkPlayerAttackersDeclared(s: GameState, ids: string[]) {
  if (groupHamaUses(s) >= 3) return;
  prepend(
    s,
    ...ids
      .map((id) => get(s, id))
      .filter((u): u is Unit => !!u && u.code === "04076" && !u.blanked)
      .map((u) =>
        fx("longDarkHamaResponse", { source: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function longDarkPlayerEnemyAddedToStaging(s: GameState, enemy: Unit) {
  if (!stagedEnemies(s).some((u) => u.id === enemy.id)) return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => {
        const p = seatView(s, player);
        return (
          p.hand.some((u) => u.code === "04078") && canPay(p, card("04078"))
        );
      })
      .map((player) =>
        fx("longDarkFreshResponse", { target: enemy.id, player }),
      ),
  );
}
export function longDarkPlayerTravelled(s: GameState, location: Unit) {
  if (
    !effectiveTraits(location).some(
      (t) => t === "Mountain" || t === "Underground",
    )
  )
    return;
  prepend(
    s,
    ...allCharacters(s).flatMap((u) =>
      u.attachments
        .filter((a) => a.code === "04082" && !a.blanked && !a.facedown)
        .map((a) =>
          fx("longDarkHeartResponse", {
            target: u.id,
            text: a.id,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          }),
        ),
    ),
  );
}
export function longDarkPlayerCardPlayed(
  s: GameState,
  played: Card,
  _player: number,
) {
  if (
    !(played.traits ?? "")
      .split(".")
      .map((t) => t.trim())
      .includes("Song")
  )
    return;
  prepend(
    s,
    ...allCharacters(s).flatMap((u) =>
      u.attachments
        .filter(
          (a) =>
            a.code === "04085" &&
            !a.blanked &&
            !a.exhausted &&
            !a.facedown &&
            canGainResources(s, u),
        )
        .map((a) =>
          fx("longDarkTalesResponse", {
            target: u.id,
            text: a.id,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          }),
        ),
    ),
  );
}
export function handleLongDarkPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "longDarkHamaResponse": {
      const hama = get(s, e.source);
      if (
        hama?.code !== "04076" ||
        hama.blanked ||
        groupHamaUses(s) >= 3 ||
        !tacticsEvents(s).length
      )
        return true;
      choose(s, "Háma · Declared attacker", [
        ...tacticsEvents(s).map(({ code, index }) => ({
          id: `event-${index}`,
          label: card(code).name,
          code,
          effects: [
            fx("longDarkHamaReturn", { source: hama.id, code, value: index }),
          ],
        })),
        skip,
      ]);
      return true;
    }
    case "longDarkHamaReturn": {
      const hama = get(s, e.source),
        index = e.value ?? -1;
      requireRule(
        hama?.code === "04076" &&
          !hama.blanked &&
          groupHamaUses(s) < 3 &&
          tacticsEvents(s).some((c) => c.index === index && c.code === e.code),
        "Háma needs a Tactics event in your discard and a remaining group use.",
      );
      s.used.push(`game:hama:${groupHamaUses(s) + 1}`);
      s.hand.push(takePlayerDiscard(s, index));
      choose(
        s,
        "Háma · Then discard one card",
        opts(movableHand(s), (u) => [
          fx("longDarkHamaDiscard", { target: u.id }),
        ]),
      );
      return true;
    }
    case "longDarkHamaDiscard": {
      discardHandCard(s, e.target!);
      return true;
    }
    case "longDarkErestorDiscard": {
      const erestor = get(s, e.source),
        index = s.hand.findIndex((u) => u.id === e.target);
      requireRule(
        erestor?.code === "04077" &&
          !erestor.blanked &&
          !longDarkPlayerAbilityProblem(s, erestor) &&
          index >= 0,
        "Erestor cannot pay this action.",
      );
      discardHandCard(s, e.target!);
      for (const i of playerOrder(s))
        seatView(s, i).used.push(`round:erestor:${erestor.id}`);
      draw(s, 1);
      return true;
    }
    case "longDarkCommandTake": {
      const index = e.value ?? -1;
      if (index >= 0) {
        requireRule(
          s.deck[index] === e.code,
          "Choose the original searched card.",
        );
        s.hand.push(takePlayerDeck(s, index));
      }
      shuffle(s, s.deck);
      return true;
    }
    case "longDarkFreshResponse":
      if (
        stagedEnemies(s).some((u) => u.id === e.target) &&
        s.hand.some((u) => u.code === "04078") &&
        canPay(s, card("04078"))
      )
        choose(s, "Fresh Tracks · Enemy added to staging", [
          {
            id: "play",
            label: "Deal 1 damage and ignore engagement checks this round",
            code: "04078",
            effects: [fx("longDarkFreshApply", { target: e.target })],
          },
          skip,
        ]);
      return true;
    case "longDarkFreshApply": {
      const enemy = stagedEnemies(s).find((u) => u.id === e.target);
      requireRule(enemy, "The added enemy must remain in staging.");
      if (!spendEvent(s, "04078")) return true;
      s.used.push(`round:fresh-tracks:${enemy.id}`);
      damage(s, enemy.id, 1);
      prepend(s, fx("longDarkFreshResponse", { target: enemy.id }));
      return true;
    }
    case "longDarkHeartResponse": {
      const target = get(s, e.target),
        a = target?.attachments.find(
          (a) =>
            a.id === e.text && a.code === "04082" && !a.blanked && !a.facedown,
        );
      if (
        target &&
        a &&
        (s.threat > 0 || (target.exhausted && !cannotReady(target, s)))
      )
        choose(s, "Ever My Heart Rises · Travelled", [
          {
            id: "ready",
            label: "Ready attached character and reduce your threat by 1",
            code: "04082",
            effects: [
              fx("longDarkHeartApply", { target: target.id, text: a.id }),
            ],
          },
          skip,
        ]);
      return true;
    }
    case "longDarkHeartApply": {
      const target = get(s, e.target);
      requireRule(
        target &&
          target.attachments.some(
            (a) =>
              a.id === e.text &&
              a.code === "04082" &&
              !a.blanked &&
              !a.facedown,
          ),
        "The attachment must remain active.",
      );
      readyCharacter(s, target);
      reduceThreat(s, 1, { id: e.text, code: "04082" });
      return true;
    }
    case "longDarkTalesResponse": {
      const target = get(s, e.target),
        a = target?.attachments.find(
          (a) =>
            a.id === e.text &&
            a.code === "04085" &&
            !a.exhausted &&
            !a.blanked &&
            !a.facedown,
        );
      if (target && a && canGainResources(s, target))
        choose(s, "Love of Tales · Song played", [
          {
            id: "resource",
            label: "Exhaust Love of Tales to gain 1 resource",
            code: "04085",
            effects: [
              fx("longDarkTalesApply", { target: target.id, text: a.id }),
            ],
          },
          skip,
        ]);
      return true;
    }
    case "longDarkTalesApply": {
      const hero = get(s, e.target),
        a = hero?.attachments.find(
          (a) =>
            a.id === e.text &&
            a.code === "04085" &&
            !a.exhausted &&
            !a.blanked &&
            !a.facedown,
        );
      requireRule(
        hero && a && canGainResources(s, hero),
        "The ready attachment and a hero able to gain resources are required.",
      );
      a.exhausted = true;
      hero.resources++;
      gondorResourcesGained(s, hero, 1, true);
      return true;
    }
    case "longDarkWardenSelect":
      requireRule(
        e.ids &&
          e.ids.length <= 2 &&
          new Set(e.ids).size === e.ids.length &&
          e.ids.every((id) => damaged(s).some((u) => u.id === id)),
        "Choose up to two different damaged characters.",
      );
      if (e.ids.length === 2) prepend(s, { ...e, kind: "longDarkWardenHeal" });
      else wardenChoose(s, e.source!, e.ids);
      return true;
    case "longDarkWardenHeal": {
      requireRule(
        e.ids && e.ids.length <= 2 && new Set(e.ids).size === e.ids.length,
        "Heal up to two different characters.",
      );
      for (const id of e.ids) {
        const target = get(s, id);
        if (target)
          rhosgobelHeal(s, target, 1, { source: e.source, code: "04083" });
      }
      if (canReadyWarden(s, e.source))
        choose(s, "Warden of Healing · Then ready?", [
          {
            id: "pay",
            label: "Pay 2 Lore resources to ready Warden",
            code: "04083",
            effects: [fx("longDarkWardenPay", { source: e.source, count: 0 })],
          },
          skip,
        ]);
      return true;
    }
    case "longDarkWardenPay": {
      const count = e.count ?? 0;
      requireRule(
        get(s, e.source)?.exhausted,
        "The Warden must remain exhausted in play.",
      );
      if (count === 2) {
        readyCharacter(s, get(s, e.source)!);
        return true;
      }
      choose(
        s,
        `Warden of Healing · Pay Lore ${count + 1}/2`,
        opts(lorePayers(s), (hero) => [
          fx("longDarkWardenResource", {
            source: e.source,
            target: hero.id,
            count,
          }),
        ]),
      );
      return true;
    }
    case "longDarkWardenResource": {
      const hero = lorePayers(s).find((h) => h.id === e.target);
      requireRule(hero, "Pay an existing Lore resource from your own hero.");
      spendResources(s, hero, 1);
      prepend(
        s,
        fx("longDarkWardenPay", {
          source: e.source,
          count: (e.count ?? 0) + 1,
        }),
      );
      return true;
    }
    default:
      return false;
  }
}
