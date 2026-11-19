import { MODULE_ID } from "./helpers.js";

/**
 * Menús contextuales del tracker estilo FG.
 *
 * No se reescriben las opciones: se piden al tracker de la barra lateral (ui.combat), que es el
 * CombatTracker de Foundry modificado por SWADE. Así salen exactamente las mismas opciones que allí
 * ("Actualizar participante", "Agrupar por nombre", "Hacer líder del grupo", "Quitar participante",
 * "Borrar historial de movimiento"…) en Foundry v13 y v14, y también las que añadan otros módulos.
 *
 * Foundry v13 usa entradas { name, condition, callback(li) } y v14 { label, visible, onClick(event, li) };
 * los envoltorios de abajo respetan el formato que venga.
 */

const ITEM_SELECTOR = "[data-item-id], li.effect[data-effect-uuid]";

/** Foundry v14 usa { label, visible, onClick }; v13 { name, condition, callback } */
const isV14 = () => (game.release?.generation ?? 13) >= 14;

/** Crea una entrada de menú en el formato de la versión de Foundry en uso */
function makeEntry({ label, icon, visible, onClick, group }) {
  if (isV14()) return { label, icon, visible, onClick: (event, li) => onClick(li, event), group };
  return { name: label, icon, condition: visible, callback: (li) => onClick(li), group };
}

function contextMenuClass() {
  const ux = foundry.applications?.ux?.ContextMenu;
  return ux?.implementation ?? ux ?? globalThis.ContextMenu;
}

/** Evalúa una condición de entrada (función o booleano) */
function test(cond, target) {
  if (cond === undefined) return true;
  return typeof cond === "function" ? !!cond(target) : !!cond;
}

/**
 * Devuelve una copia de la entrada que traduce el elemento objetivo (mapTarget) y añade
 * una condición extra (extra), sea cual sea el formato de la entrada.
 */
function adaptEntry(entry, { mapTarget = (li) => li, extra = null, group = null } = {}) {
  const e = { ...entry };
  const isV14 = "onClick" in entry || "visible" in entry || "label" in entry;
  const condKey = isV14 ? "visible" : "condition";
  const original = entry[condKey];
  e[condKey] = (li) => {
    const target = mapTarget(li);
    if (!target) return false;
    if (extra && !extra(li, target)) return false;
    try {
      return test(original, target);
    } catch {
      return false;
    }
  };
  if (typeof entry.callback === "function") e.callback = (li) => entry.callback(mapTarget(li));
  if (typeof entry.onClick === "function") e.onClick = (event, li) => entry.onClick(event, mapTarget(li));
  if (group) e.group = group;
  return e;
}

function getTracker() {
  return ui.combat ?? null;
}

/** ¿El clic derecho fue sobre un objeto o efecto? Entonces el menú es el del objeto, no el de la fila */
function onItemOrEffect(app) {
  return !!app._swfgCtxTarget?.closest?.(ITEM_SELECTOR);
}

/** Opciones de un combatiente (las del tracker nativo) + opciones de su grupo, si tiene */
export function buildCombatantEntries(app) {
  const tracker = getTracker();
  if (!tracker) return [];
  const entries = [];
  const notOnItem = () => !onItemOrEffect(app);

  try {
    const base = tracker._getEntryContextOptions?.() ?? [];
    try {
      // Mismo hook que usa el tracker nativo para que otros módulos añadan opciones
      Hooks.call("getCombatantContextOptions", tracker, base);
    } catch (err) {
      console.warn(`${MODULE_ID} | Error en un hook de opciones de combatiente`, err);
    }
    for (const entry of base) entries.push(adaptEntry(entry, { extra: notOnItem }));
  } catch (err) {
    console.error(`${MODULE_ID} | No se pudieron leer las opciones del tracker`, err);
  }

  // Opciones del grupo (las que SWADE muestra en la cabecera del grupo)
  try {
    const groupEntries = tracker._getGroupContextOptions?.() ?? [];
    const toGroupTarget = (li) => {
      const c = app.combat?.combatants.get(li?.dataset?.combatantId);
      if (!c?.group) return null;
      // Las opciones de grupo de SWADE solo leen dataset.groupId y offsetTop
      return { dataset: { groupId: c.group.id }, offsetTop: li.offsetTop ?? 0, closest: () => null };
    };
    for (const entry of groupEntries)
      entries.push(adaptEntry(entry, { mapTarget: toGroupTarget, group: "swfg-group", extra: notOnItem }));
  } catch (err) {
    console.error(`${MODULE_ID} | No se pudieron leer las opciones de grupo`, err);
  }

  return entries;
}

/**
 * Menú de clic derecho de los objetos (favoritos, poderes…) y de los efectos de la parte desplegable.
 * Mismas opciones que la hoja de personaje de SWADE (Recargar, Quitar munición, Editar, Duplicar, Borrar)
 * más "Mostrar en el chat" y "Marcar/Quitar favorito".
 */
