// The Dream-chaser campaign's The Drowned Ruins (Part 7): the four copies of
// Command (boon events, scalable) and of Círdan's Blessing (boon
// attachments, scalable) its campaign card offers during setup, which then
// follow their players' decks through the Campaign Pool.
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  choose,
  fx,
  get,
  log,
  prepend,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  seatName,
} from "./table";
import {
  discardCharacter,
  engage,
  enterAlly,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import { playerCardImmune } from "./card-immunity";
import { putPlayedEventInVictory } from "./event-resolution";
import { effectiveTraits } from "./expansion-passives";
import {
  CIRDAN,
  COMMAND,
  DC,
  dcBase,
  dcFace,
  dcIs,
  dcLevel,
  isDreamchaserGame,
} from "./dreamchaser-campaign-support";
import { dreamchaserEncounterDiscarded } from "./dreamchaser-campaign-cards";

const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const state = (s: GameState) => (s.dreamchaser ??= {});
const sphereOf = (code: string) => card(code).boon_sphere ?? "";
const isCommand = (code: string) =>
  (COMMAND as readonly string[]).includes(dcBase(code));
const isCirdan = (code: string) =>
  (CIRDAN as readonly string[]).includes(dcBase(code));
/** Every Círdan's Blessing in play with the characters they are attached to. */
const blessings = (s: GameState) =>
  allCharacters(s).flatMap((u) =>
    u.attachments
      .filter((a) => isCirdan(a.code) && !a.blanked)
      .map((a) => ({ host: u, a })),
  );
const blessed = (u: Unit, copy?: string) =>
  u.attachments.some(
    (a) => !a.blanked && (copy ? dcIs(a.code, copy) : isCirdan(a.code)),
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) =>
      ["enemy", "ship-enemy"].includes(card(u.code).type_code) &&
      !playerCardImmune(u),
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (l) =>
      card(l.code).type_code === "location" &&
      !card(l.code).is_unique &&
      !playerCardImmune(l),
  );

// ------------------------------------------------------------- Command

/** The four options each copy of Command prints, by its sphere. */
const COMMAND_OPTIONS: Record<string, { id: string; label: string }[]> = {
  [COMMAND[0]]: [
    {
      id: "defense",
      label: "A hero gets +2 defense until the end of the round",
    },
    {
      id: "weaken",
      label: "An enemy gets −2 defense until the end of the round",
    },
    { id: "ready", label: "Ready a character with Círdan's Blessing on it" },
    {
      id: "ally",
      label:
        "Put an ally with cost X or less in your discard pile into play (discard it at the end of the phase)",
    },
  ],
  [COMMAND[1]]: [
    { id: "strip", label: "Remove X resources from a non-unique enemy" },
    { id: "bless", label: "Add 2 resources to each Círdan's Blessing" },
    { id: "bottom", label: "Add the bottom card of your deck to your hand" },
    {
      id: "scry",
      label:
        "Look at the top 10 cards of the encounter deck, discard any number of them, and shuffle it",
    },
  ],
  [COMMAND[2]]: [
    {
      id: "will",
      label: "A hero gets +2 willpower until the end of the round",
    },
    {
      id: "quest",
      label:
        "Each character with Círdan's Blessing does not exhaust to commit to a quest this round",
    },
    { id: "progress", label: "Place 2 progress on a non-unique location" },
    { id: "spyglass", label: "Put Spyglass into play attached to a hero" },
  ],
  [COMMAND[3]]: [
    { id: "attack", label: "A hero gets +2 attack until the end of the round" },
    {
      id: "blunt",
      label: "An enemy gets −2 attack until the end of the round",
    },
    { id: "damage", label: "Deal 2 damage to an enemy (you may engage it)" },
    {
      id: "attachment",
      label: "Ready an attachment (you may move it to an eligible character)",
    },
  ],
};
/** Can this Command option do anything now? */
function optionUsable(s: GameState, id: string, x: number): boolean {
  switch (id) {
    case "defense":
    case "will":
    case "attack":
      return allHeroes(s).length > 0;
    case "weaken":
    case "blunt":
    case "damage":
      return enemies(s).length > 0;
    case "ready":
      return allCharacters(s).some((u) => u.exhausted && blessed(u));
    case "ally":
      return summonable(s, x).length > 0;
    case "strip":
      return enemies(s).some((e) => !card(e.code).is_unique && e.resources > 0);
    case "bless":
      return blessings(s).length > 0;
    case "bottom":
      return s.deck.length > 0;
    case "scry":
      return s.encounterDeck.length > 0;
    case "quest":
      return true;
    case "progress":
      return locations(s).length > 0;
    case "spyglass":
      return (
        allHeroes(s).length > 0 &&
        !allCharacters(s).some((u) =>
          u.attachments.some((a) => dcIs(a.code, DC.spyglass)),
        )
      );
    case "attachment":
      return readyable(s).length > 0;
    default:
      return false;
  }
}
/** The allies with cost X or less in the player's discard pile. */
const summonable = (s: GameState, x: number) =>
  s.discard
    .map((code, index) => ({ code, index }))
    .filter(
      ({ code }) =>
        card(code).type_code === "ally" &&
        Number.isInteger(Number(card(code).cost)) &&
        Number(card(code).cost) <= x,
    );
