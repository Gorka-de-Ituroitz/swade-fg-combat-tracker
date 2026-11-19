import { MODULE_ID, setting } from "./helpers.js";

/**
 * Lanza las tiradas de los favoritos con el mismo flujo que usa la hoja de personaje
 * según el módulo que gestione las tiradas en el mundo:
 *  - Better Rolls 2  → tarjeta / diálogo / tirada según su ajuste de clic.
 *  - SWADE Tools     → su diálogo de ataque (ItemDialog) y su tirada de daño.
 *  - Sistema SWADE   → tarjeta de chat y botones de la tarjeta.
 */

const BR2_ID = "betterrolls-swade2";
const ST_ID = "swade-tools";

/**
 * API de Better Rolls 2 normalizada: la v5 (Foundry v14) usa camelCase
 * (createItemCard, rollItem…) y la v4.38 (Foundry v13) snake_case (create_item_card, roll_item…).
 */
export function br2Api() {
  const b = game.brsw;
  if (!b) return null;
  const api = {
    createItemCard: b.createItemCard ?? b.create_item_card,
    rollItem: b.rollItem ?? b.roll_item,
    createSkillCard: b.createSkillCard ?? b.create_skill_card,
    rollSkill: b.rollSkill ?? b.roll_skill,
    getActionFromClick: b.getActionFromClick ?? b.get_action_from_click,
    dialog: b.dialog
  };
  return typeof api.createItemCard === "function" ? api : null;
}

/** Coloca una plantilla de área: regiones en SWADE 6 / v14, Measured Templates en SWADE 5 / v13 */
export function placeTemplate(preset, item) {
  if (typeof game.swade?.util?.createRegionFromPreset === "function") {
    return game.swade.util.createRegionFromPreset(preset, item);
  }
  const cls = CONFIG.MeasuredTemplate?.objectClass;
  if (typeof cls?.fromPreset === "function") return cls.fromPreset(preset, item);
  const btn = CONFIG.SWADE?.measuredTemplatePresets?.find((p) => p.button?.name === preset);
  return btn?.button?.onClick?.();
}

export function rollEngine() {
  const wanted = setting("rollEngine"); // auto | br2 | swadetools | system
  const br2 = game.modules.get(BR2_ID)?.active && !!br2Api();
  const st = game.modules.get(ST_ID)?.active && !!game.swadetools;
  if (wanted === "br2" && br2) return "br2";
  if (wanted === "swadetools" && st) return "swadetools";
  if (wanted === "system") return "system";
  if (wanted === "auto") {
    if (br2) return "br2";
    if (st) return "swadetools";
  }
  return "system";
}

/** Tipos que SWADE Tools abre con su diálogo de ataque (igual que en la hoja) */
function swadeToolsHandlesItem(item) {
  const sys = item.system ?? {};
  if (["power", "weapon", "action"].includes(item.type)) return true;
  if (item.type === "gear") {
    return sys.isArcaneDevice === true || !!sys.actions?.trait || !foundry.utils.isEmpty(sys.actions?.additional ?? {});
  }
  if (item.type === "shield") return !!sys.actions?.trait;
  return false;
}

async function importSwadeTools(path) {
  const url = foundry.utils.getRoute(`modules/${ST_ID}/scripts/${path}`);
  return (await import(url)).default;
}

async function runMacroAction(item, actor, key, event) {
  return game.swade.itemChatCardHelper.handleAction(item, actor, key, { additionalMods: [], event });
}

/**
 * @param {Combatant} combatant
 * @param {Item} item
 * @param {string} key   "card" (nombre del objeto), "skill", "formula", "damage",
 *                       "template:<preset>" o la clave de una acción adicional
 * @param {Event} event
 */
export async function rollFavorite(combatant, item, key, event) {
  const actor = combatant.actor;
  if (!actor || !item) return;

  // Plantillas de área: siempre la herramienta del sistema (BR2 y SWADE Tools usan la misma)
  if (key.startsWith("template:")) return placeTemplate(key.slice("template:".length), item);

  const additional = item.system?.actions?.additional?.[key];
  const engine = rollEngine();

  try {
    if (engine === "br2") return await rollWithBR2(combatant, item, key, additional, event);
    if (engine === "swadetools") return await rollWithSwadeTools(actor, item, key, additional, event);
  } catch (err) {
    console.error(`${MODULE_ID} | Error lanzando la tirada con ${engine}; uso el sistema`, err);
  }
  return rollWithSystem(actor, item, key, event);
}

/* -------------------------------------------------------------------- */

async function rollWithBR2(combatant, item, key, additional, event) {
  const actor = combatant.actor;
  const origin = combatant.token?.object ?? actor;
  const br = br2Api();

  // Las acciones de macro se ejecutan directamente, igual que hace BR2 desde la hoja
  if (additional?.type === "macro") return runMacroAction(item, actor, key, event);

  let action = br.getActionFromClick?.(event) ?? "card";
  if (!action || action === "system") action = "card";

  if (item.type === "skill") {
    const brCard = await br.createSkillCard(origin, item.id);
    if (action.includes("dialog")) return br.dialog?.show_card(brCard);
    if (action.includes("trait") && key !== "card") return br.rollSkill(brCard, false);
    return brCard;
  }

  const actions_stored = {};
  if (additional && (additional.type === "trait" || additional.type === "damage")) actions_stored[key] = true;

  const brCard = await br.createItemCard(origin, item.id, { actions_stored });
  if (action.includes("dialog")) {
    br.dialog?.show_card(brCard);
    return brCard;
  }
  // Botón de tirada: si BR2 está en modo "mostrar tarjeta" basta con la tarjeta;
  // en modo "tarjeta y tirada" tira el rasgo (y el daño si así lo tiene configurado).
  if (key !== "card" && key !== "damage" && action.includes("trait") && (brCard?.trait ?? true)) {
    await br.rollItem(brCard, "", false, action.includes("damage"));
  }
  return brCard;
}

async function rollWithSwadeTools(actor, item, key, additional, event) {
  if (additional?.type === "macro") return runMacroAction(item, actor, key, event);

  if (item.type === "skill") return game.swadetools.skill(actor, item.id);

  if (key === "damage" || additional?.type === "damage") {
    if (additional?.type === "damage") return runMacroAction(item, actor, key, event);
    const SystemRoll = await importSwadeTools("class/SystemRoll.js");
    return new SystemRoll(actor).rollDamage(item.id);
  }

  if (swadeToolsHandlesItem(item)) {
    const ItemDialog = await importSwadeTools("class/ItemDialog.js");
    return new ItemDialog(actor, item.id).showDialog();
  }
  return key === "card" ? item.show() : runMacroAction(item, actor, key, event);
}

async function rollWithSystem(actor, item, key, event) {
  if (key === "card") return item.show();
  if (key === "skill") return item.roll();
  const helper = game.swade?.itemChatCardHelper;
  if (!helper) return item.show();
  return helper.handleAction(item, actor, key, { additionalMods: [], event });
}
