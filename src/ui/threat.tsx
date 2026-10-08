import { threatElimination } from "../game/tharbad-support";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Eye } from "@phosphor-icons/react";
import type { GameState } from "../game/types";
import { activeSeat } from "../game/table";
import "./threat.css";

const numeralMotion = {
  enter: (direction: number) => ({ y: direction * 28, opacity: 0 }),
  settled: { y: 0, opacity: 1 },
  leave: (direction: number) => ({ y: direction * -28, opacity: 0 }),
};

function ThreatWheel({
  steps,
  direction,
}: {
  steps: number;
  direction: number;
}) {
  const reduced = useReducedMotion();
  const digit = steps % 10;
  return (
    <div className="threat-disc" data-digit={digit}>
      <motion.svg
        className="threat-disc-ring"
        viewBox="0 0 100 100"
        initial={false}
        animate={{ rotate: -steps * 36 }}
        transition={{
          duration: reduced ? 0 : 0.75,
          ease: [0.22, 0.8, 0.24, 1],
        }}
      >
        <circle className="threat-disc-rim" cx="50" cy="50" r="47" />
        <circle className="threat-disc-inner" cx="50" cy="50" r="33" />
        {Array.from({ length: 10 }, (_, n) => (
          <g key={n} transform={`rotate(${n * 36} 50 50)`}>
            <path d="M50 4v4" />
            <text x="50" y="18" textAnchor="middle">
              {n}
            </text>
          </g>
        ))}
      </motion.svg>
      <span className="threat-disc-pointer" />
      <strong className="threat-disc-window">
        {reduced ? (
          <span>{digit}</span>
        ) : (
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.span
              key={digit}
              custom={direction}
              variants={numeralMotion}
              initial="enter"
              animate="settled"
              exit="leave"
              transition={{ duration: 0.38, ease: [0.22, 0.8, 0.24, 1] }}
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        )}
      </strong>
    </div>
  );
}

function ThreatDial({
  threat,
  elimination = 50,
}: {
  threat: number;
  elimination?: number;
}) {
  const reduced = useReducedMotion();
  const previous = useRef(threat);
  const [feedback, setFeedback] = useState({ amount: 0, serial: 0 });
  const direction =
    Math.sign(threat - previous.current) || Math.sign(feedback.amount) || 1;
  useEffect(() => {
    const amount = threat - previous.current;
    previous.current = threat;
    if (amount) setFeedback((f) => ({ amount, serial: f.serial + 1 }));
  }, [threat]);

  const remaining = Math.max(0, elimination - threat);
  const danger = remaining <= 10;
  const digits = String(threat).padStart(2, "0");
  const changeText = feedback.amount
    ? `Threat ${feedback.amount > 0 ? "increased" : "decreased"} by ${Math.abs(feedback.amount)}. Now ${threat}.`
    : "";

  return (
    <div
      className={`physical-threat illustrated-threat${danger ? " danger" : ""}${remaining <= 5 ? " critical" : ""}`}
      data-threat={threat}
    >
      <div
        role="meter"
        aria-label="Threat level"
        aria-valuenow={Math.min(elimination, threat)}
        aria-valuemin={0}
        aria-valuemax={elimination}
        aria-valuetext={`${threat} threat. ${remaining ? `${remaining} until elimination.` : "Threat elimination reached."}`}
      >
        <div className="threat-counter-heading">
          <Eye size={12} aria-hidden="true" /> THREAT LEVEL
        </div>
        <div className="threat-faceplate" aria-hidden="true">
          <span className="threat-eye-glow" />
          <span className="threat-embers">
            {Array.from({ length: 4 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${34 + i * 11}%`,
                  animationDelay: `${i * -0.8}s`,
                }}
              />
            ))}
          </span>
          <div className="threat-discs">
            {Array.from(digits, (_, i) => (
              <ThreatWheel
                key={digits.length - i}
                steps={Math.floor(threat / 10 ** (digits.length - i - 1))}
                direction={direction}
              />
            ))}
          </div>
          {feedback.amount !== 0 && !reduced && (
            <motion.span
              key={feedback.serial}
              className={`threat-feedback ${feedback.amount > 0 ? "threat-rises" : "threat-falls"}`}
              initial={false}
              animate={{
                opacity: [0, 1, 1, 0],
                y: [3, 0, 0, -6],
              }}
              transition={{ duration: 2, times: [0, 0.1, 0.8, 1] }}
            >
              {feedback.amount > 0 ? "+" : "−"}
              {Math.abs(feedback.amount)}
            </motion.span>
          )}
          {!!feedback.amount && !reduced && (
            <motion.span
              key={`wash-${feedback.serial}`}
              className={`threat-change-wash ${feedback.amount < 0 ? "threat-relief" : ""}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.65, 0] }}
              transition={{ duration: 1, times: [0, 0.2, 1] }}
            />
          )}
        </div>
      </div>
      <div className="threat-counter-caption">
        <span>
          {remaining ? `Eliminated at ${elimination}` : "Elimination reached"}
        </span>
        <b>{remaining > 0 ? `${remaining} away` : `${elimination}+`}</b>
      </div>
      <span
        className="threat-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {changeText}
      </span>
    </div>
  );
}

// A different seat or adventure has its own physical counter. Remounting avoids
// inventing a threat increase/decrease when merely looking at another player.
export function ThreatCounter({ s }: { s: GameState }) {
  return (
    <ThreatDial
      elimination={threatElimination(s)}
      key={`${s.originalSeed}:${s.scenarioId}:${activeSeat(s)}`}
      threat={s.threat}
    />
  );
}
