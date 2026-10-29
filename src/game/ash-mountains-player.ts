import type { Effect, GameState, Option, Unit } from "./types";
import { playTargets } from "./actions";
import { card, name, playerCards } from "./cards";
import {
  canGainResources,
  cannotReady,
  choose,
  draw,
  fx,
  get,
  globalUnits,
  make,
  prepend,
  restrictAttachments,
  requireRule,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  damage,
  discardAttachment,
  discardHandCard,
  raiseThreat,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatView,
} from "./table";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { rhosgobelHealingAllowed } from "./rhosgobel";
import {
  shadowEastAttachmentImmune,
  shadowEastRing,
} from "./shadow-east-player-support";
import { isSacked } from "./carrock";
import { engagedEnemies } from "./considered-engagement";
import { batch4Scenario } from "./batch4-scenarios";
import { reduceThreat, threatReductionBlocked } from "./threat-reduction";
import { gondorResourcesGained } from "./gondor-player-cards";
import { canLeaveHand } from "./hand-rules";
export const ASH_PLAYER = {
  exile: "22082",
  stone: "22084",
  preserved: "22085",
  bowmaster: "22086",
  reckless: "22087",
  odo: "22088",
  defiant: "22089",
  council: "22091",
  helm: "22090",
} as const;
const P = ASH_PLAYER;
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const active = (u: Unit) => !u.blanked && !isSacked(u);
const affected = (s: GameState, u: Unit, code: string) =>
  !playerEffectImmune(s, u, code);
const readyable = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !batch4Scenario(s).cannotPlayerReadyCharacter?.(s, u) &&
  affected(s, u, code);
const discardable = (s: GameState) =>
  s.hand.filter(
    (u) =>
      canLeaveHand(u) && !batch4Scenario(s).cannotDiscardHand?.(s, u, true),
  );
const contract = (s: GameState, p = activeSeat(s)) =>
  s.ashPlayers?.contracts.find((c) => c.player === p);
const mark = (id: string) => `round:ash-council:${id}`;
export function councilDeckProblems(cards: Record<string, number>) {
  if (!cards[P.council]) return [];
  const titles = new Map<string, number>();
  for (const [code, n] of Object.entries(cards))
    if (n > 0)
      titles.set(card(code).name, (titles.get(card(code).name) ?? 0) + n);
  return [...titles]
    .filter(([, n]) => n > 1)
    .map(
      ([title]) => `Council of the Wise allows only one card titled ${title}.`,
    );
}
export function councilSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      if (!s.deck.includes(P.council)) return;
      const counts: Record<string, number> = {};
      for (const code of s.deck) counts[code] = (counts[code] ?? 0) + 1;
      requireRule(
        !councilDeckProblems(counts).length,
        "Council of the Wise requires one card per title.",
      );
      s.deck = s.deck.filter((c) => c !== P.council);
      const unit = make(s, P.council);
      unit.owner = player;
      (s.ashPlayers ??= { contracts: [] }).contracts.push({ player, unit });
    });
}
export function ashPlayerEliminated(s: GameState, p: number) {
  for (const c of s.ashPlayers?.contracts.filter((c) => c.player === p) ?? [])
    forOwner(s, p, () => s.removed.push(c.unit.code));
  if (s.ashPlayers)
    s.ashPlayers.contracts = s.ashPlayers.contracts.filter(
      (c) => c.player !== p,
    );
}
export function validateAshPlayers(
  s: GameState,
  unit: (v: unknown) => boolean,
) {
  const q = s.ashPlayers;
  if (q === undefined) return true;
  return (
    !!q &&
    (q.returnedHeroes === undefined ||
      (Array.isArray(q.returnedHeroes) &&
        q.returnedHeroes.every(
          (u) =>
            unit(u) &&
            card(u.code).type_code === "hero" &&
            u.attachments.length === 0,
        ))) &&
    Array.isArray(q.contracts) &&
    q.contracts.every(
      (c) =>
        !!c &&
        seatIndices(s).includes(c.player) &&
        unit(c.unit) &&
        c.unit.code === P.council &&
        (c.unit.owner ?? c.player) === c.player,
    ) &&
    new Set(q.contracts.map((c) => c.player)).size === q.contracts.length
  );
}
export const councilPublic = (s: GameState) =>
  s.ashPlayers?.contracts.map((c) => ({
    player: c.player,
    id: c.unit.id,
    code: c.unit.code,
    used: ["threat", "draw", "resource"].filter((o) =>
      seatView(s, c.player).used.includes(mark(o)),
    ),
  }));
