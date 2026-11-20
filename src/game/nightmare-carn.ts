/**
 * The Battle of Carn Dûm's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (the siege keyword, which Protect the Flanks carries; the quest stat
 * follows the side quest's text) and its Nightmare encounter cards,
 * composed with the scenario's own rules (src/game/carn-dum.ts) through
 * batch4Scenario while a Nightmare mode game is played. Effects use the
 * "ncd" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
} from "./core";
import { discardAttachment, enemyAddedToStaging } from "./board";
import {
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import {
  dealEnemyShadows,
  engagedEnemies,
  normalAttackPending,
} from "./considered-engagement";
import { carnShadowDealt } from "./carn-dum";
import { surgeEffects } from "./surge";
import { CARN as C } from "./carn-dum-support";
import { NIGHTMARE_AA as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
} from "./nightmare-core";

export interface NightmareCarnState {
  /** The Orc Wights in play that were dealt their 2 shadow cards as they entered play (a return to the staging area is not an entry). */
  carnWights?: string[];
  /** The Thaurdir's Elites whose 3 shadow cards triggered its Forced effect (until that count changes). */
  carnElites?: string[];
}

const ncdLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-battle-of-carn-dum" && !!s.carnDum;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter(isEnemy);
const thaurdir = (s: GameState) =>
  enemiesInPlay(s).find((u) => u.code === C.thaurdir);
/** A side quest in play (in the staging area) with its text live. */
const sideInPlay = (s: GameState, code: string) =>
  s.staging.some((u) => live(s, u, code));
const mares = (u: Unit) =>
  u.attachments.filter((a) => a.code === N.blackMare && !a.blanked).length;
/** Resolve a lone option directly; let the player choose between several. */
function pick(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  text?: string,
) {
  if (!options.length) return;
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () => choose(s, title, options, text));
}
/** Black Mare: "Attach to Thaurdir." (It stays despite his "Cannot have attachments".) */
function attachMare(s: GameState) {
  const boss = thaurdir(s);
  if (!boss) {
    s.encounterDiscard.push(N.blackMare);
    log(s, "Black Mare: Thaurdir is not in play; it is discarded.");
    return;
  }
  boss.attachments.push({
    id: `a${s.nextId++}`,
    code: N.blackMare,
    exhausted: false,
  });
  log(
    s,
    "Black Mare is attached to Thaurdir: he gets +3 hit points.",
    "danger",
  );
}
/** A card dealt facedown as a shadow card to an enemy, with the scenario's shadow-count checks. */
function dealAsShadow(s: GameState, u: Unit, code: string) {
  u.shadows.push(code);
  if (u.faceupShadows) u.faceupShadows.push(false);
  carnShadowDealt(s, u);
  eliteCheck(s);
}

// ------------------------------------------------------------- the cards

/**
 * Thaurdir's Elite: "Forced: If there are 3 shadow cards dealt to Thaurdir's
 * Elite, discard all shadow cards dealt to it and each player must discard
 * an ally he controls." Latched like the scenario's exactly-three Forced
 * effects, until the count changes.
 */
