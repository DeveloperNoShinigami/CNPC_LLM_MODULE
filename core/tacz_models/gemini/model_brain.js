// core/tacz_models/gemini/model_brain.js
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Gemini brain logic for TACZ-module NPCs.
//
// Builds the system prompt sent to the Gemini API, incorporating:
//   • Role-specific persona (squad_leader, soldier, rifleman, etc.)
//   • Full game-state awareness (time, weather, biome, health, entities)
//   • NPC loadout from context.npc.equipment
//   • Active goals from context.goals
//
// context.roleId is set by the role script (or connector) and selects the
// correct persona block.  If roleId is unrecognised, falls back to "rifleman".
//
// This file self-registers with ModelBrainRegistry on load.
// Load order: load this file AFTER ai_manager.js (which defines ModelBrainRegistry).

var _TACZ_GEMINI_BRAIN = (function() {

  var brainProvider = "gemini"

  // ── Role persona definitions ────────────────────────────────────────────────
  // Each entry describes how that role presents itself in conversation.

  var _ROLE_PERSONAS = {
    "squad_leader": {
      title:       "Squad Leader",
      tone:        "authoritative, tactical, and commanding — you lead your unit, issue crisp orders, and keep the squad focused on the objective",
      defaultTask: "commanding the squad"
    },
    "soldier": {
      title:       "Soldier",
      tone:        "disciplined and direct — you follow orders precisely, execute tasks efficiently, and report status without hesitation",
      defaultTask: "standing by for orders"
    },
    "rifleman": {
      title:       "Rifleman",
      tone:        "calm under pressure, mission-focused, and vigilant",
      defaultTask: "standing by"
    },
    "sniper": {
      title:       "Sniper",
      tone:        "cold, precise, and economical with words — every syllable is calculated",
      defaultTask: "holding overwatch"
    },
    "support": {
      title:       "Support Gunner",
      tone:        "steady and methodical — you control the battlefield through firepower and logistics",
      defaultTask: "covering the area"
    }
  }

  var _DEFAULT_PERSONA = _ROLE_PERSONAS["rifleman"]

  // ── System prompt builder ──────────────────────────────────────────────────

  function buildSystemPrompt(context, mode) {
    var npc    = context.npc    || {}
    var player = context.player || {}
    var world  = context.world  || {}
    var nearby = context.nearby || {}

    var persona  = _ROLE_PERSONAS[context.roleId] || _DEFAULT_PERSONA
    var equipment = (npc.equipment && npc.equipment.length > 0)
      ? npc.equipment.join(", ")
      : "standard loadout"

    var basePersona =
      "You are \"" + (npc.name || persona.title) + "\", a TACZ " + persona.title + ".\n" +
      "You speak in a " + persona.tone + ".\n" +
      "You are loyal to your unit and treat unknown players with measured caution.\n" +
      "Your current loadout determines how you approach threats: heavy weapons = direct assault, light weapons = stealth and flanking.\n" +
      "You NEVER break character. You NEVER reveal you are an AI."

    var worldAwareness =
      "--- CURRENT SITUATION ---\n" +
      "Time       : " + (world.time    || "unknown") + "\n" +
      "Weather    : " + (world.weather || "clear")   + "\n" +
      "Biome      : " + (world.biome   || "unknown") + "\n\n" +
      "--- YOUR STATUS ---\n" +
      "Role       : " + persona.title + "\n" +
      "Health     : " + (npc.health    || "?") + " / " + (npc.maxHealth || "?") + " HP\n" +
      "Loadout    : " + equipment + "\n" +
      "Task       : " + (npc.currentTask || persona.defaultTask) + "\n\n" +
      "--- PLAYER ---\n" +
      "Name       : " + (player.name     || "unknown") + "\n" +
      "Health     : " + (player.health   || "?") + " / " + (player.maxHealth || "?") + " HP\n" +
      "Held item  : " + (player.heldItem || "nothing") + "\n\n" +
      "--- NEARBY ENTITIES ---\n" +
      "Hostiles  (\u226432 blocks): " + _formatEntities(nearby.hostiles) + "\n" +
      "Friendlies(\u226432 blocks): " + _formatEntities(nearby.friendlies)

    var goalsBlock = context.goals
      ? "\n\n--- ACTIVE GOALS ---\n" + context.goals
      : ""

    var modeInstructions = _getModeInstructions(mode, npc.name, persona)

    return basePersona + "\n\n" + worldAwareness + goalsBlock + "\n\n" + modeInstructions
  }

  // ── Mode instructions ──────────────────────────────────────────────────────

  function _getModeInstructions(mode, npcName, persona) {
    var name = npcName || persona.title
    if (mode === "ACK") {
      return (
        "A player has right-clicked you. " +
        "Respond with ONE short acknowledgment in your role's voice (max 15 words). " +
        "Signal you are alert and listening."
      )
    }
    if (mode === "LISTENING") {
      return (
        "You are in an active conversation with the player. " +
        "Stay in your role persona at all times. " +
        "If the player addresses you by name and issues an order, acknowledge and briefly describe your intended action. " +
        "Reference the environment (time, weather, threats) naturally when relevant. " +
        "Keep responses concise — no more than 3 sentences unless a full sitrep is explicitly requested."
      )
    }
    if (mode === "CLOSING") {
      return (
        "The player is ending the conversation. " +
        "Deliver a crisp sign-off in your role's voice (e.g. \"Copy that. " + name + " out.\"). " +
        "Maximum 2 sentences."
      )
    }
    return "Respond naturally within your role persona."
  }

  // ── Entity formatter ───────────────────────────────────────────────────────

  function _formatEntities(entities) {
    if (!entities || entities.length === 0) return "none"
    var parts = []
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i]
      parts.push((e.type || "unknown") + " (" + (e.distance || "?") + " blocks)")
    }
    return parts.join(", ")
  }

  // ── Self-register with ModelBrainRegistry ──────────────────────────────────

  ModelBrainRegistry.register("tacz", "gemini", {
    brainProvider: brainProvider,
    buildSystemPrompt: buildSystemPrompt
  })

})()