/** Collection swaps retain orientation and attachments, but no tokens (designer rulings 3.367/3.391). */
export function helmCollection(s: GameState, u: Unit) {
  const others = globalUnits(s).filter((x) => x.id !== u.id);
  return playerCards.filter(
    (c) =>
      c.type_code === "hero" &&
      c.code !== u.code &&
      !["fellowship", "baggins"].includes(c.sphere_code) &&
      Number(c.threat) <= Number(card(u.code).threat) &&
      !others.some((x) => card(x.code).name === c.name),
  );
}
const helmTargets = (s: GameState) =>
  s.heroes.filter(
    (u) =>
      affected(s, u, P.helm) &&
      !batch4Scenario(s).cannotLeave?.(s, u) &&
      helmCollection(s, u).length,
  );
function helmSwap(s: GameState, u: Unit, code: string) {
  if (
    !helmTargets(s).some((h) => h.id === u.id) ||
    !helmCollection(s, u).some((c) => c.code === code)
  )
    return;
  const state = (s.ashPlayers ??= { contracts: [] }),
    returned = (state.returnedHeroes ??= []),
    prior = returned.find((h) => h.code === code);
  const replacement = make(s, code);
  if (prior) {
    replacement.id = prior.id;
    returned.splice(returned.indexOf(prior), 1);
  }
  replacement.owner = u.owner ?? activeSeat(s);
  replacement.exhausted = u.exhausted;
  replacement.committed = u.committed;
  replacement.attachments = u.attachments.splice(0);
  u.damage = 0;
  u.resources = 0;
  u.progress = 0;
  u.committed = false;
  s.heroes[s.heroes.indexOf(u)] = replacement;
  s.committedIds = s.committedIds.map((id) =>
    id === u.id ? replacement.id : id,
  );
  // Evaluate restrictions with all transferred trait/resource grants in place.
  for (const a of [...replacement.attachments]) {
    if (card(a.code).sphere_code === "encounter") continue;
    replacement.attachments = replacement.attachments.filter(
      (x) => x.id !== a.id,
    );
    const legal =
      !shadowEastAttachmentImmune(a, P.helm) &&
      playTargets(
        s,
        { ...replacement, id: a.id, code: a.code, owner: a.owner },
        { putIntoPlay: true },
      ).some((h) => h.id === replacement.id);
    replacement.attachments.push(a);
    if (!legal) discardAttachment(s, replacement, a, true);
  }
  if (
    s.shadowEastPlayers?.ring?.heroId === u.id &&
    replacement.attachments.some((a) => a.id === s.shadowEastPlayers!.ring!.id)
  )
    s.shadowEastPlayers.ring.heroId = replacement.id;
  returned.push(u);
  restrictAttachments(s, replacement);
}
export function ashPlayerTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.preserved)
    return allHeroes(s).filter(
      (h) =>
        h.attachments.some((a) => a.code === "21001") &&
        !h.attachments.some((a) => a.code === code),
    );
}
export function ashPlayerPlayProblem(
  s: GameState,
  code: string,
  origin: string,
) {
  if (code === P.helm && !helmTargets(s).length)
    return "No controlled hero can be swapped with an eligible hero from your collection.";
  if (code === P.bowmaster && origin === "hand" && !engagedEnemies(s).length)
    return "Northern Bowmaster needs an enemy engaged with you to be played from hand.";
  if (
    code === P.reckless &&
    !playerOrder(s).some((p) =>
      engagedEnemies(s, p).some((u) => affected(s, u, code)),
    )
  )
    return "No player has an eligible engaged enemy.";
  if (
    code === P.defiant &&
    !allCharacters(s).some((u) => readyable(s, u, code))
  )
    return "No controlled character can ready.";
  return null;
}
export function ashPlayerEvent(s: GameState, code: string) {
  if (code === P.helm) {
    choose(
      s,
      "Helm of Secrecy · Choose a hero you control",
      helmTargets(s).map((u) =>
        option(u, [
          fx("ashPlayerHelmChoose", { target: u.id, player: activeSeat(s) }),
        ]),
      ),
    );
    return true;
  }
  if (![P.reckless, P.defiant].includes(code as typeof P.reckless))
    return false;
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx(code === P.reckless ? "ashPlayerReckless" : "ashPlayerDefiant", {
        player,
      }),
    ),
  );
  return true;
}
export function ashPlayerCommitted(s: GameState, units: Unit[]) {
  prepend(
    s,
    ...units
      .filter((u) => u.code === P.exile && active(u))
      .map((u) =>
        fx("ashPlayerExile", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function ashPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code === P.odo && active(u))
    prepend(s, fx("ashPlayerOdo", { source: u.id, player: ownerOf(s, u) }));
}
export function ashPlayerEventFinished(
  s: GameState,
  u: Unit,
  p: number,
  fromHand: boolean,
) {
  const c = contract(s, p);
  if (c && fromHand && s.status === "playing")
    prepend(
      s,
      fx("ashPlayerCouncil", { source: c.unit.id, code: u.code, player: p }),
    );
}
export function ashPlayerRoundBegin(s: GameState): Effect[] {
  return allHeroes(s).flatMap((h) =>
    h.attachments
      .filter((a) => a.code === P.preserved && !a.blanked && !a.facedown)
      .map((a) =>
        fx("ashPlayerPreserved", {
          target: h.id,
          source: a.id,
          player: attachmentController(s, h, a) ?? ownerOf(s, h),
        }),
      ),
  );
}
export function ashPlayerResourceDraw(s: GameState, p: number) {
  return allHeroes(s).reduce(
    (n, h) =>
      n +
      h.attachments.filter(
        (a) =>
          a.code === P.stone &&
          !a.blanked &&
          !a.facedown &&
          attachmentController(s, h, a) === p,
      ).length,
    0,
  );
}
export function ashPlayerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("ashPlayer")) return false;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "ashPlayerHelmChoose":
      if (u && helmTargets(s).some((h) => h.id === u.id)) {
        u.damage = 0;
        u.resources = 0;
        u.progress = 0;
        choose(
          s,
          "Helm of Secrecy · Choose a different hero from your collection",
          helmCollection(s, u).map((c) => ({
            id: c.code,
            code: c.code,
            label: c.name,
            effects: [
              fx("ashPlayerHelmSwap", {
                target: u.id,
                code: c.code,
                player: p,
              }),
            ],
          })),
        );
      }
      break;
    case "ashPlayerHelmSwap":
      if (u && e.code) helmSwap(s, u, e.code);
      break;
    case "ashPlayerExile":
      if (u && active(u) && readyable(s, u, P.exile) && discardable(s).length)
        choosePlayerResponse(
          s,
          u.id,
          P.exile,
          "Wandering Exile · Discard a card to ready",
          [
            ...discardable(s).map((c) =>
              option(c, [
                fx("ashPlayerExilePay", {
                  target: u.id,
                  source: c.id,
                  player: p,
                }),
              ]),
            ),
            skip,
          ],
        );
      break;
    case "ashPlayerExilePay":
      if (u && active(u) && discardable(s).some((c) => c.id === e.source)) {
        discardHandCard(s, e.source!);
        prepend(
          s,
          fx("ashPlayerReady", { target: u.id, code: P.exile, player: p }),
        );
      }
      break;
    case "ashPlayerReady":
      if (u && readyable(s, u, e.code ?? P.defiant)) readyCharacter(s, u);
      break;
    case "ashPlayerReckless": {
      const targets = engagedEnemies(s, p).filter((u) =>
        affected(s, u, P.reckless),
      );
      if (targets.length)
        choose(
          s,
          "Reckless Attack · Deal 2 damage to an engaged enemy",
          targets.map((u) =>
            option(u, [fx("ashPlayerDamage", { target: u.id, player: p })]),
          ),
        );
      break;
    }
    case "ashPlayerDamage":
      if (
        u &&
        engagedEnemies(s, p).some((x) => x.id === u.id) &&
        affected(s, u, P.reckless)
      )
        damage(s, u.id, 2);
      break;
    case "ashPlayerDefiant": {
      const targets = [...s.heroes, ...s.allies].filter((u) =>
        readyable(s, u, P.defiant),
      );
      if (targets.length)
        choose(s, "Defiant Challenge · Ready a character you control", [
          ...targets.map((u) =>
            option(u, [
              fx("ashPlayerReady", {
                target: u.id,
                code: P.defiant,
                player: p,
              }),
            ]),
          ),
          { id: "skip", label: "Do not ready a character", effects: [] },
        ]);
      break;
    }
    case "ashPlayerOdo":
      if (source && active(source) && s.deck.length)
        choosePlayerResponse(
          s,
          source.id,
          P.odo,
          "Odo Proudfoot · Search the top 5 cards",
          [
            {
              id: "search",
              label: "Search for a Hobbit ally",
              effects: [
                fx("ashPlayerOdoSearch", { source: source.id, player: p }),
              ],
            },
            skip,
          ],
        );
      break;
    case "ashPlayerOdoSearch": {
      const options = s.deck.slice(0, 5).flatMap((code, i) =>
        card(code).type_code === "ally" &&
        /\bHobbit\b/.test(card(code).traits ?? "")
          ? [
              {
                id: String(i),
                code,
                label: card(code).name,
                effects: [
                  fx("ashPlayerOdoTake", { value: i, code, player: p }),
                ],
              },
            ]
          : [],
      );
      choose(s, "Odo Proudfoot · Choose a Hobbit ally", [
        ...options,
        {
          id: "skip",
          label: "Find no ally · Shuffle",
          effects: [fx("ashPlayerShuffle", { player: p })],
        },
      ]);
      break;
    }
    case "ashPlayerOdoTake":
      if (e.value !== undefined && e.value < 5 && s.deck[e.value] === e.code) {
        s.hand.push(takePlayerDeck(s, e.value));
        shuffle(s, s.deck);
      }
      break;
    case "ashPlayerShuffle":
      shuffle(s, s.deck);
      break;
    case "ashPlayerPreserved": {
      const a = u?.attachments.find((a) => a.id === e.source),
        ring = shadowEastRing(s);
      if (
        u &&
        a &&
        !a.blanked &&
        u.damage &&
        ring?.host.id === u.id &&
        ring.player === p &&
        !ring.attachment.exhausted &&
        !ring.attachment.blanked &&
        rhosgobelHealingAllowed(s, u) &&
        affected(s, u, P.preserved)
      )
        choosePlayerResponse(
          s,
          a.id,
          P.preserved,
          "Well Preserved · Heal your Ring-bearer",
          [
            {
              id: "heal",
              label: "Exhaust The One Ring · Raise threat 1 · Heal all damage",
              effects: [
                fx("ashPlayerPreservedPay", {
                  target: u.id,
                  source: a.id,
                  player: p,
                }),
              ],
            },
            skip,
          ],
        );
      break;
    }
    case "ashPlayerPreservedPay": {
      const a = u?.attachments.find((a) => a.id === e.source),
        ring = shadowEastRing(s);
      if (
        u &&
        a &&
        !a.blanked &&
        ring?.host.id === u.id &&
        ring.player === p &&
        !ring.attachment.exhausted &&
        !ring.attachment.blanked
      ) {
        ring.attachment.exhausted = true;
        raiseThreat(s, 1, "cost");
        prepend(s, fx("ashPlayerHeal", { target: u.id, player: p }));
      }
      break;
    }
    case "ashPlayerHeal":
      if (u && rhosgobelHealingAllowed(s, u) && affected(s, u, P.preserved))
        u.damage = 0;
      break;
    case "ashPlayerCouncil": {
      const c = contract(s, p);
      if (!c || c.unit.id !== e.source) break;
      const choices: Option[] = [];
      if (
        !s.used.includes(mark("threat")) &&
        s.threat > 0 &&
        !threatReductionBlocked(s)
      )
        choices.push({
          id: "threat",
          label: "Reduce your threat by 1",
          effects: [
            fx("ashPlayerCouncilTake", {
              text: "threat",
              source: c.unit.id,
              player: p,
            }),
          ],
        });
      if (!s.used.includes(mark("draw")) && s.deck.length)
        choices.push({
          id: "draw",
          label: "Draw 1 card",
          effects: [
            fx("ashPlayerCouncilTake", {
              text: "draw",
              source: c.unit.id,
              player: p,
            }),
          ],
        });
      if (
        !s.used.includes(mark("resource")) &&
        s.heroes.some(
          (h) => canGainResources(s, h) && affected(s, h, P.council),
        )
      )
        choices.push({
          id: "resource",
          label: "Add 1 resource to one of your heroes",
          effects: [
            fx("ashPlayerCouncilTake", {
              text: "resource",
              source: c.unit.id,
              player: p,
            }),
          ],
        });
      if (choices.length)
        choosePlayerResponse(
          s,
          c.unit.id,
          P.council,
          "Council of the Wise · Choose an unused reward",
          [...choices, skip],
        );
      break;
    }
    case "ashPlayerCouncilTake": {
      const c = contract(s, p);
      if (
        !c ||
        c.unit.id !== e.source ||
        !["threat", "draw", "resource"].includes(e.text!) ||
        s.used.includes(mark(e.text!))
      )
        break;
      s.used.push(mark(e.text!));
      if (e.text === "threat")
        reduceThreat(s, 1, { id: c.unit.id, code: P.council, owner: p });
      if (e.text === "draw") draw(s, 1);
      if (e.text === "resource")
        choose(
          s,
          "Council of the Wise · Choose your hero",
          s.heroes
            .filter((h) => canGainResources(s, h) && affected(s, h, P.council))
            .map((h) =>
              option(h, [
                fx("ashPlayerCouncilResource", { target: h.id, player: p }),
              ]),
            ),
        );
      break;
    }
    case "ashPlayerCouncilResource":
      if (
        u &&
        s.heroes.some((h) => h.id === u.id) &&
        canGainResources(s, u) &&
        affected(s, u, P.council)
      ) {
        u.resources++;
        gondorResourcesGained(s, u, 1, true);
      }
      break;
  }
  return true;
}
