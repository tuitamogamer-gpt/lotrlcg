// Scenario-specific rules for the three Core Set quests.
import { card, name } from "./cards";
import type { Effect, GameState } from "./types";
import { OBJECTIVES } from "./scenarios";

import {
  activeSeat,
  allCharacters,
  allHeroes,
  forOwner,
  ownerOf,
  seatView,
  defendersFor,
} from "./table";

import {
  characters,
  choose,
  encounterDraw,
  enqueue,
  fx,
  get,
  has,
  inPlay,
  log,
  make,
  opts,
  prepend,
  random,
  shuffle,
  skip,
  units,
} from "./core";
import {
  damage,
  discardAttachment,
  progress,
  returnAlly,
  revealed,
} from "./board";
import { beginEnemyAttack, combatDamage, resolvePlayerAttack } from "./combat";

export function rescuePrisoner(s: GameState) {
  if (!s.prisoner) return;
  const hero = s.prisoner;
  s.prisoner = null;
  hero.damage = 1;
  forOwner(s, hero.owner ?? 0, () => {
    s.heroes.push(hero);
  });
  s.staging.push(make(s, "01102"));
  log(
    s,
    `${name(hero)} is rescued with 1 damage. The Nazgûl enters staging.`,
    "chapter",
  );
}

export function orcGuard(s: GameState) {
  const code = s.deck.shift();
  if (!code) return;
  const orc = make(s, "orc-guard");
  orc.facedownCard = code;
  s.engaged.push(orc);
  log(s, "The top card of your deck becomes an engaged Orc Guard.", "danger");
}