function eliteCheck(s: GameState) {
  if (!ncdLive(s) || s.status !== "playing") return;
  const eligible = enemiesInPlay(s).filter(
    (u) => live(s, u, N.elite) && u.shadows.length === 3,
  );
  const q = s.nightmare;
  const latched = (q?.carnElites ?? []).filter((id) =>
    eligible.some((u) => u.id === id),
  );
  const fresh = eligible.filter((u) => !latched.includes(u.id));
  for (const u of fresh) {
    latched.push(u.id);
    prepend(s, fx("ncdElite", { target: u.id, player: firstPlayer(s) }));
  }
  if (latched.length) (s.nightmare ??= {}).carnElites = latched;
  else if (q?.carnElites) delete q.carnElites;
}
/** Orc Wight: "Forced: After Orc Wight enters play, deal it 2 shadow cards." */
function ncdEnemyEntered(s: GameState, u: Unit) {
  if (!ncdLive(s) || !live(s, u, N.orcWight)) return;
  // An enemy returning to the staging area from engagement is already in play.
  const q = (s.nightmare ??= {});
  if (q.carnWights?.includes(u.id)) return;
  const inPlay = new Set(enemiesInPlay(s).map((x) => x.id));
  q.carnWights = [...(q.carnWights ?? []).filter((id) => inPlay.has(id)), u.id];
  prepend(s, fx("ncdWight", { target: u.id }));
}
/** Black Mare, attached: "Thaurdir gets +3 hit points." Sever the Head: "Thaurdir gets ... +2 [attack]." */
function ncdStats(s: GameState, u: Unit) {
  if (!ncdLive(s) || u.code !== C.thaurdir) return {};
  const health = 3 * mares(u);
  const attack = sideInPlay(s, N.sever) ? 2 : 0;
  return {
    ...(health ? { health } : {}),
    ...(attack ? { attack } : {}),
  };
}
/** Sever the Head: "Thaurdir gets +2 [threat]." */
const ncdThreatBonus = (s: GameState, u: Unit) =>
  ncdLive(s) && u.code === C.thaurdir && sideInPlay(s, N.sever) ? 2 : 0;
/** Sever the Head: Thaurdir "cannot take damage." */
const ncdDamageAmount = (s: GameState, u: Unit, amount: number) =>
  ncdLive(s) && u.code === C.thaurdir && sideInPlay(s, N.sever) ? 0 : amount;
/** Stronghold Tower: "While Stronghold Tower is in the staging area, shadow effects cannot be canceled." */
const ncdCannotCancel = (s: GameState, shadow?: boolean) =>
  !!shadow && ncdLive(s) && s.staging.some((u) => live(s, u, N.tower));
/** Rally the Fighters: "Shadow cards are immune to player card effects." */
const ncdShadowImmune = (s: GameState) => ncdLive(s) && sideInPlay(s, N.rally);
/** Stronghold Tower: "Travel: Each player must deal 2 damage to a character he controls to travel here." */
function ncdTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!ncdLive(s) || !live(s, u, N.tower)) return undefined;
  return playerOrder(s).map((player) => fx("ncdTower", { player }));
}
/** Gates of Carn Dûm: "Forced: After Gates of Carn Dûm is explored, deal it as a shadow card to the enemy in the staging area with the lowest engagement cost." */
function ncdExplored(s: GameState, u: Unit) {
  if (!ncdLive(s) || u.code !== N.gates || u.blanked) return;
  prepend(s, fx("ncdGates", { player: firstPlayer(s) }));
}
/** Protect the Flanks: "Forced: At the end of the combat phase, assign X damage among characters in play, where X is the total number of shadow cards dealt to enemies in the staging area." */
function ncdCombatEnd(s: GameState) {
  if (!ncdLive(s) || !sideInPlay(s, N.flanks)) return;
  const x = s.staging.filter(isEnemy).reduce((n, u) => n + u.shadows.length, 0);
  if (!x) {
    log(
      s,
      "Protect the Flanks: no shadow card is dealt to an enemy in the staging area.",
    );
    return;
  }
  prepend(s, fx("ncdFlanks", { value: x, player: firstPlayer(s) }));
}
/** Rally the Fighters: "Response: After this quest is defeated, discard 1 shadow card from each enemy in play." */
function ncdSideDefeated(s: GameState, u: Unit) {
  if (!ncdLive(s) || !live(s, u, N.rally)) return;
  prepend(s, fx("ncdRally", { player: firstPlayer(s) }));
}
/** Orc Wight's shadow: the attacker returns to the staging area after its attack. */
function ncdAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  skipped?: boolean,
): Effect[] {
  if (!ncdLive(s) || skipped || !c.nmReturnAfter) return [];
  return [fx("ncdReturn", { target: c.enemyId })];
}

function ncdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !ncdLive(s) ||
    !([N.decay, N.howling, N.blackMare] as string[]).includes(code)
  )
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  switch (code) {
    // Death and Decay: "When Revealed: Discard the top 3 cards of each
    // player's deck. Each player discards each attachment he controls that
    // has the same title as a card in his discard pile. If no attachments are
    // discarded from play by this effect, Death and Decay gains surge."
    case N.decay:
      s.encounterDiscard.push(code);
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("carnMill", { count: 3, player })),
        fx("ncdDecay", { player: firstPlayer(s) }),
      );
      return true;
    // Howling of Wargs: "When Revealed: Either deal 1 shadow card to each
    // enemy in the staging area, or search the encounter deck and discard
    // pile for a side quest and add it to the staging area. Shuffle the
    // encounter deck if it is searched."
    case N.howling:
      s.encounterDiscard.push(code);
      prepend(s, fx("ncdHowling", { player: firstPlayer(s) }));
      return true;
    // Black Mare: "When Revealed: Attach to Thaurdir."
    case N.blackMare:
      attachMare(s);
      return true;
  }
  return false;
}

function ncdShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ncdLive(s)) return false;
  const p = defendingPlayer(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Orc Wight: "If attacking enemy has at least 1 other shadow card
    // currently dealt to it, return it to the staging area after this
    // attack."
    case N.orcWight: {
      const others = enemy
        ? enemy.shadows.length - (enemy.shadows.includes(code) ? 1 : 0)
        : 0;
      if (others >= 1) {
        c.nmReturnAfter = (c.nmReturnAfter ?? 0) + 1;
        log(
          s,
          `Orc Wight: ${enemy ? name(enemy) : "the attacking enemy"} returns to the staging area after this attack.`,
          "danger",
        );
      } else log(s, "Orc Wight: the attacking enemy has no other shadow card.");
      return true;
    }
    // Thaurdir's Elite: "Either raise your threat by 4, or discard an ally
    // you control."
    case N.elite:
      prepend(s, fx("ncdEliteShadow", { player: p }));
      return true;
    // Gates of Carn Dûm: "Attacking enemy gets +1 [attack] and cannot take
    // damage this round."
    case N.gates:
      c.attackBonus += 1;
      if (enemy) enemy.roundCannotTakeDamage = true;
      log(
        s,
        `Gates of Carn Dûm: ${enemy ? name(enemy) : "the attacking enemy"} gets +1 [attack] and cannot take damage this round.`,
        "danger",
      );
      return true;
    // Howling of Wargs: "Deal 1 shadow card to each enemy engaged with you
    // that has not attacked this phase."
    case N.howling: {
      const waiting = engagedEnemies(s, p).filter(
        (x) => x.id !== c.enemyId && normalAttackPending(s, x, p),
      );
      for (const x of waiting) dealEnemyShadows(s, x, 1);
      log(
        s,
        waiting.length
          ? `Howling of Wargs: ${waiting.map(name).join(", ")} ${waiting.length === 1 ? "is" : "are"} dealt a shadow card.`
          : "Howling of Wargs: no other enemy engaged with the defending player waits to attack.",
        waiting.length ? "danger" : undefined,
      );
      return true;
    }
    // Black Mare: "Attach Black Mare to Thaurdir."
    case N.blackMare: {
      const at = enemy?.shadows.lastIndexOf(code) ?? -1;
      if (enemy && at >= 0) removeShadowCard(enemy, at);
      attachMare(s);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareCarnEffect(s: GameState, e: Effect): boolean {
  if (!ncdLive(s)) return false;
  // Black Mare: "Forced: After Thaurdir is flipped, raise each player's
  // threat by 1." Thaurdir flips (as the scenario flips him) and the first
  // player orders his new face's Forced effect and the Mare's.
  if (e.kind === "carnFlip") {
    const boss = get(s, e.target);
    if (!boss || boss.code !== C.thaurdir || !mares(boss)) return false;
    boss.flipped = !boss.flipped;
    log(
      s,
      `Thaurdir flips to ${boss.flipped ? "Champion" : "Captain"}.`,
      "danger",
    );
    const forced: Effect[] = [];
    if (!boss.blanked)
      forced.push(
        fx("carnBossForced", {
          target: boss.id,
          flag: boss.flipped,
          player: firstPlayer(s),
          text: `Thaurdir (${boss.flipped ? "Champion" : "Captain"}) · Forced`,
        }),
      );
    forced.push(
      fx("ncdMare", {
        code: N.blackMare,
        player: firstPlayer(s),
        text: "Black Mare · Raise each player's threat by 1",
      }),
    );
    prepend(
      s,
      forced.length === 1
        ? forced[0]
        : fx("fangornOrder", {
            effects: forced,
            text: "Thaurdir flips · Choose the next Forced effect",
            player: firstPlayer(s),
          }),
    );
    return true;
  }
  if (!e.kind.startsWith("ncd")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "ncdWight": {
      if (!u || !enemiesInPlay(s).some((x) => x.id === u.id)) return true;
      const dealt = dealEnemyShadows(s, u, 2);
      log(
        s,
        `Orc Wight enters play and is dealt ${dealt.length} shadow card${dealt.length === 1 ? "" : "s"}.`,
        "danger",
      );
      eliteCheck(s);
      return true;
    }
    case "ncdElite": {
      if (!u || !enemiesInPlay(s).some((x) => x.id === u.id)) return true;
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      delete u.shadowCancelsDamage;
      delete u.shadowCancelsCombatDamage;
      log(
        s,
        "Thaurdir's Elite has 3 shadow cards: they are discarded, and each player must discard an ally they control.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("ncdDiscardAlly", { player })),
      );
      eliteCheck(s);
      return true;
    }
    case "ncdDiscardAlly": {
      const allies = seatView(s, p).allies.filter(isAlly);
      if (!allies.length) {
        log(
          s,
          `Thaurdir's Elite: ${who(s, p)} control${s.table ? "s" : ""} no ally.`,
        );
        return true;
      }
      pick(
        s,
        p,
        `Thaurdir's Elite${seatLabel(s, p)} · Discard an ally you control`,
        allies.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("discardCharacter", { target: x.id, player: p })],
        })),
        card(N.elite).text,
      );
      return true;
    }
    case "ncdEliteShadow": {
      const options: Option[] = [
        {
          id: "threat",
          label: "Raise your threat by 4",
          effects: [fx("carnThreat", { value: 4, player: p })],
        },
        ...seatView(s, p)
          .allies.filter(isAlly)
          .map((x) => ({
            id: x.id,
            code: x.code,
            label: `Discard ${name(x)}`,
            effects: [fx("discardCharacter", { target: x.id, player: p })],
          })),
      ];
      pick(
        s,
        p,
        `Thaurdir's Elite${seatLabel(s, p)} · Raise your threat by 4, or discard an ally you control`,
        options,
        card(N.elite).shadow,
      );
      return true;
    }
    case "ncdHowling": {
      const sides = [...s.encounterDeck, ...s.encounterDiscard].some(
        (code) => card(code).type_code === "encounter-side-quest",
      );
      pick(
        s,
        p,
        "Howling of Wargs · Choose one",
        [
          {
            id: "shadows",
            label: "Deal 1 shadow card to each enemy in the staging area",
            effects: [fx("ncdHowlingDeal", { player: p })],
          },
          ...(sides
            ? [
                {
                  id: "search",
                  label:
                    "Search the encounter deck and discard pile for a side quest and add it to the staging area",
                  effects: [fx("ncdHowlingSearch", { player: p })],
                },
              ]
            : []),
        ],
        card(N.howling).text,
      );
      return true;
    }
    case "ncdHowlingDeal": {
      const staged = s.staging.filter(isEnemy);
      for (const x of staged) dealEnemyShadows(s, x, 1);
      eliteCheck(s);
      log(
        s,
        staged.length
          ? `Howling of Wargs: each enemy in the staging area is dealt a shadow card (${staged.length}).`
          : "Howling of Wargs: no enemy is in the staging area.",
        staged.length ? "danger" : undefined,
      );
      return true;
    }
    case "ncdHowlingSearch": {
      const found = new Map<string, Option>();
      for (const [pile, list] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const code of list)
          if (
            card(code).type_code === "encounter-side-quest" &&
            !found.has(`${pile}:${code}`)
          )
            found.set(`${pile}:${code}`, {
              id: `${pile}-${code}`,
              code,
              label: `${card(code).name} · ${pile === "deck" ? "encounter deck" : "discard pile"}`,
              effects: [fx("ncdHowlingTake", { code, text: pile })],
            });
      if (!found.size) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Howling of Wargs: no side quest is found; the encounter deck is shuffled.",
        );
        return true;
      }
      pick(
        s,
        p,
        "Howling of Wargs · Add a side quest to the staging area",
        [...found.values()],
        card(N.howling).text,
      );
      return true;
    }
    case "ncdHowlingTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = e.code ? pile.lastIndexOf(e.code) : -1;
      if (i >= 0) {
        pile.splice(i, 1);
        s.staging.push(make(s, e.code!));
        log(
          s,
          `Howling of Wargs: ${card(e.code!).name} is added to the staging area.`,
          "danger",
        );
      }
      shuffle(s, s.encounterDeck);
      return true;
    }
    case "ncdDecay": {
      let discarded = 0;
      for (const player of playerOrder(s)) {
        const titles = new Set(
          seatView(s, player).discard.map((code) => card(code).name),
        );
        const hosts = [
          ...globalCharacters(s),
          ...globalEngaged(s),
          ...s.staging,
          ...allActiveLocations(s),
        ];
        for (const host of hosts)
          for (const a of [...host.attachments]) {
            if (card(a.code).sphere_code === "encounter") continue;
            const controller = a.owner ?? ownerOf(s, host);
            if (controller !== player || !titles.has(card(a.code).name))
              continue;
            forOwner(s, player, () => discardAttachment(s, host, a));
            discarded++;
          }
      }
      log(
        s,
        discarded
          ? `Death and Decay: ${discarded} attachment${discarded === 1 ? " is" : "s are"} discarded.`
          : "Death and Decay: no attachment is discarded, so it gains surge.",
        "danger",
      );
      if (!discarded) {
        // Surge resolves after Thaurdir's Forced effect for the Sorcery card.
        const surge = surgeEffects(N.decay);
        const i = s.queue.findIndex(
          (x) => x.kind === "afterEncounterRevealed" && x.code === N.decay,
        );
        if (i >= 0) s.queue.splice(i + 1, 0, ...surge);
        else prepend(s, ...surge);
      }
      return true;
    }
    case "ncdTower": {
      const view = seatView(s, p);
      pick(
        s,
        p,
        `Stronghold Tower${seatLabel(s, p)} · Deal 2 damage to a character you control`,
        [...view.heroes, ...view.allies].filter(isCharacter).map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [fx("damage", { target: x.id, value: 2, player: p })],
        })),
        card(N.tower).text,
      );
      return true;
    }
    case "ncdGates": {
      if (!s.encounterDiscard.includes(N.gates)) return true;
      const staged = s.staging.filter(isEnemy);
      if (!staged.length) {
        log(s, "Gates of Carn Dûm: no enemy is in the staging area.");
        return true;
      }
      const low = Math.min(...staged.map((x) => engagementCost(s, x)));
      pick(
        s,
        p,
        "Gates of Carn Dûm · Deal it as a shadow card to the enemy with the lowest engagement cost",
        staged
          .filter((x) => engagementCost(s, x) === low)
          .map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${low} engagement cost`,
            effects: [fx("ncdGatesDeal", { target: x.id })],
          })),
        card(N.gates).text,
      );
      return true;
    }
    case "ncdGatesDeal": {
      const i = s.encounterDiscard.lastIndexOf(N.gates);
      if (!u || i < 0 || !s.staging.some((x) => x.id === u.id)) return true;
      s.encounterDiscard.splice(i, 1);
      dealAsShadow(s, u, N.gates);
      log(
        s,
        `Gates of Carn Dûm is dealt to ${name(u)} as a shadow card.`,
        "danger",
      );
      return true;
    }
    case "ncdFlanks": {
      const left = e.value ?? 0;
      const targets = globalCharacters(s).filter(isCharacter);
      if (left <= 0 || !targets.length) return true;
      pick(
        s,
        p,
        `Protect the Flanks · Assign 1 damage (${left} left)`,
        targets.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [
            fx("damage", { target: x.id, value: 1, player: ownerOf(s, x) }),
            fx("ncdFlanks", { value: left - 1, player: p }),
          ],
        })),
        card(N.flanks).text,
      );
      return true;
    }
    case "ncdRally":
      forOwner(s, p, () =>
        choose(
          s,
          "Rally the Fighters · Response",
          [
            {
              id: "discard",
              label: "Discard 1 shadow card from each enemy in play",
              effects: [fx("ncdRallyDiscard", { player: p })],
            },
            { id: "skip", label: "Skip the response", effects: [] },
          ],
          card(N.rally).text,
        ),
      );
      return true;
    case "ncdRallyDiscard": {
      let n = 0;
      for (const x of enemiesInPlay(s))
        if (x.shadows.length) {
          const code = removeShadowCard(x, x.shadows.length - 1);
          if (code) {
            s.encounterDiscard.push(code);
            n++;
          }
        }
      log(
        s,
        `Rally the Fighters: ${n} shadow card${n === 1 ? " is" : "s are"} discarded.`,
        "good",
      );
      return true;
    }
    case "ncdMare":
      log(
        s,
        "Black Mare: Thaurdir flipped, so each player's threat rises by 1.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("carnThreat", { value: 1, player }),
        ),
      );
      return true;
    case "ncdReturn": {
      if (!u || !globalEngaged(s).some((x) => x.id === u.id)) return true;
      // Its other shadow cards stay dealt to it (the scenario keeps them).
      forOwner(s, ownerOf(s, u), () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
      s.queue = s.queue.filter(
        (x) => !(x.kind === "immediateAttack" && x.target === u.id),
      );
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      log(s, `Orc Wight: ${name(u)} returns to the staging area.`, "danger");
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_CARN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  enemyEntered: ncdEnemyEntered,
  stats: ncdStats,
  threatBonus: ncdThreatBonus,
  damageAmount: ncdDamageAmount,
  cannotCancel: ncdCannotCancel,
  shadowImmune: ncdShadowImmune,
  travelEffects: ncdTravelEffects,
  explored: ncdExplored,
  combatEnd: ncdCombatEnd,
  sideDefeated: ncdSideDefeated,
  attackFinished: ncdAttackFinished,
  check: eliteCheck,
  shadowDealt: (s) => eliteCheck(s),
  encounter: ncdEncounter,
  shadow: ncdShadow,
  effect: nightmareCarnEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

const idList = (list: unknown) =>
  Array.isArray(list) &&
  list.every((id) => typeof id === "string") &&
  new Set(list).size === list.length;
export function validNightmareCarn(s: GameState) {
  const q = s.nightmare;
  if (q?.carnWights === undefined && q?.carnElites === undefined) return true;
  return (
    ncdLive(s) &&
    (q.carnWights === undefined || idList(q.carnWights)) &&
    (q.carnElites === undefined || idList(q.carnElites))
  );
}
