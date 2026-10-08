import { mainQuestCode } from "./quest-state";
import { removePlayedEvent } from "./event-resolution";
// Complete original A Journey to Rhosgobel quest; Nightmare is a separate ruleset.
import { shadowFlamePlayerHealed } from "./shadow-flame-player-cards";
import encounters from "../data/rhosgobel-encounter-cards.json";
import quests from "../data/rhosgobel-quest-cards.json";
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  fx,
  get,
  isGuarded,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  skip,
  stats,
} from "./core";
import {
  questDefeated,
  characterLeftPlay,
  check,
  damage,
  discardAttachment,
  revealed,
  placeEncounter,
  win,
} from "./board";
import {
  effectiveKeyword,
  effectiveTraits,
  hasTrait,
} from "./expansion-passives";
import {
  allCharacters,
  allHeroes,
  forOwner,
  livingSeats,
  ownerOf,
  seatName,
  seatView,
} from "./table";

export const RHOSGOBEL_ENCOUNTERS = encounters as Card[];
export const RHOSGOBEL_QUESTS = quests as Card[];
const code = (suffix: string) =>
  `octgn:51223bd0-ffd1-11df-a976-0801203c${suffix}`;
export const RHOS = {
  wounds: code("9011"),
  athelas: code("9012"),
  bats: code("9013"),
  exhaustion: code("9014"),
  grove: code("9015"),
  flock: code("9016"),
  rhosgobel: code("9017"),
  insects: code("9018"),
  wilyador: code("9019"),
  woundedEagle: code("9020"),
  request: code("9022"),
  return: code("9024"),
} as const;
const wilyador = (s: GameState) =>
  allCharacters(s).find((u) => u.code === RHOS.wilyador);
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}

export function setupRhosgobel(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (c) => c !== RHOS.rhosgobel && c !== RHOS.wilyador,
  );
  placeEncounter(s, RHOS.rhosgobel, true);
  const eagle = make(s, RHOS.wilyador);
  eagle.damage = 2;
  forOwner(s, s.table?.first ?? 0, () => {
    s.allies.push(eagle);
  });
  shuffle(s, s.encounterDeck);
  log(
    s,
    "Rhosgobel enters staging. The first player controls Wilyador, who has 2 damage.",
    "chapter",
  );
}

/** Wilyador's controller cannot be eliminated even if other fellowships survive. */
export function rhosgobelCheck(s: GameState) {
  if (s.scenarioId !== "journey-to-rhosgobel" || s.phase === "setup") return;
  const eagle = wilyador(s);
  if (!eagle) {
    lose(s, "Wilyador has left play. The wounded Eagle cannot be saved.");
    return;
  }
  const player = ownerOf(s, eagle),
    seat = seatView(s, player);
  if (
    s.table?.seats[player].eliminated ||
    seat.threat >= 50 ||
    !seat.heroes.length
  )
    lose(
      s,
      "Wilyador's controlling fellowship has been eliminated. The Eagle is lost.",
    );
}

/** Unlike Grimbeorn, Wilyador's printed constant effect follows every first-player change. */
export function rhosgobelFollowFirstPlayer(s: GameState) {
  if (
    s.scenarioId !== "journey-to-rhosgobel" ||
    !s.table ||
    s.status !== "playing"
  )
    return;
  const eagle = wilyador(s);
  if (!eagle) return;
  const from = ownerOf(s, eagle),
    to = s.table.first;
  if (from === to) return;
  forOwner(s, from, () => {
    s.allies = s.allies.filter((u) => u.id !== eagle.id);
  });
  forOwner(s, to, () => {
    s.allies.push(eagle);
  });
  log(s, `Wilyador follows the first player: ${seatName(s, to)}.`);
}

export function rhosgobelRoundEnd(s: GameState) {
  if (s.scenarioId !== "journey-to-rhosgobel") return;
  const eagle = wilyador(s);
  if (eagle) damage(s, eagle.id, 2);
}

