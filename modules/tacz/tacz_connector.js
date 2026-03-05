// modules/tacz/tacz_connector.js — TACZ Module Connector
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Bridge between TACZ NPCs and the Core AI Manager.
//
// This connector:
//   1. Loads tacz_config.json via Java file I/O and inits GoalsLoader.
//   2. Resolves the NPC's role and AI provider from tacz_config.
//   3. Builds a rich game-state context via ContextBuilder.
//   4. Enriches context with loadout data from LoadoutManager.
//   5. Forwards the interaction to AIManager.interact() with the correct
//      providerName so the master manager routes to
//      core/tacz_models/[providerName]/model_brain.js.
//   6. Returns the AI-generated response via callback.
//
// CONNECTOR CONTRACT — every connector must implement:
//   init(configPath)                          — Load config; call once at startup.
//   onNPCInteract(event, callback)            — Main entry point for NPC events.
//   onNPCRemoved(entityId)                    — Cleanup when NPC leaves the world.
//
// Depends on (must be loaded before this file):
//   ContextBuilder, LoadoutManager, GoalsLoader, AIManager

var TACZConnector = (function() {

  var _config = null

  // ── Config loader (Java file I/O) ──────────────────────────────────────────

  function _loadConfig(configPath) {
    var file = new java.io.File(configPath)
    if (!file.exists()) {
      throw new Error("TACZConnector: tacz_config.json not found at: " + configPath)
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

  // ── Role resolver ──────────────────────────────────────────────────────────

  function _resolveAssignment(entityId) {
    var assignments = _config.npc_assignments || {}
    if (assignments[entityId]) {
      var a = assignments[entityId]
      var role = a.role || "rifleman"
      var roleConfig = (_config.roles && _config.roles[role]) ? _config.roles[role] : {}
      return {
        role:           role,
        brain_provider: roleConfig.brain_provider || _config.default_brain_provider || "gemini"
      }
    }
    var defaultRole = "rifleman"
    var defaultRoleConfig = (_config.roles && _config.roles[defaultRole]) ? _config.roles[defaultRole] : {}
    return {
      role:           defaultRole,
      brain_provider: defaultRoleConfig.brain_provider || _config.default_brain_provider || "gemini"
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {

    // Initialise the connector.
    // configPath: absolute path to modules/tacz/tacz_config.json
    // Call once at server / script startup.
    init: function(configPath) {
      _config = _loadConfig(configPath)
      GoalsLoader.init(_config)
      LLM_LOG("TACZConnector: initialised.")
    },

    // Handle an NPC interaction event (right-click or chat message directed at NPC).
    //
    // event fields:
    //   entityId   : string  — Unique NPC entity ID
    //   npcName    : string  — Display name of the NPC
    //   playerMsg  : string  — Player's message ("" on right-click / first contact)
    //   npcRawData : object  — Raw NPC data from CNPC API
    //   playerData : object  — Raw player data
    //   worldData  : object  — Raw world/environment data
    //   nearbyData : object  — Raw nearby-entity data
    //
    // callback: function(errorMsg, responseText)
    onNPCInteract: function(event, callback) {
      var entityId   = event.entityId   || ""
      var npcName    = event.npcName    || "Soldier"
      var playerMsg  = event.playerMsg  || ""
      var npcRawData  = event.npcRawData  || {}
      var playerData  = event.playerData  || {}
      var worldData   = event.worldData   || {}
      var nearbyData  = event.nearbyData  || {}

      // 1. Resolve role and provider
      var assignment    = _resolveAssignment(entityId)
      var providerName  = assignment.brain_provider

      // 2. Enrich NPC data with loadout
      var loadoutEquip = LoadoutManager.toEquipmentArray(entityId)
      var enrichedNPC  = {
        name:        npcRawData.name        || npcName,
        health:      (npcRawData.health      !== undefined) ? npcRawData.health      : 20,
        maxHealth:   (npcRawData.maxHealth   !== undefined) ? npcRawData.maxHealth   : 20,
        equipment:   (loadoutEquip.length > 0) ? loadoutEquip : (npcRawData.equipment || []),
        currentTask: npcRawData.currentTask || "standing by"
      }

      // 3. Build game-state context
      var context = ContextBuilder.build({
        npcData:    enrichedNPC,
        playerData: playerData,
        worldData:  worldData,
        nearbyData: nearbyData
      })

      // Attach role goals for optional use by model_brain
      context.goals = GoalsLoader.formatForPrompt(assignment.role)

      // 4. Forward to AIManager
      AIManager.interact("tacz", entityId, providerName, context, playerMsg, callback)
    },

    // Handle an NPC being removed from the world (death, despawn, chunk unload).
    onNPCRemoved: function(entityId) {
      LoadoutManager.remove(entityId)
      AIManager.resetSession(entityId)
    }

  }

})()

