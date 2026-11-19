import { MODULE_ID, setting, applyTheme, cardData, cardHolder } from "./helpers.js";
import { CardViewer } from "./card-viewer.js";
import { rollFavorite, rollEngine } from "./rolls.js";
import { createContextMenus } from "./context-menus.js";

export { MODULE_ID };

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* Orden en que se muestran los favoritos cuando el ajuste es "all" */
const FAVORITE_ORDER = ["weapon", "power", "action", "consumable", "shield", "armor", "gear", "skill", "edge", "hindrance", "ability", "ancestry"];

/* Plantillas de área de SWADE (item.system.templates → preset de createRegionFromPreset) */
const TEMPLATE_PRESETS = {
  scone: { preset: "swscone", label: "SWADE.Templates.SmallCone.Short" },
  cone: { preset: "swcone", label: "SWADE.Templates.Cone.Short" },
  stream: { preset: "stream", label: "SWADE.Templates.Stream.Short" },
  small: { preset: "sbt", label: "SWADE.Templates.Small.Short" },
  medium: { preset: "mbt", label: "SWADE.Templates.Medium.Short" },
  large: { preset: "lbt", label: "SWADE.Templates.Large.Short" }
};


/**
 * Ventana de combate estilo Fantasy Grounds para SWADE 6 / Foundry v14.
 * Todo lo que cambia lo hace llamando a los métodos del sistema (toggleHold, actNow,
 * follow, toggleActiveEffect, spendBenny, rollInitiative, itemChatCardHelper…), así que
 * Better Rolls 2 y SWADE Tools reciben los mismos hooks que desde la hoja o el tracker nativo.
 */
