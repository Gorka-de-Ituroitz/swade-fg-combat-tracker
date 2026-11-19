import { FGCombatTracker, CardViewer, MODULE_ID } from "./tracker-app.js";
import { THEMES } from "./helpers.js";

let app = null;
const getApp = () => (app ??= new FGCombatTracker());

const api = {
  open: () => getApp().render({ force: true }),
  close: () => app?.close(),
  toggle: () => (app?.rendered ? app.close() : getApp().render({ force: true }))
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "autoOpen", {
    name: "SWFG.Settings.AutoOpen.Name",
    hint: "SWFG.Settings.AutoOpen.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "npcDetail", {
    name: "SWFG.Settings.NpcDetail.Name",
    hint: "SWFG.Settings.NpcDetail.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      all: "SWFG.Settings.NpcDetail.All",
      status: "SWFG.Settings.NpcDetail.Status",
      none: "SWFG.Settings.NpcDetail.None"
    },
    default: "status",
    onChange: () => app?.render()
  });

  game.settings.register(MODULE_ID, "statusList", {
    name: "SWFG.Settings.StatusList.Name",
    hint: "SWFG.Settings.StatusList.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "shaken,stunned,distracted,vulnerable,prone,bound,entangled",
    onChange: () => app?.render()
  });

  const themeChoices = Object.fromEntries(THEMES.map((t) => [t, `SWFG.Theme.${t}`]));
  const rerenderAll = () => {
    app?.render();
    CardViewer.refreshAll();
  };

  game.settings.register(MODULE_ID, "theme", {
    name: "SWFG.Settings.Theme.Name",
    hint: "SWFG.Settings.Theme.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: themeChoices,
    default: "fg",
    onChange: rerenderAll
  });

  game.settings.register(MODULE_ID, "themeClient", {
    name: "SWFG.Settings.ThemeClient.Name",
    hint: "SWFG.Settings.ThemeClient.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: { world: "SWFG.Theme.world", ...themeChoices },
    default: "world",
    onChange: rerenderAll
  });

  game.settings.register(MODULE_ID, "favoritesMode", {
    name: "SWFG.Settings.FavoritesMode.Name",
    hint: "SWFG.Settings.FavoritesMode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      always: "SWFG.Settings.FavoritesMode.Always",
      active: "SWFG.Settings.FavoritesMode.Active",
      expanded: "SWFG.Settings.FavoritesMode.Expanded",
      never: "SWFG.Settings.FavoritesMode.Never"
    },
    default: "always",
    onChange: () => app?.render()
  });

  game.settings.register(MODULE_ID, "favoriteTypes", {
    name: "SWFG.Settings.FavoriteTypes.Name",
    hint: "SWFG.Settings.FavoriteTypes.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "all",
    onChange: () => app?.render()
  });

  game.settings.register(MODULE_ID, "npcAttackTypes", {
    name: "SWFG.Settings.NpcAttackTypes.Name",
    hint: "SWFG.Settings.NpcAttackTypes.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "weapon",
    onChange: () => app?.render()
  });

  game.settings.register(MODULE_ID, "panOnTurn", {
    name: "SWFG.Settings.PanOnTurn.Name",
    hint: "SWFG.Settings.PanOnTurn.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      none: "SWFG.Settings.PanOnTurn.None",
      mine: "SWFG.Settings.PanOnTurn.Mine",
      all: "SWFG.Settings.PanOnTurn.All"
    },
    default: "mine"
  });

  game.settings.register(MODULE_ID, "autoExpand", {
    name: "SWFG.Settings.AutoExpand.Name",
    hint: "SWFG.Settings.AutoExpand.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => {
      if (value && app) app.autoExpandTurn(game.combats.viewed);
    }
  });

  game.settings.register(MODULE_ID, "panSelect", {
    name: "SWFG.Settings.PanSelect.Name",
    hint: "SWFG.Settings.PanSelect.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "rollEngine", {
    name: "SWFG.Settings.RollEngine.Name",
    hint: "SWFG.Settings.RollEngine.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      auto: "SWFG.Settings.RollEngine.Auto",
      br2: "SWFG.Settings.RollEngine.BR2",
      swadetools: "SWFG.Settings.RollEngine.SwadeTools",
      system: "SWFG.Settings.RollEngine.System"
    },
    default: "auto"
  });

  game.settings.register(MODULE_ID, "showGMBennies", {
    name: "SWFG.Settings.GMBennies.Name",
    hint: "SWFG.Settings.GMBennies.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => app?.render()
  });

  game.settings.register(MODULE_ID, "cardViewerSize", {
    scope: "client",
    config: false,
    type: Object,
    default: { width: 360, height: 640 }
  });

  game.keybindings.register(MODULE_ID, "toggle", {
    name: "SWFG.Keybinding.Toggle",
    editable: [{ key: "KeyC", modifiers: ["Alt"] }],
    onDown: () => {
      api.toggle();
      return true;
    }
  });

  game.modules.get(MODULE_ID).api = api;
});

