import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Crown,
  Eye,
  Heart,
  Shield,
  Sword,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { card, imageUrl, name, plain } from "../game/cards";
import { stats } from "../game/engine";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  ownerOf,
  seatName,
} from "../game/table";
import type { Action, Card, GameState, Unit } from "../game/types";

export function DecisionDialog({
  title,
  description,
  children,
  footer,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    heading.current?.focus();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    ref.current?.querySelector(".decision-body")?.scrollTo(0, 0);
  }, [title]);
  return (
    <dialog
      ref={ref}
      className="decision-dialog"
      aria-labelledby={id}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onKeyDown={(e) => {
        if (e.repeat && ["Enter", " "].includes(e.key)) e.preventDefault();
      }}
    >
      <header className="decision-header">
        <div>
          <h2 ref={heading} tabIndex={-1} id={id}>
            {title}
          </h2>
          {description && <p id={`${id}-description`}>{description}</p>}
        </div>
        {onClose && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={22} />
          </button>
        )}
      </header>
      <div className="decision-body">{children}</div>
      {footer && <footer className="decision-footer">{footer}</footer>}
    </dialog>
  );
}

export function DecisionCard({
  c,
  label = c.name,
  detail,
  selected,
  onSelect,
  inspect,
  children,
  unitId,
}: {
  c: Card;
  unitId?: string;
  label?: string;
  detail?: string;
  selected?: boolean;
  onSelect?: () => void;
  inspect: (c: Card) => void;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const descriptionId = useId();
  return (
    <div
      data-unit-id={unitId}
      className={`decision-card ${selected ? "is-selected" : ""}`}
    >
      <button
        className="decision-select"
        aria-label={label}
        aria-describedby={detail || children ? descriptionId : undefined}
        aria-pressed={onSelect ? selected : undefined}
        onClick={(e) => {
          if (e.detail < 2) (onSelect ?? (() => inspect(c)))();
        }}
      >
        <span className="decision-face">
          {failed ? (
            <span className="decision-art-fallback">
              <Shield size={32} />
              {c.name}
            </span>
          ) : (
            <img
              src={imageUrl(c)}
              alt={c.name}
              width={424}
              height={600}
              onError={() => setFailed(true)}
            />
          )}
          {selected && (
            <span className="decision-check">
              <Check size={15} weight="bold" /> Selected
            </span>
          )}
        </span>
        <strong>{label}</strong>
        {(detail || children) && (
          <span className="decision-card-details" id={descriptionId}>
            {detail && <small>{detail}</small>}
            {children}
          </span>
        )}
      </button>
      <button
        className="decision-inspect"
        onClick={() => inspect(c)}
        title={`Inspect ${c.name}`}
      >
        <Eye size={15} /> Open full card
      </button>
    </div>
  );
}

export function DecisionStats({ s, u }: { s: GameState; u: Unit }) {
  const st = stats(s, u);
  return (
    <span className="decision-stats">
      <span title="Attack">
        <Sword size={15} />
        <span>
          {st.attack}
          <small>ATK</small>
        </span>
      </span>
      <span title="Defense">
        <Shield size={15} />
        <span>
          {st.defense}
          <small>DEF</small>
        </span>
      </span>
      <span title="Remaining hit points">
        <Heart size={15} />
        <span>
          {Math.max(0, st.health - u.damage)}
          <small>HP</small>
        </span>
      </span>
    </span>
  );
}

export function ChoiceDialog({
  s,
  choose,
  inspect,
}: {
  s: GameState;
  choose: (id: string) => void;
  inspect: (c: Card) => void;
}) {
  const choice = s.choice!;
  const cards = choice.options.filter((o) => o.code);
  const other = choice.options.filter((o) => !o.code);
  return (
    <DecisionDialog
      title={choice.title}
      description={plain(choice.description) || "Choose an option to continue."}
      footer={
        <span className="decision-hint">
          {cards.length
            ? "Choose a card to continue. Open full card to read its text first."
            : "Choose an option to continue."}
        </span>
      }
    >
      {s.table && (
        <p className="decision-owner">
          <Crown size={16} /> {seatName(s, activeSeat(s))}’s decision
        </p>
      )}
      {!!cards.length && (
        <div className="decision-grid choice-list">
          {cards.map((o) => {
            const unit = allCharacters(s).find((u) => u.id === o.id);
            return (
              <DecisionCard
                key={o.id}
                c={card(o.code!)}
                label={o.label}
                detail={o.detail}
                onSelect={() => choose(o.id)}
                inspect={inspect}
              >
                {unit && <DecisionStats s={s} u={unit} />}
              </DecisionCard>
            );
          })}
        </div>
      )}
      {!!other.length && (
        <div className="decision-options choice-list">
          {other.map((o) => (
            <button
              key={o.id}
              className="decision-select"
              onClick={(e) => {
                if (e.detail < 2) choose(o.id);
              }}
            >
              <span>
                {o.label}
                {o.detail && <small>{o.detail}</small>}
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      )}
    </DecisionDialog>
  );
}

export function CombatDialog({
  s,
  enemy,
  dispatch,
  inspect,
  onClose,
}: {
  s: GameState;
  enemy: Unit;
  dispatch: (action: Action) => boolean | undefined;
  inspect: (c: Card) => void;
  onClose: () => void;
}) {
  const defending = s.phase === "defense";
  const [selected, setSelected] = useState<string[]>([]);
  const [undefended, setUndefended] = useState(false);
  const candidates = defending ? defendersFor(s) : attackersFor(s, enemy);
  const picked = candidates.filter((u) => selected.includes(u.id));
  const total = picked.reduce(
    (sum, u) => sum + stats(s, u)[defending ? "defense" : "attack"],
    0,
  );
  const ownAttacker = picked.some((u) => ownerOf(s, u) === activeSeat(s));
  const invalidGroup =
    defending &&
    picked.length > 1 &&
    picked.some((u) => ownerOf(s, u) !== activeSeat(s));
  const canConfirm = defending
    ? (undefended || picked.length > 0) && !invalidGroup
    : ownAttacker;
  const choose = (id: string) => {
    setUndefended(false);
    setSelected((old) =>
      defending && !s.standTogether
        ? [id]
        : old.includes(id)
          ? old.filter((x) => x !== id)
          : [...old, id],
    );
  };
  const confirm = () => {
    const ok = dispatch(
      defending
        ? {
            type: "DEFEND",
            enemyId: enemy.id,
            defenderId: selected[0] ?? null,
            defenderIds: s.standTogether ? selected : undefined,
          }
        : { type: "ATTACK", enemyId: enemy.id, attackerIds: selected },
    );
    if (ok) onClose();
  };
  return (
    <DecisionDialog
      title={defending ? "Choose your defender" : "Choose your attackers"}
      description={
        defending
          ? s.standTogether
            ? "Stand Together: select ready defenders, then confirm."
            : "Select one ready character to stand against this enemy."
          : "Select ready characters to combine their attack, then confirm."
      }
      onClose={onClose}
      footer={
        <>
          <div className="decision-summary" aria-live="polite">
            <strong>
              {undefended
                ? "Undefended attack"
                : picked.length
                  ? `${picked.map(name).join(" + ")} · ${total} ${defending ? "defense" : "attack"}`
                  : "No character selected"}
            </strong>
            <small>
              {invalidGroup
                ? "Stand Together requires defenders from your own fellowship."
                : !defending && picked.length && !ownAttacker
                  ? "Include at least one attacker from your own fellowship."
                  : defending
                    ? "Shadow effects resolve after you confirm and may change the damage."
                    : "Card abilities and responses resolve before damage is dealt."}
            </small>
          </div>
          <div className="decision-actions">
            <button className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={!canConfirm}
              onClick={confirm}
            >
              {defending ? "Resolve enemy attack" : `Attack · ${total} power`}
              <Sword size={18} />
            </button>
          </div>
        </>
      }
    >
      <div className="combat-selection">
        <aside className="combat-enemy">
          <h3>{defending ? "Attacking enemy" : "Your target"}</h3>
          <DecisionCard c={card(enemy.code)} inspect={inspect}>
            <DecisionStats s={s} u={enemy} />
          </DecisionCard>
          {defending && (
            <p>
              <Shield size={15} /> {enemy.shadows.length} facedown shadow{" "}
              {enemy.shadows.length === 1 ? "card" : "cards"}
            </p>
          )}
        </aside>
        <section className="combat-company">
          <h3>
            {defending ? "Ready defenders" : "Ready attackers"}
            <span>{candidates.length} available</span>
          </h3>
          <div className="decision-grid choice-list">
            {candidates.map((u) => (
              <DecisionCard
                key={u.id}
                c={card(u.code)}
                selected={selected.includes(u.id)}
                onSelect={() => choose(u.id)}
                inspect={inspect}
                detail={
                  s.table
                    ? `${seatName(s, ownerOf(s, u))}’s fellowship`
                    : undefined
                }
              >
                <DecisionStats s={s} u={u} />
              </DecisionCard>
            ))}
          </div>
          {!candidates.length && (
            <p className="decision-empty">
              No ready characters are available to{" "}
              {defending ? "defend" : "attack"}.
            </p>
          )}
          {defending && (
            <button
              className={`undefended ${undefended ? "selected" : ""}`}
              aria-pressed={undefended}
              onClick={() => {
                setSelected([]);
                setUndefended(true);
              }}
            >
              <WarningCircle size={22} />
              <span>
                <strong>Leave undefended</strong>
                <small>
                  All attack damage goes to one hero. Its defense does not
                  count.
                </small>
              </span>
              {undefended && <Check size={19} />}
            </button>
          )}
        </section>
      </div>
    </DecisionDialog>
  );
}
