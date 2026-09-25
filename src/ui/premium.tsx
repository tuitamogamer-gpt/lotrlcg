import { Check, Sparkle } from "@phosphor-icons/react";
import type { ScenarioId } from "../game/types";
import { CardBack, TableToken } from "./tabletop";

export const PLAYMATS = {
  mirkwood: { name: "Mirkwood", detail: "The ancient woodland" },
  anduin: { name: "Anduin", detail: "A river of silver & mist" },
  "dol-guldur": { name: "Dol Guldur", detail: "In the shadow of the keep" },
} satisfies Record<ScenarioId, { name: string; detail: string }>;

export const PLAYMAT_CHOICES = [
  "adventure",
  "mirkwood",
  "anduin",
  "dol-guldur",
] as const;

export function TableCollection({
  selected,
  active,
  select,
}: {
  selected: (typeof PLAYMAT_CHOICES)[number];
  active: ScenarioId;
  select: (value: (typeof PLAYMAT_CHOICES)[number]) => void;
}) {
  return (
    <section className="table-collection" aria-labelledby="collection-title">
      <div className="collection-heading">
        <span>
          <Sparkle size={13} weight="duotone" /> THE COLLECTOR’S TABLE
        </span>
        <h3 id="collection-title">A place for your adventure.</h3>
        <p>Illustrated playmats, gilded card backs & tabletop tokens.</p>
      </div>
      <div className={`collection-preview mat-${active}`} aria-hidden="true">
        <div className="collection-preview-caption">
          <span>YOUR PLAYMAT</span>
          <strong>{PLAYMATS[active].name}</strong>
          <small>{PLAYMATS[active].detail}</small>
        </div>
        <div className="collection-objects">
          <CardBack />
          <CardBack encounter />
          <div className="collection-tokens">
            <TableToken kind="resource" value={3} />
            <TableToken kind="damage" value={2} />
            <TableToken kind="progress" value={5} />
          </div>
        </div>
      </div>
      <div
        className="playmat-options"
        role="group"
        aria-label="Playmat artwork"
      >
        {(Object.keys(PLAYMATS) as ScenarioId[]).map((id) => (
          <button
            key={id}
            aria-label={`${PLAYMATS[id].name} playmat`}
            aria-pressed={active === id}
            className={active === id ? "selected" : ""}
            onClick={() => select(id)}
          >
            <span className={`playmat-thumbnail mat-${id}`}>
              {active === id && <Check size={15} weight="bold" />}
            </span>
            <strong>{PLAYMATS[id].name}</strong>
          </button>
        ))}
      </div>
      <label className="playmat-follow">
        <input
          type="checkbox"
          checked={selected === "adventure"}
          onChange={(event) =>
            select(event.target.checked ? "adventure" : active)
          }
        />
        <span>
          <strong>Follow the adventure</strong>
          <small>Match the playmat to each quest automatically.</small>
        </span>
      </label>
      <div className="collection-materials" aria-label="Table accessories">
        <span>
          <i className="material-dot material-gold" /> Gold · Resources
        </span>
        <span>
          <i className="material-dot material-damage" /> Wounds · Damage
        </span>
        <span>
          <i className="material-dot material-jade" /> Jade · Progress
        </span>
      </div>
    </section>
  );
}
