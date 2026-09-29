import { useState } from "react";
import {
  Crown,
  Diamond,
  Feather,
  Leaf,
  Sword,
  Tree,
} from "@phosphor-icons/react";
import { imageUrl } from "../game/cards";
import type { Card } from "../game/types";

export function Sphere({ sphere }: { sphere: string }) {
  const I =
    sphere === "leadership"
      ? Crown
      : sphere === "spirit"
        ? Feather
        : sphere === "tactics"
          ? Sword
          : sphere === "lore"
            ? Leaf
            : Diamond;
  return (
    <I
      weight="duotone"
      className={`sphere-${sphere}`}
      size={16}
      aria-label={sphere}
    />
  );
}
export function Art({ c, className = "" }: { c: Card; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={`art-fallback ${className}`}>
      <Tree size={38} />
      <span>{c.name}</span>
    </div>
  ) : (
    <img
      src={imageUrl(c)}
      alt={c.name}
      data-card-code={c.code}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