export function scenarioEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "attackProgress": {
      const responses = e.ids ?? [];
      if (!responses.length) break;
      choose(
        s,
        "Victory responses · Choose the next effect",
        [
          ...responses.map((id) => {
            const code = id.split(":")[0],
              value = code === "01005" ? 2 : 1;
            return {
              id,
              code,
              label: `${card(code).name} · Place ${value} progress`,
              effects: [
                fx("questProgress", { value }),
                fx("attackProgress", {
                  ids: responses.filter((x) => x !== id),
                }),
              ],
            };
          }),
          { ...skip, label: "Skip the remaining responses" },
        ],
        "Resolve each response separately. The quest may advance between them.",
      );
      break;
    }
    case "questProgress":
      log(s, `A victory response places ${e.value} progress.`, "good");
      progress(s, e.value ?? 0);
      break;
    case "valorResponse":
      if (u && get(s, e.source))
        choose(s, `Valor: ${name(u)}`, [
          {
            id: "use",
            label: "Exhaust Valor: heal 1 and deal 1 damage",
            effects: [fx("resolveValor", { target: u.id, source: e.source })],
          },
          skip,
        ]);
      break;
    case "resolveValor": {
      const a = u?.attachments.find((a) => a.code === "rc133" && !a.exhausted);
      if (u && a && get(s, e.source)) {
        a.exhausted = true;
        u.damage = Math.max(0, u.damage - 1);
        damage(s, e.source!, 1);
        log(
          s,
          "Valor heals its hero and deals 1 damage to the defending enemy.",
          "good",
        );
      }
      break;
    }
    case "resolvePlayerAttack":
      if (u) resolvePlayerAttack(s, u, e.ids ?? [], e.value ?? 0);
      break;
    case "ensureTroll":
      if (!inPlay(s, "01082")) {
        const i = s.encounterDeck.indexOf("01082");
        if (i >= 0) {
          s.encounterDeck.splice(i, 1);
          s.staging.push(make(s, "01082"));
          shuffle(s, s.encounterDeck);
        }
      }
      break;
    case "stageRevealed":
      s.stageRevealing = false;
      break;
    case "finishQuestPhase":
      allCharacters(s).forEach((u) => (u.committed = false));
      prepend(s, fx("phaseEnd"), fx("startTravel"));
      break;
    case "guardObjective": {
      const code = encounterDraw(s);
      if (u && code) revealed(s, code, u.id);
      break;
    }
    case "appointedByFate":
      choose(
        s,
        "Appointed by Fate",
        opts(allHeroes(s), (h) => [
          fx("attachBoon", { target: h.id, code: "rc134" }),
        ]),
        "This hero collects one extra resource each round. The prisoner’s attachments will be facedown until rescued.",
      );
      break;
    case "attachBoon":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: e.code!,
          exhausted: false,
        });
        log(s, `${card(e.code!).name} is attached to ${name(u)}.`, "good");
      }
      break;
    case "capturePrisoner": {
      const code = s.campaign?.prisoner;
      const hero =
        allHeroes(s).find((h) => h.code === code) ??
        allHeroes(s)[Math.floor(random(s) * allHeroes(s).length)];
      if (hero) {
        forOwner(s, ownerOf(s, hero), () => {
          s.heroes = s.heroes.filter((h) => h.id !== hero.id);
        });
        s.prisoner = hero;
        log(s, `${name(hero)} is the prisoner.`, "danger");
      }
      const m = allCharacters(s).find((a) => a.code === "rc135");
      if (m) {
        forOwner(s, ownerOf(s, m), () => {
          s.allies = s.allies.filter((a) => a.id !== m.id);
        });
        s.captiveMendor = m;
      }
      break;
    }
    case "earnPermanent": {
      const eligible = s.heroes.filter((h) => !has(h, e.code!));
      choose(
        s,
        e.code === "rc133" ? "Earn Valor" : "Scarred by the Hill Troll",
        [
          ...opts(eligible, (h) => [
            fx("attachBoon", { target: h.id, code: e.code }),
          ]),
          ...(e.code === "rc133" ? [skip] : []),
        ],
        "This card remains attached to its hero in later campaign chapters.",
      );
      break;
    }
    case "combatDamage": {
      const enemy = get(s, e.source);
      if (u && enemy) combatDamage(s, u, enemy, e.value ?? 0);
      break;
    }
    case "jailor":
      choose(
        s,
        "Dungeon Jailor",
        opts(
          s.staging.filter((o) => OBJECTIVES.includes(o.code)),
          (o) => [fx("shuffleObjective", { target: o.id })],
        ),
        "Shuffle one unclaimed objective back into the encounter deck.",
      );
      break;
    case "shuffleObjective":
      if (u) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        units(s).forEach((x) => {
          if (x.guarding === u.id) delete x.guarding;
        });
        s.encounterDeck.push(u.code);
        shuffle(s, s.encounterDeck);
      }
      break;
    case "nazgulDiscard":
      if (u)
        choose(
          s,
          "The Nazgûl demands a sacrifice",
          opts(characters(s), (x) => [
            fx("discardCharacter", { target: x.id }),
          ]),
          "After its shadow effect resolves, discard one character you control.",
        );
      break;
    case "discardCharacter":
      if (u) {
        // Discard is not destruction (Horn/Scarred), but it is leaving play (Brok).
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        s.heroes = s.heroes.filter((x) => x.id !== u.id);
        s.allies = s.allies.filter((x) => x.id !== u.id);
        if (u.code === "rc135") {
          s.removed.push(u.code);
          if (s.campaign && s.scenarioId !== "dol-guldur") {
            s.status = "lost";
            s.reason = "Mendor has left play.";
            s.queue = [];
            s.choice = null;
          }
        } else {
          seatView(s, u.owner ?? activeSeat(s)).discard.push(u.code);
          if (card(u.code).type_code === "hero")
            s.fallenThreat += card(u.code).threat ?? 0;
        }
        if (card(u.code).type_code === "ally") enqueue(s, fx("valiant"));
        if (
          card(u.code).type_code === "hero" &&
          card(u.code).traits?.includes("Dwarf")
        )
          prepend(s, fx("brok"));
        log(s, `${name(u)} is discarded.`, "danger");
      }
      break;
    case "returnAlly":
      if (u) {
        if (u.code === "rc135") {
          prepend(s, fx("discardCharacter", { target: u.id }));
          break;
        }
        returnAlly(s, u);
      }
      break;
    case "discardHand":
      choose(
        s,
        "Discard a card",
        opts(s.hand, (x) => [fx("discardHandCard", { target: x.id })]),
      );
      break;
    case "discardHandCard": {
      const h = s.hand.find((x) => x.id === e.target);
      if (h) {
        s.hand = s.hand.filter((x) => x.id !== h.id);
        s.discard.push(h.code);
      }
      break;
    }
    case "wolfAttack": {
      if (!s.combat) break;
      const original = get(s, s.combat.enemyId);
      const i = original?.shadows.indexOf("01081") ?? -1;
      if (original && i >= 0) original.shadows.splice(i, 1);
      (s.pendingWolfReturns ??= []).push("01081");
      s.suspendedCombats.push(s.combat);
      const wolf = make(s, "01081");
      s.engaged.push(wolf);
      const shadow = encounterDraw(s, true);
      if (shadow) wolf.shadows.push(shadow);
      choose(s, "Wolf Rider attacks from the shadows", [
        ...opts(defendersFor(s), (x) => [
          fx("wolfDefend", { target: wolf.id, source: x.id }),
        ]),
        {
          id: "undefended",
          label: "Leave the Wolf Rider attack undefended",
          effects: [fx("wolfDefend", { target: wolf.id })],
        },
      ]);
      break;
    }
    case "wolfDefend":
      if (u) beginEnemyAttack(s, u, e.source ? [e.source] : [], true);
      break;
    default:
      return false;
  }
  return true;
}
