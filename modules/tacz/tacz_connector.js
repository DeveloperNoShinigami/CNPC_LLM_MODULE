// modules/tacz/tacz_connector.js — TACZ Module Connector
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Bridge between TACZ NPCs and the Core AI Manager.
//
// ── TWO ENTRY POINTS ─────────────────────────────────────────────────────────
//
//   handleRoleInteraction(roleConfig, entityId, context, playerMsg, callback)
//     → Used by role scripts in modules/tacz/roles/.  The role script has
//       already built the context from CNPC API data; the connector just
//       attaches goals and forwards to AIManager.
//
//   onNPCInteract(event, callback)
//     → Legacy / fallback path.  Resolves role from the config file when no
//       dedicated role script is attached to the NPC.
//
// ── CONNECTOR CONTRACT ───────────────────────────────────────────────────────
//   init(configPath)                                  — Load config; call once.
//   handleRoleInteraction(role, id, ctx, msg, cb)     — Role-script entry point.
//   onNPCInteract(event, callback)                    — Legacy entry point.
//   onNPCRemoved(entityId)                            — Cleanup on despawn/death.
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

  // ── Legacy role resolver (for onNPCInteract fallback path) ────────────────

  function _resolveAssignment(entityId) {
    var defaultRole       = "rifleman"
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
    // Called automatically by loader.js.
    init: function(configPath) {
      _config = _loadConfig(configPath)
      GoalsLoader.init(_config)
      LLM_LOG("TACZConnector: initialised.")
    },

    // ── ROLE-SCRIPT ENTRY POINT ─────────────────────────────────────────────
    // Called by role scripts in modules/tacz/roles/ after they have built the
    // game-state context from CNPC API data.
    //
    // roleConfig : object  — { roleId, moduleId, brainProvider }
    // entityId   : string  — NPC entity UUID
    // context    : object  — game-state context from ContextBuilder.build()
    // playerMsg  : string  — player's message ("" on right-click / first contact)
    // callback   : function(errorMsg, responseText)
    handleRoleInteraction: function(roleConfig, entityId, context, playerMsg, callback) {
      var roleId       = roleConfig.roleId        || "soldier"
      var providerName = roleConfig.brainProvider || (_config ? _config.default_brain_provider : "gemini") || "gemini"

      // Attach goals to context so the model_brain can embed them in the prompt
      context.goals  = GoalsLoader.formatForPrompt(roleId)
      context.roleId = roleId

      AIManager.interact("tacz", entityId, providerName, context, playerMsg, callback)
    },

    // ── LEGACY / FALLBACK ENTRY POINT ───────────────────────────────────────
    // Used when no dedicated role script is assigned to the NPC.
    // Resolves the role as "rifleman" by default.
    //
    // event fields:
    //   entityId, npcName, playerMsg, npcRawData, playerData, worldData, nearbyData
    onNPCInteract: function(event, callback) {
      var entityId   = event.entityId   || ""
      var npcName    = event.npcName    || "Soldier"
      var playerMsg  = event.playerMsg  || ""
      var npcRawData  = event.npcRawData  || {}
      var playerData  = event.playerData  || {}
      var worldData   = event.worldData   || {}
      var nearbyData  = event.nearbyData  || {}

      var assignment   = _resolveAssignment(entityId)
      var providerName = assignment.brain_provider

      var loadoutEquip = LoadoutManager.toEquipmentArray(entityId)
      var enrichedNPC  = {
        name:        npcRawData.name        || npcName,
        health:      (npcRawData.health      !== undefined) ? npcRawData.health      : 20,
        maxHealth:   (npcRawData.maxHealth   !== undefined) ? npcRawData.maxHealth   : 20,
        equipment:   (loadoutEquip.length > 0) ? loadoutEquip : (npcRawData.equipment || []),
        currentTask: npcRawData.currentTask || "standing by"
      }

      var context = ContextBuilder.build({
        npcData:    enrichedNPC,
        playerData: playerData,
        worldData:  worldData,
        nearbyData: nearbyData
      })

      context.goals  = GoalsLoader.formatForPrompt(assignment.role)
      context.roleId = assignment.role

      AIManager.interact("tacz", entityId, providerName, context, playerMsg, callback)
    },

    // Handle an NPC being removed from the world (death, despawn, chunk unload).
    onNPCRemoved: function(entityId) {
      LoadoutManager.remove(entityId)
      AIManager.resetSession(entityId)
    }

  }

})()

