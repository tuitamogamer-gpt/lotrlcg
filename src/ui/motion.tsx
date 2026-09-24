import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";

export const tableSpring = {
  type: "spring",
  stiffness: 280,
  damping: 29,
  mass: 0.85,
} as const;

export function CardPresence({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return reduced ? (
    <>{children}</>
  ) : (
    <AnimatePresence mode="popLayout">{children}</AnimatePresence>
  );
}

// These transitions only present an already committed rules state. No game action
// is dispatched from an animation callback, including when motion is disabled.
export const MovingCard = forwardRef<
  HTMLDivElement,
  {
    id: string;
    className: string;
    children: ReactNode;
    order?: number;
  }
>(({ id, className, children, order = 0 }, ref) => {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.div
      ref={ref}
      layout={reduced ? false : "position"}
      layoutId={reduced ? undefined : `card-${id}`}
      data-motion-card={id}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 22, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -14, scale: reduced ? 1 : 0.94 }}
      transition={
        reduced
          ? { duration: 0 }
          : {
              ...tableSpring,
              opacity: { duration: 0.22 },
              delay: Math.min(order, 6) * 0.045,
              layout: tableSpring,
            }
      }
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {children}
    </motion.div>
  );
});
MovingCard.displayName = "MovingCard";

export function AnimatedNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const previous = useRef(value);
  const direction = value >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = value;
  }, [value]);
  if (reduced) return <span className="animated-number">{value}</span>;
  return (
    <span className="animated-number" aria-label={String(value)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          aria-hidden="true"
          initial={{ y: reduced ? 0 : direction * 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: reduced ? 0 : -direction * 12, opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.26, ease: "easeOut" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function CountChange({ value }: { value: number }) {
  const previous = useRef(value);
  const [change, setChange] = useState<{
    amount: number;
    serial: number;
  } | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const amount = value - previous.current;
    previous.current = value;
    if (amount) setChange((c) => ({ amount, serial: (c?.serial ?? 0) + 1 }));
  }, [value]);
  return change && !reduced ? (
    <motion.i
      key={change.serial}
      className={`count-change ${change.amount > 0 ? "count-up" : "count-down"}`}
      aria-hidden="true"
      initial={{ opacity: 0, y: 0, scale: 0.8 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [0, -12, -20, -30],
        scale: [0.8, 1.08, 1, 1],
      }}
      transition={{ duration: 1.15, times: [0, 0.15, 0.65, 1] }}
    >
      {change.amount > 0 ? "+" : ""}
      {change.amount}
    </motion.i>
  ) : null;
}

export function useDamageFeedback(damage: number) {
  const ref = useRef<HTMLButtonElement>(null);
  const previous = useRef(damage);
  const reduced = useReducedMotion();
  useEffect(() => {
    const tookDamage = damage > previous.current;
    previous.current = damage;
    if (!tookDamage || reduced) return;
    const animation = ref.current?.animate(
      [
        { boxShadow: "0 0 0 0 #b84a3299" },
        { boxShadow: "0 0 0 4px #cf684aaa, 0 0 24px #c85b4266", offset: 0.25 },
        { boxShadow: "0 0 0 10px #b84a3200" },
      ],
      { duration: 650, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [damage, reduced]);
  return ref;
}