/** The exhausted attachments on characters. */
const readyable = (s: GameState) =>
  allCharacters(s).flatMap((u) =>
    u.attachments
      .filter((a) => a.exhausted && !a.facedown)
      .map((a) => ({ host: u, a })),
  );

/**
 * Command: "Action: Add Command to the victory display to choose up to X
 * options, where X is its level." Each option may be chosen once.
 */
export function dreamchaserCommandPlayed(s: GameState, code: string) {
  if (!isDreamchaserGame(s) || !isCommand(code)) return false;
  const x = dcLevel(s, dcBase(code));
  putPlayedEventInVictory(s, code);
  log(s, `Command (${sphereOf(code)}): X is ${x}.`);
  if (x > 0)
    prepend(
      s,
      fx("dcCommandPick", {
        code: dcBase(code),
        value: x,
        count: x,
        ids: [],
        player: activeSeat(s),
      }),
    );
  return true;
}

// --------------------------------------------------- Círdan's Blessing

/** Círdan's Blessing: "Attach to a character" (the Lore copy: "Attach to a hero"). */
export function dreamchaserPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (!isDreamchaserGame(s) || !isCirdan(code)) return undefined;
  return dcBase(code) === CIRDAN[3] ? allHeroes(s) : allCharacters(s);
}
/** "Círdan's Blessing enters play with X resources on it. X is 1 more than its level." */
export function cirdanEntered(s: GameState, a: Attachment) {
  if (!isDreamchaserGame(s) || !isCirdan(a.code)) return;
  a.resourceTokens = 1 + dcLevel(s, dcBase(a.code));
  log(
    s,
    `Círdan's Blessing (${sphereOf(a.code)}) enters play with ${a.resourceTokens} resources.`,
    "good",
  );
}
/** Círdan's Blessing (Leadership): "Response: When attached character defends, …" */
export function cirdanDefenders(s: GameState, defenders: Unit[]): Effect[] {
  return defenders.flatMap((d) =>
    d.attachments
      .filter(
        (a) =>
          dcIs(a.code, CIRDAN[0]) && !a.blanked && (a.resourceTokens ?? 0) > 0,
      )
      .map((a) =>
        fx("dcCirdanDefend", {
          target: d.id,
          source: a.id,
          player: attachmentController(s, d, a) ?? ownerOf(s, d),
        }),
      ),
  );
}
/** Círdan's Blessing (Tactics): "Response: When attached character attacks, …" */
export function cirdanAttackers(s: GameState, attackers: Unit[]): Effect[] {
  return attackers.flatMap((u) =>
    u.attachments
      .filter(
        (a) =>
          dcIs(a.code, CIRDAN[1]) && !a.blanked && (a.resourceTokens ?? 0) > 0,
      )
      .map((a) =>
        fx("dcCirdanStrike", {
          target: u.id,
          source: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      ),
  );
}
/** "+3 [attack] for this attack." */
export const cirdanAttackBonus = (s: GameState, u: Unit) =>
  s.dreamchaser?.strikes?.[u.id] ?? 0;
export function cirdanAttackResolved(s: GameState, ids: string[]) {
  const q = s.dreamchaser;
  if (!q?.strikes) return;
  for (const id of ids) delete q.strikes[id];
  if (!Object.keys(q.strikes).length) delete q.strikes;
}
/**
 * Círdan's Blessing (Lore): "Response: After the active location is
 * explored, move 1 resource from Círdan's Blessing to attached hero's
 * resource pool. Then, heal 1 damage from attached hero."
 */
export function cirdanLocationExplored(s: GameState, wasActive: boolean) {
  if (!isDreamchaserGame(s) || !wasActive) return;
  const offers = allHeroes(s).flatMap((h) =>
    h.attachments
      .filter(
        (a) =>
          dcIs(a.code, CIRDAN[3]) && !a.blanked && (a.resourceTokens ?? 0) > 0,
      )
      .map((a) =>
        fx("dcCirdanLore", {
          target: h.id,
          source: a.id,
          player: attachmentController(s, h, a) ?? ownerOf(s, h),
        }),
      ),
  );
  if (offers.length) prepend(s, ...offers);
}
/** Círdan's Blessing (Spirit): its Action. */
export const cirdanLabel = (code: string) =>
  dcIs(code, CIRDAN[2])
    ? "Círdan's Blessing · Exhaust and remove 1 resource: +3 willpower until the end of the phase"
    : undefined;
export function cirdanProblem(a: Attachment): string | null {
  if (a.exhausted) return "Círdan's Blessing is exhausted.";
  if (!(a.resourceTokens ?? 0)) return "Círdan's Blessing has no resources.";
  return null;
}
export function cirdanAbility(s: GameState, u: Unit, a: Attachment) {
  a.exhausted = true;
  a.resourceTokens = (a.resourceTokens ?? 0) - 1;
  boost(s, u.id, "phase", { will: 3 });
  log(
    s,
    `Círdan's Blessing: ${name(u)} gets +3 willpower until the end of the phase.`,
    "good",
  );
}
/** Command (Spirit): "Each character with Círdan's Blessing on it does not exhaust to commit to a quest this round." */
export const dreamchaserNoQuestExhaust = (s: GameState, u: Unit) =>
  isDreamchaserGame(s) && s.dreamchaser?.blessedQuest === s.round && blessed(u);
/** Command (Leadership): the allies it put into play are discarded at the end of the phase. */
export function dreamchaserDrownedPhaseEnd(s: GameState): Effect[] {
  const ids = s.dreamchaser?.summoned ?? [];
  if (!ids.length) return [];
  delete s.dreamchaser!.summoned;
  return ids
    .filter((id) => get(s, id))
    .map((id) => fx("dcCommandDismiss", { target: id }));
}

/** A stat change until the end of the round or phase (Command, Círdan's Blessing). */
function boost(
  s: GameState,
  target: string,
  until: "round" | "phase",
  amounts: { will?: number; attack?: number; defense?: number },
) {
  (state(s).boosts ??= []).push({
    target,
    until,
    phase: s.phase,
    round: s.round,
    will: amounts.will ?? 0,
    attack: amounts.attack ?? 0,
    defense: amounts.defense ?? 0,
  });
}
/** "Eligible": the character the attachment's own "Attach to …" allows. */
function eligibleHosts(s: GameState, a: Attachment, host: Unit): Unit[] {
  const text = card(a.code).text ?? "";
  const m = /Attach to (?:a|an) (?:([A-Z][\w'-]*) )?(hero|character|ally)/.exec(
    text,
  );
  if (!m) return [];
  const [, trait, kind] = m;
  return allCharacters(s).filter(
    (u) =>
      u.id !== host.id &&
      (kind === "character" ||
        card(u.code).type_code === kind ||
        (kind === "ally" && card(u.code).type_code === "objective-ally")) &&
      (!trait || effectiveTraits(u).includes(trait)) &&
      !u.attachments.some((x) => x.code === a.code && card(a.code).is_unique),
  );
}

// ------------------------------------------------------------- effects

export function dreamchaserDrownedEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "dcCommandPick": {
      const code = e.code!;
      const left = e.value ?? 0;
      const used = e.ids ?? [];
      const x = e.count ?? 0;
      if (left <= 0) return true;
      const options = (COMMAND_OPTIONS[code] ?? []).filter(
        (o) => !used.includes(o.id) && optionUsable(s, o.id, x),
      );
      if (!options.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Command (${sphereOf(code)}) · Choose an option (${left} of ${x} left)`,
          [
            ...options.map((o) => ({
              id: o.id,
              label: o.label.replace("X", String(x)),
              effects: [
                fx("dcCommandDo", { code, text: o.id, count: x, player: p }),
                fx("dcCommandPick", {
                  code,
                  value: left - 1,
                  count: x,
                  ids: [...used, o.id],
                  player: p,
                }),
              ],
            })),
            { id: "skip", label: "Done", effects: [] },
          ],
          card(code).text,
        ),
      );
      return true;
    }
    case "dcCommandDo":
      forOwner(s, p, () => commandOption(s, e, p));
      return true;
    case "dcCommandBoost": {
      if (!u) return true;
      const [stat, amount] = (e.text ?? "").split(":");
      boost(s, u.id, "round", { [stat]: Number(amount) });
      log(
        s,
        `Command: ${name(u)} gets ${Number(amount) > 0 ? "+" : ""}${amount} ${stat === "will" ? "willpower" : stat} until the end of the round.`,
        "good",
      );
      return true;
    }
    case "dcCommandReady":
      if (u) readyCharacter(s, u);
      return true;
    case "dcCommandSummon": {
      forOwner(s, p, () => {
        const index = s.discard.lastIndexOf(e.code ?? "");
        if (index < 0) return;
        const ally = takePlayerDiscard(s, index);
        enterAlly(s, ally);
        (state(s).summoned ??= []).push(ally.id);
        log(
          s,
          `Command: ${name(ally)} enters play from the discard pile until the end of the phase.`,
          "good",
        );
      });
      return true;
    }
    case "dcCommandDismiss":
      if (u) {
        log(s, `Command: ${name(u)} is discarded at the end of the phase.`);
        discardCharacter(s, u);
      }
      return true;
    case "dcCommandStrip":
      if (u) {
        const n = Math.min(u.resources, e.value ?? 0);
        u.resources -= n;
        log(s, `Command: ${n} resources are removed from ${name(u)}.`, "good");
      }
      return true;
    case "dcCommandScry": {
      // "Look at the top 10 cards of the encounter deck, discard any number
      // of them, and shuffle it."
      const n = Math.min(e.value ?? 0, s.encounterDeck.length);
      const seen = s.encounterDeck.slice(0, n);
      forOwner(s, p, () =>
        choose(s, `Command · The top ${n} cards of the encounter deck`, [
          ...seen.map((code, i) => ({
            id: `card-${i}`,
            code,
            label: `Discard ${card(code).name}`,
            effects: [
              fx("dcCommandScryDiscard", {
                count: i,
                code,
                value: n,
                player: p,
              }),
            ],
          })),
          {
            id: "skip",
            label: "Done · shuffle the encounter deck",
            effects: [fx("dcCommandScryShuffle", { player: p })],
          },
        ]),
      );
      return true;
    }
    case "dcCommandScryDiscard": {
      const i = e.count ?? -1;
      if (s.encounterDeck[i] !== e.code) return true;
      const [code] = s.encounterDeck.splice(i, 1);
      s.encounterDiscard.push(code);
      dreamchaserEncounterDiscarded(s, [code]);
      prepend(s, fx("dcCommandScry", { value: (e.value ?? 1) - 1, player: p }));
      return true;
    }
    case "dcCommandScryShuffle":
      shuffle(s, s.encounterDeck);
      log(s, "Command: the encounter deck is shuffled.");
      return true;
    case "dcCommandSpyglass":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: dcFace(s.campaign, DC.spyglass),
          exhausted: false,
          owner: ownerOf(s, u),
          controller: ownerOf(s, u),
        });
        log(
          s,
          `Command: Spyglass is put into play attached to ${name(u)}.`,
          "good",
        );
      }
      return true;
    case "dcCommandHit":
      if (!u) return true;
      prepend(
        s,
        fx("damage", { target: u.id, value: 2, player: p }),
        fx("dcCommandEngage", { target: u.id, player: p }),
      );
      return true;
    case "dcCommandEngage":
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      forOwner(s, p, () =>
        choose(s, `Command · Engage ${name(u)}?`, [
          {
            id: "engage",
            code: u.code,
            label: `Engage ${name(u)}`,
            effects: [fx("dcCommandEngaged", { target: u.id, player: p })],
          },
          { id: "skip", label: "Leave it in the staging area", effects: [] },
        ]),
      );
      return true;
    case "dcCommandEngaged":
      if (u && s.staging.some((x) => x.id === u.id))
        forOwner(s, p, () => engage(s, u, true));
      return true;
    case "dcCommandAttachment": {
      const host = u;
      const a = host?.attachments.find((x) => x.id === e.source);
      if (!host || !a) return true;
      a.exhausted = false;
      log(s, `Command: ${card(a.code).name} readies.`, "good");
      const hosts = eligibleHosts(s, a, host);
      if (!hosts.length) return true;
      forOwner(s, p, () =>
        choose(s, `Command · Move ${card(a.code).name} to another character?`, [
          ...hosts.map((h) => ({
            id: h.id,
            code: h.code,
            label: `Move it to ${name(h)}`,
            effects: [
              fx("dcCommandMove", {
                target: host.id,
                source: a.id,
                ids: [h.id],
                player: p,
              }),
            ],
          })),
          { id: "skip", label: `Leave it on ${name(host)}`, effects: [] },
        ]),
      );
      return true;
    }
    case "dcCommandMove": {
      const to = get(s, e.ids?.[0]);
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !to || !a) return true;
      u.attachments = u.attachments.filter((x) => x.id !== a.id);
      to.attachments.push(a);
      log(s, `Command: ${card(a.code).name} moves to ${name(to)}.`, "good");
      return true;
    }
    case "dcCirdanDefend": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a || !(a.resourceTokens ?? 0) || !s.combat) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Círdan's Blessing · ${name(u)} defends`,
          [
            {
              id: "use",
              code: a.code,
              label: `Remove 1 resource: ${name(u)} gets +3 defense for this attack`,
              effects: [
                fx("dcCirdanDefendUse", {
                  target: u.id,
                  source: a.id,
                  player: p,
                }),
              ],
            },
            { id: "skip", label: "Decline", effects: [] },
          ],
          card(a.code).text,
        ),
      );
      return true;
    }
    case "dcCirdanDefendUse": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a || !(a.resourceTokens ?? 0) || !s.combat) return true;
      a.resourceTokens = (a.resourceTokens ?? 0) - 1;
      s.combat.defenseBonuses ??= {};
      s.combat.defenseBonuses[u.id] = (s.combat.defenseBonuses[u.id] ?? 0) + 3;
      log(
        s,
        `Círdan's Blessing: ${name(u)} gets +3 defense for this attack.`,
        "good",
      );
      return true;
    }
    case "dcCirdanStrike": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a || !(a.resourceTokens ?? 0)) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Círdan's Blessing · ${name(u)} attacks`,
          [
            {
              id: "use",
              code: a.code,
              label: `Remove 1 resource: ${name(u)} gets +3 attack for this attack`,
              effects: [
                fx("dcCirdanStrikeUse", {
                  target: u.id,
                  source: a.id,
                  player: p,
                }),
              ],
            },
            { id: "skip", label: "Decline", effects: [] },
          ],
          card(a.code).text,
        ),
      );
      return true;
    }
    case "dcCirdanStrikeUse": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a || !(a.resourceTokens ?? 0)) return true;
      a.resourceTokens = (a.resourceTokens ?? 0) - 1;
      const q = state(s);
      q.strikes = {
        ...(q.strikes ?? {}),
        [u.id]: (q.strikes?.[u.id] ?? 0) + 3,
      };
      log(
        s,
        `Círdan's Blessing: ${name(u)} gets +3 attack for this attack.`,
        "good",
      );
      return true;
    }
    case "dcCirdanLore": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a || !(a.resourceTokens ?? 0)) return true;
      forOwner(s, p, () =>
        choose(
          s,
          "Círdan's Blessing · The active location is explored",
          [
            {
              id: "use",
              code: a.code,
              label: `Move 1 resource to ${name(u)}'s pool, then heal 1 damage from them`,
              effects: [
                fx("dcCirdanLoreUse", {
                  target: u.id,
                  source: a.id,
                  player: p,
                }),
              ],
            },
            { id: "skip", label: "Decline", effects: [] },
          ],
          card(a.code).text,
        ),
      );
      return true;
    }
    case "dcCirdanLoreUse": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a || !(a.resourceTokens ?? 0)) return true;
      a.resourceTokens = (a.resourceTokens ?? 0) - 1;
      if (canGainResources(s, u)) u.resources += 1;
      log(s, `Círdan's Blessing moves 1 resource to ${name(u)}.`, "good");
      prepend(
        s,
        fx("heal", { target: u.id, value: 1, code: a.code, player: p }),
      );
      return true;
    }
    default:
      return false;
  }
}