export function advanceRhosgobel(s: GameState) {
  if (s.scenarioId !== "journey-to-rhosgobel") return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice
  )
    return true;
  if (s.stage === 1 && s.progress >= 8) {
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    s.stage = 2;
    s.progress = 0;
    log(
      s,
      "Radagast's Request: find Athelas before Wilyador's wounds overwhelm him.",
      "chapter",
    );
  } else if (s.stage === 2 && s.progress >= 12) {
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    s.stage = 3;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("rhosReturn", { player: s.table?.first ?? 0 }));
    log(
      s,
      "Return to Rhosgobel: each controlled Athelas heals Wilyador separately.",
      "chapter",
    );
  }
  return true;
}

export const rhosgobelThreatBonus = (s: GameState, u: Unit) =>
  u.code === RHOS.rhosgobel ? livingSeats(s).length : 0;
export const rhosgobelCanAttach = (_s: GameState, u: Unit) =>
  u.code !== RHOS.wilyador;
export const rhosgobelCanFight = (enemy: Unit, u: Unit) =>
  !([RHOS.bats, RHOS.flock] as string[]).includes(enemy.code) ||
  hasTrait(u, "Eagle") ||
  effectiveKeyword(u, "Ranged");
export const rhosgobelTravelProblem = (s: GameState, u: Unit) =>
  u.code === RHOS.rhosgobel && s.stage === 1
    ? "Complete stage one before traveling to Rhosgobel."
    : null;
export const rhosgobelHealingAllowed = (s: GameState, u: Unit) =>
  !(
    s.scenarioId === "road-to-rivendell" &&
    s.stage === 3 &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  ) &&
  u.damage > 0 &&
  !(
    u.code === RHOS.wilyador && s.staging.some((x) => x.code === RHOS.rhosgobel)
  );

export type HealSource = { source?: string; code?: string; player?: number };
/** A heal effect resolves first; stage two then removes the actual healer, not its target. */
export function rhosgobelHeal(
  s: GameState,
  target: Unit,
  value: number,
  source: HealSource = {},
) {
  if (!rhosgobelHealingAllowed(s, target)) return 0;
  const amount = Math.min(
    target.damage,
    Math.max(0, value),
    target.code === RHOS.wilyador ? 5 : Infinity,
  );
  if (!amount) return 0;
  target.damage -= amount;
  log(s, `${name(target)} heals ${amount} damage.`, "good");
  if (
    target.code === RHOS.wilyador &&
    s.scenarioId === "journey-to-rhosgobel" &&
    s.stage === 2
  )
    removeHealer(s, source);
  shadowFlamePlayerHealed(s, target, amount, source);
  return amount;
}
function removeHealer(s: GameState, source: HealSource) {
  const host = allCharacters(s).find((u) =>
    u.attachments.some((a) => a.id === source.source),
  );
  const attachment = host?.attachments.find((a) => a.id === source.source);
  if (host && attachment) {
    const owner = attachment.owner ?? ownerOf(s, host);
    host.attachments = host.attachments.filter((a) => a.id !== attachment.id);
    forOwner(s, owner, () => {
      s.removed.push(attachment.code);
    });
    log(
      s,
      `${card(attachment.code).name} is removed from the game after healing Wilyador.`,
      "danger",
    );
    return;
  }
  const unit = source.source ? get(s, source.source) : undefined;
  if (unit && allCharacters(s).some((u) => u.id === unit.id)) {
    const controller = ownerOf(s, unit),
      owner = unit.owner ?? controller,
      lastKnownAttack = stats(s, unit).attack,
      lastKnownTraits = effectiveTraits(unit);
    for (const a of [...unit.attachments]) discardAttachment(s, unit, a, true);
    forOwner(s, controller, () => {
      s.heroes = s.heroes.filter((u) => u.id !== unit.id);
      s.allies = s.allies.filter((u) => u.id !== unit.id);
      s.committedIds = s.committedIds.filter((id) => id !== unit.id);
    });
    forOwner(s, owner, () => {
      s.removed.push(unit.code);
    });
    characterLeftPlay(
      s,
      unit,
      controller,
      {
        zone: "removed",
        player: owner,
        index: seatView(s, owner).removed.length - 1,
      },
      lastKnownAttack,
      lastKnownTraits,
    );
    check(s);
    if (["ally", "objective-ally"].includes(card(unit.code).type_code))
      prepend(s, fx("valiant", { player: controller }));
    log(
      s,
      `${name(unit)} is removed from the game after healing Wilyador.`,
      "danger",
    );
    return;
  }
  if (source.code) {
    const owner = source.player ?? s.table?.active ?? 0;
    forOwner(s, owner, () => {
      removePlayedEvent(s, source.code!);
    });
    log(
      s,
      `${card(source.code).name} is removed from the game after healing Wilyador.`,
      "danger",
    );
  }
}

