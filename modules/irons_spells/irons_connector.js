// modules/irons_spells/irons_connector.js — Iron's Spells 'n' Spellbooks Connector (SHELL)
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Minimal shell connector for the Iron's Spells 'n' Spellbooks mod integration.
// Follows the same connector contract as tacz_connector.js and can be expanded
// by developers to add full Iron's Spells NPC support.
//
// TO FULLY IMPLEMENT THIS MODULE:
//   1. Fill in onNPCInteract with Iron's Spells / CNPC API calls to read
//      active spells, mana, and spell-school from the NPC's spellbook.
//   2. Add a utils/ subfolder (context_builder, spell_manager, etc.).
//   3. Ensure core/irons_models/gemini/model_brain.js is loaded (already exists).
//   4. Set "enabled": true for irons_spells in core/master_config.json.
//
// CONNECTOR CONTRACT — every connector must implement:
//   init(configPath)               — Load config; call once at startup.
//   onNPCInteract(event, callback) — Entry point for NPC interaction events.
//   onNPCRemoved(entityId)         — Cleanup when NPC leaves the world.
//
// Depends on: AIManager (must be loaded before this file)

var IronsSpellsConnector = (function() {

  var _config = null

  // ── Config loader (Java file I/O) ──────────────────────────────────────────

  function _loadConfig(configPath) {
    var file = new java.io.File(configPath)
    if (!file.exists()) {
      throw new Error("IronsSpellsConnector: irons_config.json not found at: " + configPath)
    }
    var reader = new java.io.BufferedReader(new java.io.FileReader(file))
    var sb = new java.lang.StringBuilder()
    var line
    while ((line = reader.readLine()) !== null) {
      sb.append(line).append("\n")
    }
    reader.close()
    return JSON.parse(sb.toString())
  }

  // ── Provider resolver ──────────────────────────────────────────────────────

  function _resolveProvider(entityId) {
    var assignments = _config.npc_assignments || {}
    if (assignments[entityId]) {
      var role = assignments[entityId].role || "arcanist"
      var roleConfig = (_config.roles && _config.roles[role]) ? _config.roles[role] : {}
      return roleConfig.brain_provider || _config.default_brain_provider || "gemini"
    }
    return _config.default_brain_provider || "gemini"
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {

    // Initialise the connector.
    // configPath: absolute path to modules/irons_spells/irons_config.json
    init: function(configPath) {
      _config = _loadConfig(configPath)
      LLM_LOG("IronsSpellsConnector: shell initialised. Implement onNPCInteract() to enable full functionality.")
    },

    // Handle an NPC interaction event.
    // TODO: Replace the context stub below with real Iron's Spells / CNPC API integration.
    //       Read the NPC's active spells via the Iron's Spells API and populate
    //       context.npc.equipment with the list of spell names.
    //
    // event fields: entityId, npcName, playerMsg, npcRawData, playerData, worldData, nearbyData
    // callback: function(errorMsg, responseText)
    onNPCInteract: function(event, callback) {
      var entityId   = event.entityId   || ""
      var npcName    = event.npcName    || "Arcanist"
      var playerMsg  = event.playerMsg  || ""
      var npcRawData  = event.npcRawData  || {}
      var playerData  = event.playerData  || {}
      var worldData   = event.worldData   || {}
      var nearbyData  = event.nearbyData  || {}

      var providerName = _resolveProvider(entityId)

      // Build context (replace with full spell-aware ContextBuilder when implementing)
      var context = {
        npc: {
          name:        npcRawData.name        || npcName,
          health:      (npcRawData.health      !== undefined) ? npcRawData.health      : 20,
          maxHealth:   (npcRawData.maxHealth   !== undefined) ? npcRawData.maxHealth   : 20,
          equipment:   npcRawData.equipment   || [],  // TODO: populate from Iron's Spells API
          currentTask: npcRawData.currentTask || "studying the weave"
        },
        player: {
          name:      playerData.name      || "Player",
          health:    (playerData.health    !== undefined) ? playerData.health    : 20,
          maxHealth: (playerData.maxHealth !== undefined) ? playerData.maxHealth : 20,
          heldItem:  playerData.heldItem  || "nothing"
        },
        world: {
          time:    worldData.time    || "unknown",
          weather: worldData.weather || "clear",
          biome:   worldData.biome   || "unknown"
        },
        nearby: {
          hostiles:   nearbyData.hostiles   || [],
          friendlies: nearbyData.friendlies || []
        }
      }

      AIManager.interact("irons_spells", entityId, providerName, context, playerMsg, callback)
    },

    // Clean up when an NPC leaves the world.
    onNPCRemoved: function(entityId) {
      AIManager.resetSession(entityId)
    }

  }

})()
