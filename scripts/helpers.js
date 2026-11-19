export const MODULE_ID = "swade-fg-combat-tracker";

export const THEMES = ["fg", "fantasy", "scifi", "modern", "horror", "pulp"];

export const setting = (key) => game.settings.get(MODULE_ID, key);

/** Tema efectivo: el del cliente si lo ha elegido, si no el del mundo */
export function currentTheme() {
  const client = setting("themeClient");
  const theme = client && client !== "world" ? client : setting("theme");
  return THEMES.includes(theme) ? theme : "fg";
}

export function applyTheme(element) {
  if (!element) return;
  for (const t of THEMES) element.classList.remove(`swfg-theme-${t}`);
  element.classList.add(`swfg-theme-${currentTheme()}`);
}

/* Palos tal como los guarda SWADE en card.system.suit / combatant.system.suitValue */
const SUITS = {
  1: { sym: "♣", color: "black" },
  2: { sym: "♦", color: "red" },
  3: { sym: "♥", color: "red" },
  4: { sym: "♠", color: "black" }
};
const RANKS = { 11: "J", 12: "Q", 13: "K", 14: "A" };

function stripHTML(str) {
  const div = document.createElement("div");
  div.innerHTML = String(str ?? "");
  return div.textContent.trim();
}

/** El combatiente que tiene la carta: el propio, o el líder si es seguidor de un grupo */
export function cardHolder(c) {
  if (c?.group && !c.isGroupLeader) return c.groupLeader ?? c;
  return c;
}

/** Devuelve el documento Card de la baraja de acción configurada en el mundo */
export function findActionCard(c) {
  const holder = cardHolder(c);
  const combat = holder?.combat;
  if (!holder || holder.cardValue == null) return null;
  try {
    let card = combat?.findCard?.(holder.cardValue, holder.suitValue);
    if (!card) {
      const deck = game.cards.get(game.settings.get("swade", "actionDeck"));
      card = deck?.cards.find((cd) => cd.value === holder.cardValue && cd.system?.suit === holder.suitValue);
    }
    return card ?? null;
  } catch {
    return null;
  }
}

export function cardFaceImg(card) {
  if (!card) return null;
  const face = card.faces?.[card.face ?? 0] ?? card.faces?.[0];
  return face?.img ?? card.img ?? null;
}

/** Datos de la carta para pintar en la fila o en el visor */
export function cardData(c) {
  const holder = cardHolder(c);
  if (!holder || holder.cardValue == null || holder.initiative == null) return null;
  const value = Number(holder.cardValue);
  const joker = holder.hasJoker;
  const suit = SUITS[holder.suitValue] ?? { sym: "", color: joker && value === 99 ? "red" : "black" };
  const card = findActionCard(c);
  const label = holder.cardString || card?.description || card?.name || `${RANKS[value] ?? value}${suit.sym}`;
  return {
    joker,
    rank: joker ? "★" : RANKS[value] ?? value,
    suit,
    label: stripHTML(label),
    name: card?.name ?? label,
    img: cardFaceImg(card),
    backImg: card?.back?.img ?? null,
    deckName: card?.source?.name ?? card?.parent?.name ?? ""
  };
}
