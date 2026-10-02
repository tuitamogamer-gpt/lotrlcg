/** Serializable information that follows one damage assignment through replacements. */
export interface DamageContext {
  enemyId?: string;
  combatDamage?: boolean;
  bypassFrodo?: boolean;
  bypassDori?: boolean;
  bypassDiscipline?: boolean;
  mockingVisited?: string[];
}

export const encodeDamageContext = (context: DamageContext): string =>
  JSON.stringify({ damageContext: context });

/** Accept old queued saves that stored enemy/source and Song's visited ids separately. */
export function readDamageContext(effect: {
  text?: string;
  source?: string;
  ids?: string[];
}): DamageContext {
  const legacy: DamageContext = {
    ...(effect.source ? { enemyId: effect.source, combatDamage: true } : {}),
    ...(effect.ids ? { mockingVisited: effect.ids } : {}),
  };
  try {
    const parsed: unknown = JSON.parse(effect.text ?? "null");
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string"))
      return { ...legacy, mockingVisited: parsed };
    if (!parsed || typeof parsed !== "object" || !("damageContext" in parsed))
      return legacy;
    const raw = parsed.damageContext;
    if (!raw || typeof raw !== "object") return legacy;
    const values = raw as Record<string, unknown>;
    const context: DamageContext = {};
    if ("enemyId" in raw && typeof raw.enemyId === "string")
      context.enemyId = raw.enemyId;
    for (const key of [
      "combatDamage",
      "bypassFrodo",
      "bypassDori",
      "bypassDiscipline",
    ] as const)
      if (key in raw && typeof values[key] === "boolean")
        context[key] = values[key] as boolean;
    if (
      "mockingVisited" in raw &&
      Array.isArray(raw.mockingVisited) &&
      raw.mockingVisited.every((v) => typeof v === "string")
    )
      context.mockingVisited = raw.mockingVisited;
    return context;
  } catch {
    return legacy;
  }
}

/** Transitional callers may still pass enemy id and Song history as separate arguments. */
export function normalizeDamageContext(
  context?: DamageContext | string,
  mockingVisited?: string[],
): DamageContext {
  return typeof context === "string"
    ? { enemyId: context, combatDamage: true, mockingVisited }
    : (context ?? (mockingVisited ? { mockingVisited } : {}));
}
