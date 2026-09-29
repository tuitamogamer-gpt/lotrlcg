import { useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Compass,
  Sparkle,
} from "@phosphor-icons/react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

const motes = Array.from(
  { length: 12 },
  (_, i) =>
    ({
      left: `${35 + ((i * 17) % 62)}%`,
      top: `${16 + ((i * 23) % 65)}%`,
      "--drift-delay": `${-i * 1.7}s`,
      "--drift-duration": `${7 + (i % 4) * 2}s`,
    }) as CSSProperties,
);

export function LandingHero({
  savedJourney,
  onResume,
  onLearn,
}: {
  savedJourney?: string;
  onResume: () => void;
  onLearn: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const inView = useInView(ref);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const landscapeY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const mistY = useTransform(scrollYProgress, [0, 1], [0, -65]);
  const foregroundY = useTransform(scrollYProgress, [0, 1], [0, -95]);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 48, damping: 24 });
  const y = useSpring(pointerY, { stiffness: 48, damping: 24 });
  const foregroundX = useTransform(x, (value) => value * -1.6);

  function move(event: PointerEvent<HTMLElement>) {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * -16);
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -10);
  }

  function explore() {
    const setup = document.getElementById("fellowship-setup");
    setup?.focus({ preventScroll: true });
    setup?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "start",
    });
  }

  return (
    <section
      ref={ref}
      className={`landing-hero${inView ? " is-in-view" : ""}`}
      aria-labelledby="landing-title"
      onPointerMove={move}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
    >
      <div className="landing-scene" aria-hidden="true">
        <motion.div
          className="landing-landscape"
          style={{ y: reducedMotion ? 0 : landscapeY }}
        >
          <motion.img
            className="landing-landscape-image"
            src="/art/mirkwood.jpg"
            alt=""
            width="1672"
            height="941"
            fetchPriority="high"
            style={{ x: reducedMotion ? 0 : x, y: reducedMotion ? 0 : y }}
          />
        </motion.div>
        <div className="landing-shade" />
        <motion.div
          className="landing-atmosphere"
          style={{ y: reducedMotion ? 0 : mistY }}
        >
          <div className="landing-light" />
          <div className="landing-mist" />
          {motes.map((style, i) => (
            <i key={i} className="landing-mote" style={style} />
          ))}
        </motion.div>
        <motion.svg
          className="landing-foreground"
          viewBox="0 0 1440 520"
          preserveAspectRatio="xMidYMax slice"
          style={{
            x: reducedMotion ? 0 : foregroundX,
            y: reducedMotion ? 0 : foregroundY,
          }}
        >
          <defs>
            <g id="landing-fern" fill="currentColor">
              <path d="M0 0Q30-95 14-220Q36-120 4 0Z" />
              <path d="M11-34Q-63-51-73-97Q-19-87 11-34ZM18-66Q-42-91-49-130Q-3-112 18-66ZM22-99Q-24-126-28-160Q10-143 22-99ZM23-130Q-9-156-9-182Q17-166 23-130ZM22-158Q4-185 10-208Q27-184 22-158Z" />
              <path d="M10-36Q79-39 88-81Q40-77 10-36ZM18-68Q82-77 84-117Q42-99 18-68ZM22-99Q73-112 71-145Q38-132 22-99ZM24-131Q58-146 53-174Q31-158 24-131ZM22-160Q44-183 34-200Q24-186 22-160Z" />
            </g>
          </defs>
          <use
            href="#landing-fern"
            transform="translate(1430 565) rotate(-28) scale(2.1)"
          />
          <use
            href="#landing-fern"
            transform="translate(1360 550) rotate(-63) scale(1.3)"
          />
          <use
            href="#landing-fern"
            transform="translate(18 565) rotate(40) scale(1.45)"
          />
          <use
            href="#landing-fern"
            transform="translate(105 565) rotate(-10) scale(.85)"
          />
        </motion.svg>
      </div>
      <div className="landing-frame" aria-hidden="true" />
      <div className="landing-waymark" aria-hidden="true">
        <span>N</span>
        <Compass size={66} weight="thin" />
        <span>THE WILDERLAND</span>
      </div>
      <motion.div
        className="landing-copy"
        initial={reducedMotion ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="landing-eyebrow">
          <span /> FROM THE RED BOOK OF WESTMARCH
        </p>
        <h1 id="landing-title">
          The road
          <br />
          <em>is calling.</em>
        </h1>
        <img
          className="landing-vine"
          src="/art/core-vine.svg"
          alt=""
          width="300"
          height="24"
        />
        <p className="landing-description">
          Gather your fellowship. Brave the shadows.
          <br className="landing-line-break" /> Let your story unfold in
          Middle-earth.
        </p>
        <div className="landing-actions">
          <button
            className="landing-primary"
            onClick={savedJourney ? onResume : explore}
          >
            {savedJourney ? "Resume your journey" : "Choose your adventure"}
            <span>
              <ArrowRight size={20} />
            </span>
          </button>
          <button className="landing-learn" onClick={onLearn}>
            <BookOpen size={21} weight="light" /> Learn to play
          </button>
        </div>
        <p className="landing-save-note">
          {savedJourney ? (
            <>
              <span className="landing-save-dot" />
              {savedJourney}
            </>
          ) : (
            <>
              <Sparkle size={15} weight="light" /> A solo journey. An entire
              fellowship in your hands.
            </>
          )}
        </p>
      </motion.div>
      <div className="landing-scene-caption" aria-hidden="true">
        <span>01 / THE WILDERLAND</span>
        <em>Beneath the ancient boughs.</em>
      </div>
      <div className="landing-bottom">
        <div
          className="landing-facts"
          aria-label="Core Set adventures for one to four players"
        >
          <span>
            <strong>04</strong> iconic adventures
          </span>
          <span>
            <strong>12</strong> legendary heroes
          </span>
          <span>
            <strong>1–4</strong> players in solo hot-seat
          </span>
        </div>
        <button className="landing-explore" onClick={explore}>
          Your story begins below <ArrowDown size={19} weight="light" />
        </button>
      </div>
    </section>
  );
}