/** The target choice of one Command option. */
function commandOption(s: GameState, e: Effect, p: number) {
  const x = e.count ?? 0;
  const pick = (
    title: string,
    units: Unit[],
    effect: (u: Unit) => Effect[],
  ) => {
    if (!units.length) return;
    choose(
      s,
      `Command · ${title}`,
      units.map((u) => ({
        id: u.id,
        code: u.code,
        label: `${name(u)}${several(s) && card(u.code).type_code !== "enemy" && card(u.code).type_code !== "location" ? ` (${seatName(s, ownerOf(s, u))})` : ""}`,
        effects: effect(u),
      })),
    );
  };
  const boostOf = (stat: string, amount: number) => (u: Unit) => [
    fx("dcCommandBoost", {
      target: u.id,
      text: `${stat}:${amount}`,
      player: p,
    }),
  ];
  switch (e.text) {
    case "defense":
      return pick(
        "A hero gets +2 defense until the end of the round",
        allHeroes(s),
        boostOf("defense", 2),
      );
    case "will":
      return pick(
        "A hero gets +2 willpower until the end of the round",
        allHeroes(s),
        boostOf("will", 2),
      );
    case "attack":
      return pick(
        "A hero gets +2 attack until the end of the round",
        allHeroes(s),
        boostOf("attack", 2),
      );
    case "weaken":
      return pick(
        "An enemy gets −2 defense until the end of the round",
        enemies(s),
        boostOf("defense", -2),
      );
    case "blunt":
      return pick(
        "An enemy gets −2 attack until the end of the round",
        enemies(s),
        boostOf("attack", -2),
      );
    case "ready":
      return pick(
        "Ready a character with Círdan's Blessing on it",
        allCharacters(s).filter((u) => u.exhausted && blessed(u)),
        (u) => [fx("dcCommandReady", { target: u.id, player: p })],
      );
    case "ally": {
      const allies = summonable(s, x);
      if (!allies.length) return;
      choose(
        s,
        `Command · Put an ally with cost ${x} or less from your discard pile into play`,
        [...new Set(allies.map((a) => a.code))].map((code) => ({
          id: code,
          code,
          label: `${card(code).name} (cost ${card(code).cost})`,
          effects: [fx("dcCommandSummon", { code, player: p })],
        })),
      );
      return;
    }
    case "strip":
      return pick(
        `Remove ${x} resources from a non-unique enemy`,
        enemies(s).filter((u) => !card(u.code).is_unique && u.resources > 0),
        (u) => [fx("dcCommandStrip", { target: u.id, value: x, player: p })],
      );
    case "bless":
      for (const { a } of blessings(s))
        a.resourceTokens = (a.resourceTokens ?? 0) + 2;
      log(s, "Command: each Círdan's Blessing gains 2 resources.", "good");
      return;
    case "bottom":
      if (s.deck.length) {
        const bottom = takePlayerDeck(s, s.deck.length - 1);
        s.hand.push(bottom);
        log(
          s,
          "Command: the bottom card of the deck is added to the hand.",
          "good",
        );
      }
      return;
    case "scry":
      prepend(s, fx("dcCommandScry", { value: 10, player: p }));
      return;
    case "quest":
      state(s).blessedQuest = s.round;
      log(
        s,
        "Command: each character with Círdan's Blessing does not exhaust to commit to a quest this round.",
        "good",
      );
      return;
    case "progress":
      return pick(
        "Place 2 progress on a non-unique location",
        locations(s),
        (l) => [fx("locationProgress", { target: l.id, value: 2 })],
      );
    case "spyglass":
      return pick(
        "Put Spyglass into play attached to a hero",
        allHeroes(s),
        (u) => [fx("dcCommandSpyglass", { target: u.id, player: p })],
      );
    case "damage":
      return pick("Deal 2 damage to an enemy", enemies(s), (u) => [
        fx("dcCommandHit", { target: u.id, player: p }),
      ]);
    case "attachment": {
      const options: Option[] = readyable(s).map(({ host, a }) => ({
        id: a.id,
        code: a.code,
        label: `Ready ${card(a.code).name} on ${name(host)}`,
        effects: [
          fx("dcCommandAttachment", {
            target: host.id,
            source: a.id,
            player: p,
          }),
        ],
      }));
      if (options.length) choose(s, "Command · Ready an attachment", options);
      return;
    }
  }
}