export class FGCombatTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "swade-fg-tracker",
    classes: ["swade-fg-tracker"],
    tag: "div",
    window: { title: "SWFG.Title", icon: "fa-solid fa-swords", resizable: true },
    position: { width: 760, height: 640 },
    actions: {
      createCombat: FGCombatTracker.#onCreateCombat,
      addSelected: FGCombatTracker.#onAddSelected,
      dealAll: FGCombatTracker.#onDealAll,
      dealNPC: FGCombatTracker.#onDealNPC,
      dealCard: FGCombatTracker.#onDealCard,
      viewCard: FGCombatTracker.#onViewCard,
      startCombat: FGCombatTracker.#onStartCombat,
      previousTurn: FGCombatTracker.#onPreviousTurn,
      nextTurn: FGCombatTracker.#onNextTurn,
      nextRound: FGCombatTracker.#onNextRound,
      endCombat: FGCombatTracker.#onEndCombat,
      endTurn: FGCombatTracker.#onNextTurn,
      toggleHold: FGCombatTracker.#onToggleHold,
      actNow: FGCombatTracker.#onActNow,
      actAfter: FGCombatTracker.#onActAfter,
      toggleTurnLost: FGCombatTracker.#onToggleTurnLost,
      toggleStatus: FGCombatTracker.#onToggleStatus,
      setTrack: FGCombatTracker.#onSetTrack,
      benny: FGCombatTracker.#onBenny,
      gmBenny: FGCombatTracker.#onGMBenny,
      selectToken: FGCombatTracker.#onSelectToken,
      target: FGCombatTracker.#onTarget,
      toggleHidden: FGCombatTracker.#onToggleHidden,
      toggleDefeated: FGCombatTracker.#onToggleDefeated,
      toggleExpand: FGCombatTracker.#onToggleExpand,
      rollRun: FGCombatTracker.#onRollRun,
      removeCombatant: FGCombatTracker.#onRemoveCombatant,
      unfollow: FGCombatTracker.#onUnfollow,
      deleteEffect: FGCombatTracker.#onDeleteEffect,
      itemCard: FGCombatTracker.#onItemCard,
      itemAction: FGCombatTracker.#onItemAction
    }
  };

  static PARTS = {
    tracker: {
      template: `modules/${MODULE_ID}/templates/tracker.hbs`,
      scrollable: [".swfg-list"]
    }
  };

  /** Filas desplegadas (ids de combatiente) */
  #expanded = new Set();

  /** Último combatiente desplegado automáticamente por el cambio de turno */
  #autoExpandedId = null;
  #scrollToActive = false;

  /**
   * Al cambiar de turno: despliega al combatiente que actúa y repliega al anterior.
   * Se llama desde el hook updateCombat cuando el ajuste está activado.
   */
  autoExpandTurn(combat) {
    const current = combat?.started ? combat.combatant : null;
    if (this.#autoExpandedId && this.#autoExpandedId !== current?.id) this.#expanded.delete(this.#autoExpandedId);
    if (current) this.#expanded.add(current.id);
    this.#autoExpandedId = current?.id ?? null;
    this.#scrollToActive = true;
    if (this.rendered) this.render();
  }

  get combat() {
    return game.combats?.viewed ?? null;
  }

  /* ------------------------------------------------------------------ */
  /*  Datos                                                              */
  /* ------------------------------------------------------------------ */

  async _prepareContext() {
    const isGM = game.user.isGM;
    const combat = this.combat;
    const context = {
      isGM,
      hasCombat: !!combat,
      canCreate: isGM && !!canvas?.scene,
      rows: []
    };
    if (!combat) return context;

    context.round = combat.round;
    context.started = combat.started;
    context.isMyTurn = combat.started && !!combat.combatant?.isOwner && !isGM;
    context.anyWithoutCard = combat.combatants.some(
      (c) => c.initiative == null && !(c.group && !c.isGroupLeader) && !c.isDefeated
    );

    if (setting("showGMBennies")) {
      const gm = isGM ? game.user : game.users.activeGM ?? game.users.find((u) => u.isGM);
      context.gmBennies = { value: gm?.bennies ?? gm?.getFlag("swade", "bennies") ?? 0, editable: isGM };
    }

    // combat.turns ya viene ordenado por SWADE con los miembros de un grupo juntos (líder primero)
    for (const c of combat.turns) {
      if (!c.visible) continue;
      context.rows.push(this.#prepareRow(c, combat));
    }
    return context;
  }

  #prepareRow(c, combat) {
    const isGM = game.user.isGM;
    const actor = c.actor;
    const sys = actor?.system ?? {};
    const editable = c.isOwner;
    const detail = setting("npcDetail"); // all | status | none
    const showStats = editable || actor?.hasPlayerOwner || detail === "all";
    const showStatus = showStats || detail === "status";
    const follower = !!c.group && !c.isGroupLeader;
    const leader = !!c.group && c.isGroupLeader;
    const active = combat.started && combat.combatant?.id === c.id;
    const wildcard = actor?.isWildcard ?? false;

    const track = (data, key) => {
      const max = Number(data?.max ?? 0);
      const value = Number(data?.value ?? 0);
      if (!showStats || max <= 0) return null;
      return { key, value, max, pips: Array.fromRange(max).map((i) => ({ index: i, filled: i < value })) };
    };

    const statusIds = setting("statusList").split(",").map((s) => s.trim()).filter(Boolean);
    const statuses = [];
    if (actor && showStatus) {
      for (const id of statusIds) {
        const cfg = CONFIG.statusEffects.find((e) => e.id === id);
        if (!cfg) continue;
        const on = actor.statuses?.has(id) ?? false;
        if (!editable && !on) continue;
        statuses.push({ id, active: on, img: cfg.img ?? cfg.icon, label: game.i18n.localize(cfg.name ?? cfg.label ?? id) });
      }
    }

    const expanded = this.#expanded.has(c.id);
    let effects = [];
    let stats = null;
    let powers = null;
    if (expanded && actor && showStats) {
      const list = actor.appliedEffects ?? actor.effects?.contents ?? [];
      effects = list.map((e) => ({
        uuid: e.uuid,
        name: e.name,
        img: e.img ?? e.icon,
        duration: e.duration?.label ?? "",
        deletable: editable && e.parent === actor
      }));
      const pace = sys.pace ? sys.pace[sys.pace.base] ?? sys.pace.ground : null;
      const tip = (fn) => {
        try {
          return fn() || "";
        } catch {
          return "";
        }
      };
      const running = sys.pace?.running;
      stats = {
        pace,
        running: running?.die ? { die: running.die, mod: Number(running.mod) || 0, canRoll: editable } : null,
        parry: sys.stats?.parry?.value ?? null,
        toughness: sys.stats?.toughness?.value ?? null,
        armor: sys.stats?.toughness?.armor || null,
        // Los mismos desgloses que muestra la hoja de SWADE al pasar el ratón
        paceTooltip: tip(() => sys.getPaceTooltip?.()),
        parryTooltip: tip(() => actor.getPTTooltip?.("parry")),
        toughnessTooltip: tip(() => actor.getPTTooltip?.("toughness")),
        armorTooltip: tip(() => actor.getArmorTooltip?.())
      };
      if (editable) powers = this.#preparePowers(actor);
    }

    const favMode = setting("favoritesMode"); // always | active | expanded | never
    const showFavs =
      editable &&
      actor &&
      (favMode === "always" || (favMode === "active" && (active || expanded)) || (favMode === "expanded" && expanded));
    const favorites = showFavs ? this.#prepareFavorites(actor) : [];

    const holder = cardHolder(c);
    const hasCard = holder.initiative != null && holder.cardValue != null;
    const held = !!c.roundHeld;
    const turnLost = c.turnLost;
    const bennyValue = actor?.bennies ?? sys.bennies?.value ?? 0;

    return {
      id: c.id,
      name: c.name,
      img: c.img ?? actor?.img,
      follower,
      leader,
      active,
      defeated: c.isDefeated,
      hidden: c.hidden,
      held,
      turnLost,
      wildcard,
      editable,
      isGM,
      draggable: isGM,
      card: hasCard ? cardData(c) : null,
      canDeal: !hasCard && !follower && editable && !c.isDefeated && !held && !turnLost,
      canHold: combat.started && !follower && !turnLost && (isGM || (active && editable)),
      canActNow: isGM && combat.started && held && !(active && combat.round === c.roundHeld),
      canTurnLost: isGM && combat.started && (held || turnLost),
      wounds: track(sys.wounds, "wounds"),
      fatigue: track(sys.fatigue, "fatigue"),
      bennies: showStats && "bennies" in sys && (wildcard || bennyValue > 0) ? { value: bennyValue, editable } : null,
      statuses,
      expanded,
      effects,
      stats,
      powers: powers?.list.length ? powers : null,
      favorites,
      targeted: c.token?.object?.isTargeted ?? false
    };
  }

  /**
   * Objetos que se muestran en la fila:
   *  - los marcados como favoritos en la hoja (de los tipos configurados);
   *  - en PNJ, además, todo lo que su hoja enseña en "Gear"/"Powers" (armas y poderes),
   *    porque en la hoja de PNJ esos objetos no necesitan estrella.
   */
  #prepareFavorites(actor) {
    const types = setting("favoriteTypes").split(",").map((s) => s.trim()).filter(Boolean);
    const allTypes = !types.length || types.includes("all");
    const npcTypes = actor.type === "npc" ? setting("npcAttackTypes").split(",").map((s) => s.trim()).filter(Boolean) : [];
    const order = [...new Set([...types.filter((t) => t !== "all"), ...npcTypes, ...FAVORITE_ORDER])];
    const items = actor.items
      .filter((i) => {
        if (i.system?.hidden) return false;
        if (npcTypes.includes(i.type)) return true;
        return i.system?.favorite && (allTypes || types.includes(i.type));
      })
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));

    return items.map((item) => this.#itemEntry(item, actor));
  }

  /** Lista de poderes del actor para la parte desplegable, con las reservas de PP */
  #preparePowers(actor) {
    const powers = actor.items
      .filter((i) => i.type === "power" && !i.system?.hidden)
      .sort((a, b) => (a.system.arcane || "").localeCompare(b.system.arcane || "") || (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
      .map((item) => this.#itemEntry(item, actor, { pool: false }));
    const pools = [];
    const noPP = (() => {
      try {
        return game.settings.get("swade", "noPowerPoints");
      } catch {
        return false;
      }
    })();
    if (!noPP) {
      for (const [key, pp] of Object.entries(actor.system.powerPoints ?? {})) {
        if (!pp || !(Number(pp.max) > 0)) continue;
        pools.push({ key, label: key === "general" ? game.i18n.localize("SWFG.PPGeneral") : key, value: pp.value, max: pp.max });
      }
    }
    return { list: powers, pools };
  }

  /** Datos de un objeto con sus botones de tirada (como en su tarjeta de la hoja) */
  #itemEntry(item, actor, { pool = true } = {}) {
    {
      const sys = item.system;
      const actions = [];
      if (item.type === "skill") {
        actions.push({ key: "skill", label: sys.die?.sides ? `d${sys.die.sides}` : item.name, kind: "trait" });
      } else {
        const additional = Object.entries(sys.actions?.additional ?? {}).map(([key, a]) => ({ key, ...a }));
        if (sys.actions?.trait) actions.push({ key: "formula", label: sys.actions.trait, kind: "trait" });
        for (const a of additional.filter((a) => a.type === "trait"))
          actions.push({ key: a.key, label: a.name, kind: "trait" });
        if (item.isArcaneDevice) actions.push({ key: "arcane-device", label: game.i18n.localize("SWFG.Fav.Activate"), kind: "trait" });
        if (sys.damage) actions.push({ key: "damage", label: prettyFormula(sys.damage, item), kind: "damage" });
        for (const a of additional.filter((a) => a.type === "damage"))
          actions.push({ key: a.key, label: a.name, kind: "damage" });
        for (const a of additional.filter((a) => a.type === "macro"))
          actions.push({ key: a.key, label: a.name, kind: "macro" });
        for (const [k, cfg] of Object.entries(TEMPLATE_PRESETS)) {
          if (sys.templates?.[k]) actions.push({ key: `template:${cfg.preset}`, label: game.i18n.localize(cfg.label), kind: "template" });
        }
      }

      let counter = null;
      if (item.type === "weapon" && Number(sys.shots) > 0) counter = `${sys.currentShots ?? 0}/${sys.shots}`;
      else if (item.type === "power") {
        const arcane = sys.arcane || "general";
        const pp = actor.system.powerPoints?.[arcane];
        counter = `${sys.pp ?? ""} PP${pool && pp ? ` · ${pp.value}/${pp.max}` : ""}`;
        if (sys.rank || sys.range) counter += [sys.rank, sys.range].filter(Boolean).map((t) => ` · ${t}`).join("");
      } else if (item.type === "consumable" && sys.charges?.default) {
        counter = `${sys.charges.default.value}/${sys.charges.default.max}`;
      }

      return { id: item.id, name: item.name, img: item.img, type: item.type, counter, actions };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Eventos que no son clics simples                                   */
  /* ------------------------------------------------------------------ */

  /** Menús de clic derecho (los mismos que el tracker de SWADE), creados una sola vez */
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    try {
      this._swfgMenus = createContextMenus(this);
    } catch (err) {
      console.error(`${MODULE_ID} | No se pudieron crear los menús contextuales`, err);
    }
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const html = this.element;
    applyTheme(html);
    if (this.#scrollToActive) {
      this.#scrollToActive = false;
      html.querySelector(".swfg-row.active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    for (const row of html.querySelectorAll(".swfg-row")) {
      const c = this.combat?.combatants.get(row.dataset.combatantId);
      if (!c) continue;

      row.addEventListener("mouseenter", (ev) => {
        const token = c.token?.object;
        if (token?.isVisible && !token.controlled) token._onHoverIn?.(ev, { hoverOutOthers: true });
      });
      row.addEventListener("mouseleave", (ev) => {
        const token = c.token?.object;
        if (token?.hover) token._onHoverOut?.(ev);
      });

      row.querySelector(".swfg-name")?.addEventListener("dblclick", () => c.actor?.sheet?.render(true));

      // Clic derecho en la carta = robar de nuevo (pide Benny, como en el tracker de SWADE)
      row.querySelector(".swfg-card[data-action='viewCard']")?.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const holder = cardHolder(c);
        if (holder.isOwner && holder.initiative != null && !holder.roundHeld) await this.combat.rerollInitiative(holder.id);
      });

      // Clic derecho en Heridas / Fatiga = bajar uno
      for (const trackEl of row.querySelectorAll(".track[data-track]")) {
        trackEl.addEventListener("contextmenu", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!c.actor || !c.isOwner) return;
          const key = trackEl.dataset.track;
          const current = Number(c.actor.system[key]?.value ?? 0);
          if (current <= 0) return;
          await c.actor.update({ [`system.${key}.value`]: current - 1 });
        });
      }

      // Clic derecho en Bennies = ganar uno
      row.querySelector("[data-action='benny']")?.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.#changeBenny(c, +1);
      });

      if (game.user.isGM) {
        row.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "swfg-combatant", id: c.id }));
        });
        row.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          row.classList.add("drop-target");
        });
        row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
        row.addEventListener("drop", async (ev) => {
          ev.preventDefault();
          row.classList.remove("drop-target");
          let data;
          try {
            data = JSON.parse(ev.dataTransfer.getData("text/plain"));
          } catch {
            return;
          }
          if (data?.type !== "swfg-combatant" || data.id === c.id) return;
          const follower = this.combat.combatants.get(data.id);
          const leader = c.group && !c.isGroupLeader ? c.groupLeader ?? c : c;
          if (follower && follower.id !== leader.id) await follower.follow(leader);
        });
      }
    }

    html.querySelector("[data-action='gmBenny']")?.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      if (game.user.isGM) game.user.getBenny();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Utilidades                                                         */
  /* ------------------------------------------------------------------ */

  #getCombatant(target) {
    const id = target.closest("[data-combatant-id]")?.dataset.combatantId;
    return this.combat?.combatants.get(id) ?? null;
  }

  async #changeBenny(c, delta) {
    const actor = c.actor;
    if (!actor || !c.isOwner) return;
    if (delta < 0) {
      if ((actor.bennies ?? 0) <= 0) return;
      return actor.spendBenny();
    }
    return actor.getBenny();
  }

  /* ------------------------------------------------------------------ */
  /*  Acciones                                                           */
  /* ------------------------------------------------------------------ */

  static async #onCreateCombat() {
    const cls = CONFIG.Combat.documentClass;
    if (typeof cls.createDialog === "function") return cls.createDialog({ active: true });
    return cls.create({ scene: canvas.scene?.id, active: true });
  }

  static async #onAddSelected() {
    const tokens = canvas.tokens.controlled.map((t) => t.document);
    if (!tokens.length) return ui.notifications.info(game.i18n.localize("SWFG.Notify.NoTokens"));
    let combat = this.combat;
    if (!combat) combat = await CONFIG.Combat.documentClass.create({ scene: canvas.scene?.id, active: true });
    await CONFIG.Token.documentClass.createCombatants(tokens, { combat });
  }

  static async #onDealAll() {
    await this.combat?.rollAll();
  }

  static async #onDealNPC() {
    await this.combat?.rollNPC();
  }

  static async #onDealCard(event, target) {
    const c = this.#getCombatant(target);
    if (c) await this.combat.rollInitiative(c.id);
  }

  static async #onViewCard(event, target) {
    const c = this.#getCombatant(target);
    if (c) CardViewer.show(c);
  }

  static async #onStartCombat() {
    await this.combat?.startCombat();
  }

  static async #onPreviousTurn() {
    await this.combat?.previousTurn();
  }

  static async #onNextTurn() {
    await this.combat?.nextTurn();
  }

  static async #onNextRound() {
    await this.combat?.nextRound();
  }

  static async #onEndCombat() {
    await this.combat?.endCombat();
  }

  static async #onToggleHold(event, target) {
    const c = this.#getCombatant(target);
    if (c?.isOwner) await c.toggleHold();
  }

  static async #onActNow(event, target) {
    const c = this.#getCombatant(target);
    if (c && game.user.isGM) await c.actNow();
  }

  static async #onActAfter(event, target) {
    const c = this.#getCombatant(target);
    if (c && game.user.isGM) await c.actAfterCurrentCombatant();
  }

  static async #onToggleTurnLost(event, target) {
    const c = this.#getCombatant(target);
    if (c && game.user.isGM) await c.toggleTurnLost();
  }

  static async #onToggleStatus(event, target) {
    const c = this.#getCombatant(target);
    if (!c?.actor || !c.isOwner) return;
    // Igual que el botón de estado de la hoja de SWADE
    await c.actor.toggleActiveEffect(target.dataset.statusId);
  }

  static async #onSetTrack(event, target) {
    const c = this.#getCombatant(target);
    if (!c?.actor || !c.isOwner) return;
    const key = target.dataset.track;
    const index = Number(target.dataset.index);
    const current = Number(c.actor.system[key]?.value ?? 0);
    const value = current === index + 1 ? index : index + 1;
    await c.actor.update({ [`system.${key}.value`]: value });
  }

  static async #onBenny(event, target) {
    const c = this.#getCombatant(target);
    if (c) await this.#changeBenny(c, -1);
  }

  static async #onGMBenny() {
    if (game.user.isGM) await game.user.spendBenny();
  }

  static async #onSelectToken(event, target) {
    const c = this.#getCombatant(target);
    const token = c?.token?.object;
    if (!token || !token.actor?.testUserPermission(game.user, "OBSERVER")) return;
    if (token.isOwner) token.control({ releaseOthers: !event.shiftKey });
    await canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
  }

  static async #onTarget(event, target) {
    const c = this.#getCombatant(target);
    const token = c?.token?.object;
    if (!token) return;
    token.setTarget(!token.isTargeted, { releaseOthers: false });
    this.render();
  }

  static async #onToggleHidden(event, target) {
    const c = this.#getCombatant(target);
    if (c && game.user.isGM) await c.update({ hidden: !c.hidden });
  }

  static async #onToggleDefeated(event, target) {
    const c = this.#getCombatant(target);
    if (!c?.isOwner) return;
    const defeated = !c.defeated;
    await c.update({ defeated });
    const statusId = CONFIG.specialStatusEffects?.DEFEATED;
    if (c.actor && statusId) await c.actor.toggleActiveEffect(statusId, { overlay: true, active: defeated });
  }

  /** Tirada de carrera: la de SWADE Tools si es el módulo de tiradas activo, si no la del sistema */
  static async #onRollRun(event, target) {
    const c = this.#getCombatant(target);
    const actor = c?.actor;
    if (!actor || !c.isOwner) return;
    if (rollEngine() === "swadetools" && typeof game.swadetools?.run === "function") return game.swadetools.run(actor);
    return actor.rollRunningDie();
  }

  static async #onToggleExpand(event, target) {
    const c = this.#getCombatant(target);
    if (!c) return;
    if (this.#expanded.has(c.id)) this.#expanded.delete(c.id);
    else this.#expanded.add(c.id);
    this.render();
  }

  static async #onRemoveCombatant(event, target) {
    const c = this.#getCombatant(target);
    if (c && game.user.isGM) await c.delete();
  }

  static async #onUnfollow(event, target) {
    const c = this.#getCombatant(target);
    if (c && game.user.isGM) await c.removeFromGroup();
  }

  static async #onDeleteEffect(event, target) {
    const effect = await fromUuid(target.dataset.effectUuid);
    if (effect?.isOwner) await effect.delete();
  }

  /** Clic en el nombre del favorito: tarjeta del módulo de tiradas activo (o del sistema) */
  static async #onItemCard(event, target) {
    const c = this.#getCombatant(target);
    const item = c?.actor?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !c.isOwner) return;
    return rollFavorite(c, item, item.type === "skill" ? "skill" : "card", event);
  }

  /** Botones de tirada del favorito */
  static async #onItemAction(event, target) {
    const c = this.#getCombatant(target);
    const item = c?.actor?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !c.isOwner) return;
    return rollFavorite(c, item, target.dataset.key, event);
  }
}

/** "@str+d10" → "Fue+d10" usando las abreviaturas del sistema */
function prettyFormula(formula, item) {
  const abbr = {
    str: "SWADE.AttrStrShort",
    agi: "SWADE.AttrAgiShort",
    sma: "SWADE.AttrSmaShort",
    spi: "SWADE.AttrSprShort",
    vig: "SWADE.AttrVigShort"
  };
  return String(formula).replace(/@(str|agi|sma|spi|vig)\b/gi, (m, k) => {
    const key = abbr[k.toLowerCase()];
    const txt = game.i18n.localize(key);
    return txt === key ? k.charAt(0).toUpperCase() + k.slice(1).toLowerCase() : txt;
  });
}

export { CardViewer };
