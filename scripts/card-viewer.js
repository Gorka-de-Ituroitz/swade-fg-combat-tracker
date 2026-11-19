import { MODULE_ID, applyTheme, cardData, cardHolder } from "./helpers.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Ventana pequeña que enseña en grande la carta de acción de un combatiente */
export class CardViewer extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instances = new Map();

  /** Abre (o trae al frente) el visor de un combatiente */
  static show(combatant) {
    let app = this.#instances.get(combatant.id);
    if (!app) {
      app = new this({ combatantId: combatant.id, combatId: combatant.combat?.id });
      this.#instances.set(combatant.id, app);
    }
    app.render({ force: true });
    return app;
  }

  static refreshAll() {
    for (const app of this.#instances.values()) if (app.rendered) app.render();
  }

  constructor(options = {}) {
    const saved = CardViewer.savedSize();
    super({ ...options, id: `swfg-card-${options.combatantId}`, position: { ...saved } });
    this.combatantId = options.combatantId;
    this.combatId = options.combatId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["swade-fg-tracker", "swfg-card-viewer"],
    tag: "div",
    window: { title: "SWFG.CardViewer.Title", icon: "fa-solid fa-diamond", resizable: true },
    position: { width: 360, height: 640 },
    actions: {
      redraw: CardViewer.#onRedraw
    }
  };

  static PARTS = {
    card: { template: `modules/${MODULE_ID}/templates/card-viewer.hbs` }
  };

  get combatant() {
    return game.combats.get(this.combatId)?.combatants.get(this.combatantId) ?? null;
  }

  get title() {
    return this.combatant?.name ?? game.i18n.localize("SWFG.CardViewer.Title");
  }

  async _prepareContext() {
    const c = this.combatant;
    if (!c) return { missing: true };
    const holder = cardHolder(c);
    return {
      name: c.name,
      card: cardData(c),
      follower: holder !== c,
      leaderName: holder !== c ? holder.name : null,
      canRedraw: holder.isOwner && holder.initiative != null && !holder.roundHeld
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    applyTheme(this.element);
  }

  /** Tamaño guardado por el usuario (o el de por defecto) */
  static savedSize() {
    try {
      const size = game.settings.get(MODULE_ID, "cardViewerSize");
      if (size?.width > 150 && size?.height > 200) return { width: size.width, height: size.height };
    } catch {
      /* ajuste aún no registrado */
    }
    return { width: 360, height: 640 };
  }

  static #saveSize = foundry.utils.debounce((width, height) => {
    game.settings.set(MODULE_ID, "cardViewerSize", { width: Math.round(width), height: Math.round(height) });
  }, 500);

  /** Al redimensionar la ventana, recuerda el tamaño para las próximas cartas */
  _onPosition(position) {
    super._onPosition?.(position);
    if (!this.rendered) return;
    const { width, height } = position;
    if (typeof width === "number" && typeof height === "number") CardViewer.#saveSize(width, height);
  }

  _onClose(options) {
    super._onClose?.(options);
    CardViewer.#instances.delete(this.combatantId);
  }

  static async #onRedraw() {
    const holder = cardHolder(this.combatant);
    if (!holder) return;
    await holder.combat.rerollInitiative(holder.id);
    this.render();
  }
}
