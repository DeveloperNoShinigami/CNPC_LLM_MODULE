// modules/tacz/tacz_connector.js — TACZ Module Connector
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Bridge between TACZ NPCs and the Core AI Manager.
//
// ── ENTRY POINTS ─────────────────────────────────────────────────────────────
//
//   handleRoleInteraction(roleConfig, entityId, context, playerMsg, callback)
//     → Used by role scripts in modules/tacz/roles/.  The role script has
//       already built the context from CNPC API data; the connector attaches
//       goals + formation context and forwards to AIManager.
//
//   onNPCInteract(event, callback)
//     → Legacy / fallback path.  Resolves role as "rifleman" by default.
//
// ── CONNECTOR CONTRACT ───────────────────────────────────────────────────────
//   init(configPath)                                  — Load config; call once.
//   handleRoleInteraction(role, id, ctx, msg, cb)     — Role-script entry point.
//   onNPCInteract(event, callback)                    — Legacy entry point.
//   onNPCRemoved(entityId)                            — Cleanup on despawn (not death).
//   onNPCDied(entityId)                               — Cleanup on actual death.
//   onLeaderDied(leaderId)                            — Disband squad on leader death.
//   setSquadLeader(memberId, leaderId)                — Register squad membership.
//   setFormation(leaderId, formationType)             — Change formation.
//   updateFormation(leaderId, leaderNpc)              — Reposition squad members.
//
// Depends on (must be loaded before this file):
//   ContextBuilder, LoadoutManager, GoalsLoader, FormationManager, AIManager

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
      LoadoutManager.init(_config)
      LLM_LOG("TACZConnector: initialised.")
    },

    // ── ROLE-SCRIPT ENTRY POINT ─────────────────────────────────────────────
    // Called by role scripts after building the game-state context.
    //
    // roleConfig : { roleId, moduleId, brainProvider, squadLeaderId? }
    // entityId   : string  — NPC entity UUID
    // context    : game-state context from ContextBuilder.build()
    // playerMsg  : string  — player's message ("" on right-click)
    // callback   : function(errorMsg, responseText)
    handleRoleInteraction: function(roleConfig, entityId, context, playerMsg, callback) {
      var roleId       = roleConfig.roleId        || "soldier"
      var providerName = roleConfig.brainProvider || (_config ? _config.default_brain_provider : "gemini") || "gemini"

      // Attach goals from the GoalsLoader (file-based goals take priority)
      context.goals  = GoalsLoader.formatForPrompt(roleId)
      context.roleId = roleId

      // Attach formation context if this NPC belongs to a squad
      var leaderId = roleConfig.squadLeaderId || null
      if (leaderId) {
        context.squadLeaderId = leaderId
        context.formation     = FormationManager.getFormation(leaderId)
      }

      AIManager.interact("tacz", entityId, providerName, context, playerMsg, callback)
    },

    // ── LEGACY / FALLBACK ENTRY POINT ───────────────────────────────────────
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

    // ── REMOVAL / DEATH HANDLERS ─────────────────────────────────────────────

    // Handle an NPC being removed from the world (despawn, chunk unload — NOT death).
    // Role scripts must call LoadoutManager.saveStateOnRemoval(entityId, event.npc)
    // in their removed(event) handler BEFORE calling this method, so the inventory
    // snapshot is captured while the NPC entity is still accessible.
    onNPCRemoved: function(entityId) {
      FormationManager.removeMember(entityId)
      LoadoutManager.remove(entityId)
      AIManager.resetSession(entityId)
    },

    // Handle an NPC actually dying.  Clears loadout so next spawn gets a fresh one.
    onNPCDied: function(entityId) {
      FormationManager.removeMember(entityId)
      LoadoutManager.clearOnDeath(entityId)
      AIManager.resetSession(entityId)
    },

    // Handle the squad leader dying.  Disbands the squad and clears the leader's state.
    onLeaderDied: function(leaderId) {
      FormationManager.disbandSquad(leaderId)
      LoadoutManager.clearOnDeath(leaderId)
      AIManager.resetSession(leaderId)
    },

    // ── SQUAD / FORMATION HELPERS ────────────────────────────────────────────

    // Link a squad member to their squad leader.
    // Call from the squad member's init() handler.
    setSquadLeader: function(memberId, leaderId) {
      FormationManager.registerMember(leaderId, memberId)
    },

    // Cache a live NPC reference for formation navigation.
    // Call from init() after setSquadLeader().
    setNpcRef: function(leaderId, entityId, npc) {
      FormationManager.setNpcRef(leaderId, entityId, npc)
    },

    // Change the formation type for a squad.
    setFormation: function(leaderId, formationType) {
      FormationManager.setFormation(leaderId, formationType)
    },

    // Reposition squad members into formation around the leader.
    updateFormation: function(leaderId, leaderNpc) {
      FormationManager.updateFormation(leaderId, leaderNpc)
    }

  }

})()