export function buildItemEntries(app) {
  const combatantOf = (li) => app.combat?.combatants.get(li?.closest?.("[data-combatant-id]")?.dataset.combatantId);
  const itemOf = (li) => {
    const id = li?.dataset?.itemId;
    return id ? combatantOf(li)?.actor?.items.get(id) ?? null : null;
  };
  const effectOf = (li) => {
    const uuid = li?.dataset?.effectUuid;
    return uuid ? fromUuidSync(uuid) : null;
  };
  const docOf = (li) => itemOf(li) ?? effectOf(li);
  const canEdit = (li) => !!docOf(li)?.isOwner;
  const ammoManagement = () => {
    try {
      return game.settings.get("swade", "ammoManagement");
    } catch {
      return false;
    }
  };

  return [
    makeEntry({
      label: "SWADE.Reload",
      icon: '<i class="fa-solid fa-right-to-bracket"></i>',
      visible: (li) => {
        const item = itemOf(li);
        return !!item?.isOwner && item.type === "weapon" && !!item.system.shots && ammoManagement();
      },
      onClick: (li) => itemOf(li)?.reload()
    }),
    makeEntry({
      label: "SWADE.RemoveAmmo",
      icon: '<i class="fa-solid fa-right-from-bracket"></i>',
      visible: (li) => {
        const item = itemOf(li);
        if (!item?.isOwner || item.type !== "weapon") return false;
        const reloadType = item.system.reloadType;
        return !!item.getFlag("swade", "loadedAmmo") && item.usesAmmoFromInventory && (reloadType === "magazine" || reloadType === "battery");
      },
      onClick: (li) => itemOf(li)?.removeAmmo()
    }),
    makeEntry({
      label: "SWFG.Menu.ShowInChat",
      icon: '<i class="fa-solid fa-comment"></i>',
      visible: (li) => !!itemOf(li)?.isOwner,
      onClick: (li) => itemOf(li)?.show()
    }),
    makeEntry({
      label: "SWFG.Menu.ToggleFavorite",
      icon: '<i class="fa-solid fa-star"></i>',
      visible: (li) => {
        const item = itemOf(li);
        return !!item?.isOwner && "favorite" in (item.system ?? {});
      },
      onClick: (li) => {
        const item = itemOf(li);
        return item?.update({ "system.favorite": !item.system.favorite });
      }
    }),
    makeEntry({
      label: "SWADE.Ed",
      icon: '<i class="fa-solid fa-edit"></i>',
      visible: canEdit,
      onClick: (li) => docOf(li)?.sheet?.render(true)
    }),
    makeEntry({
      label: "SWADE.Duplicate",
      icon: '<i class="fa-solid fa-copy"></i>',
      visible: (li) => {
        const item = itemOf(li);
        return !!item?.isOwner && !!item.isPhysicalItem;
      },
      onClick: async (li) => {
        const item = itemOf(li);
        const cloned = await item?.clone({ name: game.i18n.format("DOCUMENT.CopyOf", { name: item.name }) }, { save: true });
        cloned?.sheet?.render(true);
      }
    }),
    makeEntry({
      label: "SWADE.Del",
      icon: '<i class="fa-solid fa-trash"></i>',
      visible: canEdit,
      onClick: (li) => docOf(li)?.deleteDialog()
    })
  ];
}

/** Opciones del encuentro (botón ⋮ de la cabecera): reiniciar iniciativa, crear grupo, borrar combate… */
export function buildCombatEntries() {
  const tracker = getTracker();
  if (!tracker) return [];
  try {
    const base = tracker._getCombatContextOptions?.() ?? [];
    try {
      Hooks.call("getCombatContextOptions", tracker, base);
    } catch {
      /* hooks de terceros */
    }
    return base.map((entry) => adaptEntry(entry, { mapTarget: (li) => li ?? document.body }));
  } catch (err) {
    console.error(`${MODULE_ID} | No se pudieron leer las opciones del encuentro`, err);
    return [];
  }
}

/** Sustituye las entradas del menú (si la versión de Foundry lo permite) */
function refresh(menu, build) {
  try {
    const items = build();
    if (Array.isArray(menu.menuItems)) menu.menuItems.splice(0, menu.menuItems.length, ...items);
    else menu.menuItems = items;
  } catch (err) {
    console.warn(`${MODULE_ID} | No se pudieron actualizar las opciones del menú`, err);
  }
}

/** Crea los dos menús sobre el elemento raíz de la ventana (una sola vez) */
export function createContextMenus(app) {
  const CM = contextMenuClass();
  if (!CM) return;
  const root = app.element;

  // Recuerda sobre qué se hizo clic derecho (fase de captura: antes que los menús)
  root.addEventListener(
    "contextmenu",
    (ev) => {
      app._swfgCtxTarget = ev.target;
    },
    true
  );

  // Clic derecho en un objeto o efecto: el menú de la hoja de personaje.
  // Va en .window-content (dentro de la raíz) y corta la propagación para que no se abra
  // también el menú de la fila, que escucha en la raíz.
  const content = root.querySelector(".window-content") ?? root;
  const itemMenu = new CM(content, ITEM_SELECTOR, buildItemEntries(app), { jQuery: false, fixed: true });
  if (content !== root) {
    content.addEventListener("contextmenu", (ev) => {
      if (ev.target.closest?.(ITEM_SELECTOR)) ev.stopPropagation();
    });
  }

  // Clic derecho en una fila. Las entradas se piden de nuevo cada vez que se abre el menú.
  const rowMenu = new CM(root, ".swfg-row", [], {
    jQuery: false,
    fixed: true,
    onOpen: () => refresh(rowMenu, () => buildCombatantEntries(app))
  });
  refresh(rowMenu, () => buildCombatantEntries(app));

  // Botón ⋮ de la cabecera
  const combatMenu = new CM(root, "[data-swfg-menu='combat']", [], {
    jQuery: false,
    fixed: true,
    eventName: "click",
    onOpen: () => refresh(combatMenu, buildCombatEntries)
  });
  refresh(combatMenu, buildCombatEntries);

  return { rowMenu, combatMenu, itemMenu };
}