export function rhosgobelQuestStart(s: GameState) {
  if (s.scenarioId !== "journey-to-rhosgobel" || s.stage !== 2) return;
  prepend(s, fx("rhosRequest", { player: s.table?.first ?? 0 }));
}

export function rhosgobelClaim(s: GameState, objective: Unit, hero: Unit) {
  if (objective.code !== RHOS.athelas) return false;
  requireRule(
    !hero.exhausted &&
      card(hero.code).type_code === "hero" &&
      !isGuarded(s, objective),
    "Athelas requires an unguarded objective and a ready hero to exhaust.",
  );
  hero.exhausted = true;
  s.staging = s.staging.filter((u) => u.id !== objective.id);
  hero.attachments.push({
    id: objective.id,
    code: objective.code,
    exhausted: false,
  });
  log(s, `${name(hero)} exhausts to claim Athelas.`, "good");
  return true;
}
export function rhosgobelExplored(s: GameState, location: Unit) {
  if (location.code === RHOS.grove)
    prepend(s, fx("rhosGrove", { player: s.table?.first ?? 0 }));
}

const damageEffects = (s: GameState, units: Unit[], value: number) =>
  units.map((u) =>
    fx("damage", { target: u.id, value, player: ownerOf(s, u) }),
  );
export function rhosgobelEncounter(s: GameState, encounterCode: string) {
  let affected: Unit[], value: number;
  switch (encounterCode) {
    case RHOS.wounds:
      affected = allCharacters(s).filter((u) => u.damage > 0);
      value = 2;
      break;
    case RHOS.exhaustion:
      affected = allCharacters(s).filter((u) => u.exhausted);
      value = 2;
      break;
    case RHOS.insects:
      affected = allCharacters(s).filter((u) => !u.attachments.length);
      value = 1;
      break;
    default:
      return false;
  }
  prepend(s, ...damageEffects(s, affected, value));
  s.encounterDiscard.push(encounterCode);
  return true;
}
export function rhosgobelShadow(s: GameState, shadowCode: string) {
  if (!s.combat) return false;
  switch (shadowCode) {
    case RHOS.bats:
    case RHOS.flock: {
      if (!s.combat.defenderId) {
        const eagle = wilyador(s);
        if (eagle) s.combat.undefendedTargetId = eagle.id;
      }
      break;
    }
    case RHOS.wounds:
      prepend(
        s,
        ...damageEffects(
          s,
          allCharacters(s).filter((u) => u.damage > 0),
          s.combat.defenderId ? 1 : 2,
        ),
      );
      break;
    case RHOS.exhaustion:
      prepend(
        s,
        ...damageEffects(
          s,
          allCharacters(s).filter((u) => u.exhausted),
          1,
        ),
      );
      break;
    case RHOS.insects: {
      const characters = allCharacters(s),
        maximum = Math.max(0, ...characters.map((u) => u.damage));
      const most = characters.filter((u) => u.damage === maximum);
      if (most.length === 1) prepend(s, ...damageEffects(s, most, 3));
      break;
    }
    default:
      return false;
  }
  return true;
}