Hooks.once("ready", () => {
  if (game.system.id !== "swade") {
    ui.notifications.warn(game.i18n.localize("SWFG.Notify.WrongSystem"));
    return;
  }
  if (game.settings.get(MODULE_ID, "autoOpen") && game.combats.viewed?.started) api.open();
});

/* Re-render cuando cambie cualquier cosa que se ve en la ventana */
const rerender = foundry.utils.debounce(() => {
  if (app?.rendered) app.render();
  CardViewer.refreshAll();
}, 50);

for (const hook of [
  "createCombat",
  "deleteCombat",
  "updateCombat",
  "createCombatant",
  "updateCombatant",
  "deleteCombatant",
  "createCombatantGroup",
  "updateCombatantGroup",
  "deleteCombatantGroup",
  "createItem",
  "updateItem",
  "deleteItem",
  "updateActor",
  "updateToken",
  "createActiveEffect",
  "updateActiveEffect",
  "deleteActiveEffect",
  "targetToken",
  "updateUser"
]) {
  Hooks.on(hook, () => rerender());
}

/* Abrir automáticamente al empezar un combate */
Hooks.on("updateCombat", (combat, changed) => {
  if (game.system.id !== "swade") return;
  if (!game.settings.get(MODULE_ID, "autoOpen")) return;
  if (app?.rendered) return;
  if (!("round" in changed) || !combat.started) return;
  if (combat !== game.combats.viewed) return;
  api.open();
});

/* Desplegar automáticamente al combatiente que actúa (y replegar al anterior) */
Hooks.on("updateCombat", (combat, changed) => {
  if (game.system.id !== "swade") return;
  if (!("turn" in changed) && !("round" in changed) && !("started" in changed)) return;
  if (!game.settings.get(MODULE_ID, "autoExpand")) return;
  if (combat !== game.combats.viewed) return;
  getApp().autoExpandTurn(combat);
});

/* Centrar la vista en el combatiente que tiene el turno */
Hooks.on("updateCombat", (combat, changed, options, userId) => {
  if (game.system.id !== "swade") return;
  if (!("turn" in changed) && !("round" in changed)) return;
  const mode = game.settings.get(MODULE_ID, "panOnTurn"); // none | mine | all
  if (mode === "none") return;
  if (mode === "mine" && userId !== game.user.id) return;
  if (!combat.started || combat !== game.combats.viewed) return;
  const token = combat.combatant?.token?.object;
  if (!token || token.scene !== canvas.scene) return;
  if (!game.user.isGM && (!token.isVisible || combat.combatant.hidden)) return;
  if (game.settings.get(MODULE_ID, "panSelect") && token.isOwner) token.control({ releaseOthers: true });
  canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 400 });
});

/* Botón para abrir la ventana desde la pestaña de combate de la barra lateral */
Hooks.on("renderCombatTracker", (tracker, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".swfg-open")) return;
  const header = root.querySelector(".combat-tracker-header, header");
  if (!header) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "swfg-open";
  btn.innerHTML = `<i class="fa-solid fa-swords"></i> ${game.i18n.localize("SWFG.Open")}`;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    api.toggle();
  });
  header.append(btn);
});
