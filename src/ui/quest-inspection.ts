import type { Card, GameState } from "../game/types";
import { card } from "../game/cards";
import { GUNDABAD } from "../game/mount-gundabad-support";

export type InspectedCard = Card & { initialReverse?: boolean };

/**
 * Hidden Gundabad stage 2A stays on the shared front. A revealed Gundabad
 * quest opens on side B. Every other quest opens on side A.
 */
export function currentQuestInspection(
  s: GameState,
  printed: Card,
): InspectedCard {
  if (s.mountGundabad?.questFront && s.stage === 2) {
    // Every stage 2A has the same printed front. A fixed reference also avoids
    // identifying the selected reverse through its code or image filename.
    const visible = Object.fromEntries(
      Object.entries(card(GUNDABAD.upper)).filter(
        ([key]) => !key.startsWith("back_"),
      ),
    ) as unknown as Card;
    return { ...visible, initialReverse: false };
  }
  if (s.mountGundabad && !s.mountGundabad.questFront)
    return { ...printed, initialReverse: !!printed.back_imagesrc };
  return { ...printed };
}