export function rhosgobelEffect(s: GameState, e: Effect) {
  switch (e.kind) {
    case "rhosRequest":
      if (wilyador(s) && s.encounterDeck.length)
        choose(
          s,
          "Radagast's Request",
          [
            {
              id: "use",
              code: RHOS.request,
              label: `Place ${livingSeats(s).length} damage on Wilyador to look at three encounter cards`,
              effects: [fx("rhosLook", { player: s.table?.first ?? 0 })],
            },
            skip,
          ],
          "Optional response at the beginning of the quest phase.",
        );
      break;
    case "rhosLook": {
      const eagle = wilyador(s);
      if (!eagle) break;
      damage(s, eagle.id, livingSeats(s).length);
      if (s.status !== "playing") break;
      const looked = s.encounterDeck.splice(0, 3);
      choose(
        s,
        "Radagast's Request · Choose one encounter",
        looked.map((c, i) => ({
          id: `rhos-look-${i}`,
          label: card(c).name,
          code: c,
          effects: [
            fx("rhosRevealChosen", {
              code: c,
              ids: looked.filter((_, j) => i !== j),
            }),
          ],
        })),
        "Reveal the chosen card and discard the other cards.",
      );
      break;
    }
    case "rhosRevealChosen":
      prepend(s, fx("rhosDiscardOthers", { ids: e.ids }));
      if (e.code) revealed(s, e.code);
      break;
    case "rhosDiscardOthers":
      s.encounterDiscard.push(...(e.ids ?? []));
      break;
    case "rhosGrove": {
      const found =
        s.encounterDeck.includes(RHOS.athelas) ||
        s.encounterDiscard.includes(RHOS.athelas);
      if (found)
        choose(
          s,
          "Forest Grove",
          [
            {
              id: "use",
              label: "Search for Athelas and add it to staging",
              code: RHOS.athelas,
              effects: [fx("rhosFindAthelas")],
            },
            skip,
          ],
          "The searched objective is added, rather than revealed, and receives no encounter guard.",
        );
      break;
    }
    case "rhosFindAthelas": {
      const source = s.encounterDeck.includes(RHOS.athelas)
        ? s.encounterDeck
        : s.encounterDiscard;
      const index = source.indexOf(RHOS.athelas);
      if (index >= 0) {
        source.splice(index, 1);
        s.staging.push(make(s, RHOS.athelas));
        log(s, "Forest Grove finds an unguarded Athelas objective.", "good");
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "rhosReturn": {
      const eagle = wilyador(s);
      if (!eagle) {
        lose(s, "Wilyador has left play. The wounded Eagle cannot be saved.");
        break;
      }
      const athelas = allHeroes(s)
        .flatMap((h) => h.attachments)
        .filter((a) => a.code === RHOS.athelas).length;
      // FAQ: each Athelas treatment is a separate heal. Its nested responses
      // finish before the next treatment and the printed final outcome check.
      prepend(
        s,
        ...Array.from({ length: athelas }, () =>
          fx("rhosReturnHeal", {
            target: eagle.id,
            code: RHOS.return,
            player: s.table?.first ?? 0,
          }),
        ),
        fx("rhosReturnCheck", {
          target: eagle.id,
          player: s.table?.first ?? 0,
        }),
      );
      break;
    }
    case "rhosReturnHeal": {
      const eagle = get(s, e.target);
      if (eagle?.code === RHOS.wilyador)
        rhosgobelHeal(s, eagle, 5, {
          source: `quest:${RHOS.return}`,
          code: RHOS.return,
          player: s.table?.first ?? 0,
        });
      break;
    }
    case "rhosReturnCheck": {
      const eagle = wilyador(s);
      if (!eagle) {
        lose(s, "Wilyador has left play. The wounded Eagle cannot be saved.");
        break;
      }
      s.stageRevealing = false;
      if (eagle.damage === 0) win(s);
      else
        lose(
          s,
          "Wilyador still has wounds after the Athelas treatment. The Eagle is lost.",
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
