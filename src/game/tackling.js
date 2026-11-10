export function playEndsFromTackle(carrier, quarterback) {
  return Boolean(carrier?.isTackled || quarterback?.isTackled);
}
