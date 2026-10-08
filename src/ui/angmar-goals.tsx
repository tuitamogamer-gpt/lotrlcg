import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { stageInfo, stats } from "../game/engine";
import { allActiveLocations, allEngaged } from "../game/table";
import { gramQuestUnit, GRAM } from "../game/mount-gram-support";
import { WASTES } from "../game/wastes-eriador-support";
import { RHUDAUR } from "../game/rhudaur-support";
import { CARN } from "../game/carn-dum-support";
import { Shield, Check } from "@phosphor-icons/react";

export function AngmarQuestGoals({ s }: { s: GameState }) {
  const enemies = [...s.staging, ...allEngaged(s)];
  const goal = stageInfo(s).quest;
  const progress = (text = `Place ${goal} quest progress`) => (
    <span className={s.progress >= goal && goal > 0 ? "done" : ""}>
      {s.progress >= goal && goal > 0 ? (
        <Check size={12} />
      ) : (
        <Shield size={12} />
      )}
      {text}
    </span>
  );
  let goals;
  if (s.wastesEriador) {
    const leader = enemies.some((u) => u.code === WASTES.leader);
    goals = (
      <>
        {s.stage < 3 ? (
          progress()
        ) : (
          <>
            {progress("Reach 5 quest progress to damage Pack Leader")}
            <span className={leader ? "" : "done"}>
              Destroy Pack Leader to win
            </span>
            <span>Daybreak removes all progress from this stage</span>
          </>
        )}
        <span>Protect Amarthiúl</span>
      </>
    );
  } else if (s.mountGram) {
    if (s.stage === 2) {
      const quest = gramQuestUnit(s);
      const count = quest ? (s.mountGram.captured[quest.id]?.length ?? 0) : 0;
      goals = (
        <>
          <span>
            {count} dungeon captives remaining · Progress rescues prisoners
          </span>
          <span>
            Clear this dungeon, then join another area at the beginning of
            travel
          </span>
        </>
      );
    } else if (s.stage === 3) {
      const gate = [...s.staging, ...allActiveLocations(s)].some(
        (u) => u.code === GRAM.gate,
      );
      goals = (
        <>
          {progress("Place 16 quest progress to travel to Southern Gate")}
          <span className={gate ? "" : "done"}>
            Explore Southern Gate and complete the quest
          </span>
        </>
      );
    } else
      goals = (
        <span>
          Enter the separate dungeons and rescue your captured fellowship
        </span>
      );
  } else if (s.ettenmoors) {
    goals = (
      <>
        {progress()}
        {s.stage === 1 && (
          <span>Defeated side quests add their quest points to this stage</span>
        )}
        <span>Protect Amarthiúl · Seek active Safe locations</span>
      </>
    );
  } else if (s.rhudaur) {
    const boss = enemies.find((u) => u.code === RHUDAUR.thaurdir);
    goals =
      s.stage === 1 ? (
        <>
          <span>
            Time · {s.rhudaur.time} remaining · Defeat side quests and claim
            their Clues
          </span>
          <span>
            Advance when Time runs out or no Rhudaur side quests remain
          </span>
          <span>Protect Amarthiúl</span>
        </>
      ) : (
        <>
          {progress()}
          <span
            className={
              !boss || boss.damage >= stats(s, boss).health ? "done" : ""
            }
          >
            Reduce Thaurdir to 0 hit points
          </span>
          <span>
            Each attached Clue reduces this quest’s requirement by 5 · Protect
            Amarthiúl
          </span>
        </>
      );
  } else if (s.carnDum) {
    const boss = enemies.some((u) => u.code === CARN.thaurdir);
    goals =
      s.stage === 1 ? (
        <>
          {progress()}
          <span>Thaurdir cannot take damage on this stage</span>
          <span>Unresolved shadow cards remain on enemies</span>
        </>
      ) : (
        <>
          {progress(
            "Reach 15 quest progress to remove Thaurdir’s Indestructible",
          )}
          <span className={boss ? "" : "done"}>Defeat Thaurdir to win</span>
        </>
      );
  } else if (s.dreadRealm) {
    if (s.stage === 1) goals = progress("Place 18 quest progress");
    else if (s.stage === 2)
      goals = (
        <>
          <span>Damage Daechanar to remove Sorcery cards, then defeat him</span>
          <span>
            He is Indestructible while any Sorcery card remains in play
          </span>
        </>
      );
    else {
      const locations =
        s.staging.filter((u) => card(u.code).type_code === "location").length +
        allActiveLocations(s).length;
      goals = (
        <>
          <span>
            {locations} locations remaining · Divide quest progress among
            staging locations
          </span>
          <span>Clear every location to win at the end of the quest phase</span>
        </>
      );
    }
  } else return null;
  return (
    <div className="quest-goals" data-angmar-quest-goals>
      {goals}
    </div>
  );
}
