import { Composition } from "remotion";
import {
  SIGNIFICANT_MOMENT_FPS,
  SIGNIFICANT_MOMENT_FRAMES,
  SIGNIFICANT_MOMENT_HEIGHT,
  SIGNIFICANT_MOMENT_WIDTH,
  SignificantMomentComposition,
} from "../../src/ui/SignificantMomentVisual";

/** Each event has its own editable timeline and shares the game's visual source. */
export function SignificantMomentRoot() {
  return (
    <>
      <Composition
        id="QuestStage"
        component={SignificantMomentComposition}
        durationInFrames={SIGNIFICANT_MOMENT_FRAMES}
        fps={SIGNIFICANT_MOMENT_FPS}
        width={SIGNIFICANT_MOMENT_WIDTH}
        height={SIGNIFICANT_MOMENT_HEIGHT}
        defaultProps={{ kind: "stage" as const, title: "A new chapter" }}
      />
      <Composition
        id="SideQuestComplete"
        component={SignificantMomentComposition}
        durationInFrames={SIGNIFICANT_MOMENT_FRAMES}
        fps={SIGNIFICANT_MOMENT_FPS}
        width={SIGNIFICANT_MOMENT_WIDTH}
        height={SIGNIFICANT_MOMENT_HEIGHT}
        defaultProps={{ kind: "side-quest" as const, title: "Quest complete" }}
      />
      <Composition
        id="HeroFall"
        component={SignificantMomentComposition}
        durationInFrames={SIGNIFICANT_MOMENT_FRAMES}
        fps={SIGNIFICANT_MOMENT_FPS}
        width={SIGNIFICANT_MOMENT_WIDTH}
        height={SIGNIFICANT_MOMENT_HEIGHT}
        defaultProps={{
          kind: "hero-fall" as const,
          title: "A hero has fallen",
        }}
      />
      <Composition
        id="Victory"
        component={SignificantMomentComposition}
        durationInFrames={SIGNIFICANT_MOMENT_FRAMES}
        fps={SIGNIFICANT_MOMENT_FPS}
        width={SIGNIFICANT_MOMENT_WIDTH}
        height={SIGNIFICANT_MOMENT_HEIGHT}
        defaultProps={{ kind: "victory" as const, title: "Victory" }}
      />
      <Composition
        id="Defeat"
        component={SignificantMomentComposition}
        durationInFrames={SIGNIFICANT_MOMENT_FRAMES}
        fps={SIGNIFICANT_MOMENT_FPS}
        width={SIGNIFICANT_MOMENT_WIDTH}
        height={SIGNIFICANT_MOMENT_HEIGHT}
        defaultProps={{
          kind: "defeat" as const,
          title: "The fellowship falls",
        }}
      />
    </>
  );
}
