import { longDarkEffect } from "./long-dark";
import { shadowFlameEffect, shadowFlameQuestEnd } from "./shadow-flame";
import { takePlayerDeck } from "./core";
import { rhosgobelHeal } from "./rhosgobel";
// Scenario-specific rules for the three Core Set quests.
import { card, name } from "./cards";
import type { Effect, GameState } from "./types";
import { CLUE, OBJECTIVES } from "./scenarios";
import { carrockEffect } from "./carrock";
import { emynMuilEffect } from "./emyn-muil";
import { rhosgobelEffect } from "./rhosgobel";
import { deadMarshesEffect, deadMarshesQuestEnd } from "./dead-marshes";
import { returnMirkwoodEffect } from "./return-mirkwood";
import { khazadEffect, khazadQuestEnd } from "./khazad-dum";
import { redhornEffect } from "./redhorn-gate";
import { roadRivendellEffect } from "./road-rivendell";
import { watcherWaterEffect } from "./watcher-water";

import {
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
  fx,
  get,
  has,
  inPlay,
  log,
  make,
  opts,
  prepend,
  random,
  removeShadowCard,
  shuffle,
  skip,
  units,
} from "./core";
import {
  damage,
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
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
  const nazgul = make(s, "01102");
  s.staging.push(nazgul);
  enemyAddedToStaging(s, nazgul);
  log(
    s,
    `${name(hero)} is rescued with 1 damage. The Nazgûl enters staging.`,
    "chapter",
  );
}

export function orcGuard(s: GameState) {
  if (!s.deck.length) return;
  const physical = takePlayerDeck(s),
    code = physical.code;
  const orc = make(s, "orc-guard");
  orc.facedownCard = code;
  orc.facedownCardId = physical.id;
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
      progress(s, e.value ?? 0, true);
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
      const a = u?.attachments.find(
        (a) => !a.blanked && a.code === "rc133" && !a.exhausted,
      );
      if (u && a && get(s, e.source)) {
        a.exhausted = true;
        rhosgobelHeal(s, u, 1, {
          source: a.id,
          code: "rc133",
          player: ownerOf(s, u),
        });
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
          const troll = make(s, "01082");
          s.staging.push(troll);
          enemyAddedToStaging(s, troll);
          shuffle(s, s.encounterDeck);
        }
      }
      break;
    case "stageRevealed":
      s.stageRevealing = false;
      break;
    case "finishQuestPhase":
      if (!e.flag && deadMarshesQuestEnd(s)) break;
      khazadQuestEnd(s);
      allCharacters(s).forEach((u) => (u.committed = false));
      prepend(s, fx("phaseEnd"), fx("startTravel"));
      shadowFlameQuestEnd(s);
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
      if (u) discardCharacter(s, u);
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
        discardHandCard(s, h.id);
      }
      break;
    }
    case "wolfAttack": {
      if (!s.combat) break;
      const original = get(s, s.combat.enemyId);
      const i = original?.shadows.indexOf("01081") ?? -1;
      if (original && i >= 0) removeShadowCard(original, i);
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
    case "huntLook": {
      const count = Math.min(e.count ?? 1, s.encounterDeck.length);
      const top = s.encounterDeck.slice(0, count);
      if (!top.length) break;
      choose(
        s,
        "The trail · Choose a card to reveal",
        top.map((code, i) => ({
          id: `look-${i}`,
          code,
          label: `Reveal ${card(code).name}`,
          effects: [fx("huntReveal", { code, value: i, count })],
        })),
        "The first player looks at the top cards of the encounter deck, reveals one of them and discards the rest.",
      );
      break;
    }
    case "huntReveal": {
      const looked = s.encounterDeck.splice(0, e.count ?? 1);
      looked.splice(e.value ?? 0, 1);
      s.encounterDiscard.push(...looked);
      if (looked.length)
        log(
          s,
          `${looked.map((code) => card(code).name).join(", ")} discarded from the top of the encounter deck.`,
        );
      revealed(s, e.code!);
      break;
    }
    case "huntClaim": {
      const signs = s.staging.find(
        (x) => x.code === CLUE && !units(s).some((g) => g.guarding === x.id),
      );
      if (!signs) break;
      const committed = allHeroes(s).filter(
        (h) =>
          h.committed || seatView(s, ownerOf(s, h)).committedIds.includes(h.id),
      );
      if (!committed.length) break;
      choose(
        s,
        "Signs of Gollum · Claim the clue",
        [
          ...opts(committed, (h) => [
            fx("huntAttach", { target: h.id, source: signs.id }),
            fx("huntClaim", { player: e.player }),
          ]),
          { ...skip, label: "Leave it in the staging area" },
        ],
        "Attach the sign to a hero committed to the quest. If that hero is damaged or leaves play, the sign returns to the top of the encounter deck.",
      );
      break;
    }
    case "huntProgress":
      progress(s, e.value ?? 0);
      break;
    case "huntAttach": {
      const signs = s.staging.find((x) => x.id === e.source);
      if (u && signs) {
        s.staging = s.staging.filter((x) => x.id !== signs.id);
        u.attachments.push({
          id: signs.id,
          code: signs.code,
          exhausted: false,
        });
        log(s, `${name(u)} claims Signs of Gollum.`, "good");
      }
      break;
    }
    case "clueShuffle": {
      if (e.source) {
        const a = u?.attachments.find((x) => x.id === e.source);
        if (u && a) {
          u.attachments = u.attachments.filter((x) => x.id !== a.id);
          s.encounterDeck.push(a.code);
          shuffle(s, s.encounterDeck);
          log(
            s,
            `Signs of Gollum leaves ${name(u)} and is shuffled into the encounter deck.`,
            "danger",
          );
        }
      } else if (u) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        units(s).forEach((x) => {
          if (x.guarding === u.id) delete x.guarding;
        });
        s.encounterDeck.push(u.code);
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Signs of Gollum is shuffled back into the encounter deck.",
          "danger",
        );
      }
      break;
    }
    default:
      return (
        carrockEffect(s, e) ||
        emynMuilEffect(s, e) ||
        rhosgobelEffect(s, e) ||
        deadMarshesEffect(s, e) ||
        returnMirkwoodEffect(s, e) ||
        khazadEffect(s, e) ||
        shadowFlameEffect(s, e) ||
        longDarkEffect(s, e) ||
        watcherWaterEffect(s, e) ||
        roadRivendellEffect(s, e) ||
        redhornEffect(s, e)
      );
  }
  return true;
}
