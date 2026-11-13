/** Condition attachments that give their host the enemy card type. */
export const SECRET_CULTIST = "octgn:617bc2e6-05a9-4c99-b3ff-8304ecb6ef32";
export const FALLEN_INTO_EVIL = "octgn:57fdb41b-3a17-477d-89e7-b3b139d58642";
export const ENEMY_CONDITIONS: readonly string[] = [
  SECRET_CULTIST,
  FALLEN_INTO_EVIL,
];
export const hasEnemyCondition = (u: {
  attachments?: { code: string; blanked?: boolean }[];
}) =>
  !!u.attachments?.some((a) => ENEMY_CONDITIONS.includes(a.code) && !a.blanked);
