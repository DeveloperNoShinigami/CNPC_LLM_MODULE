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
    },

    // ── AMMO SYSTEM ──────────────────────────────────────────────────────────

    // Handle a player handing ammo to an NPC via right-click.
    // Transfers the full held stack into the NPC's offhand or first free drop slot.
    // Removes the item from the player's inventory on success.
    onAmmoGiven: function(entityId, npc, playerItem, player) {
      var success = LoadoutManager.receiveAmmoFromPlayer(entityId, npc, playerItem)
      if (success) {
        try {
          player.removeItem(playerItem, playerItem.getStackSize())
        } catch (e) {
          LLM_LOG("TACZConnector: could not remove ammo from player " + String(player.getName()) + ": " + e)
        }
        try {
          npc.getWorld().getTempdata().remove("ll_ammo_req_" + entityId)
        } catch (e2) { /* ignore */ }
        LLM_LOG("TACZConnector: ammo transferred to " + entityId)
      }
      return success
    },

    // Broadcast an ammo-low request into world tempdata for the medic to detect.
    requestAmmo: function(entityId, npc) {
      try {
        npc.getWorld().getTempdata().put("ll_ammo_req_" + entityId, "low")
        LLM_LOG("TACZConnector: ammo request from " + entityId)
      } catch (e) { LLM_LOG("TACZConnector: requestAmmo error: " + e) }
    },

    // Pre-populate a medic's free drop slots (3-5) with ammo kits for squad members.
    // Called from medic init() so the medic carries resupply stock from the start.
    prepareSquadAmmoKit: function(medicId, medicNpc) {
      try {
        var leaderStr = medicNpc.getStoreddata().get("ll_leader")
        if (!leaderStr) { return }
        var leaderId = String(leaderStr)
        var members  = FormationManager.getMembers(leaderId)
        var inv      = medicNpc.getInventory()
        var world    = medicNpc.getWorld()
        var slot     = 3  // start after the weapon/ammo slots (0-2)
        for (var i = 0; i < members.length && slot <= 5; i++) {
          var memberId = members[i]
          if (memberId === medicId) { continue }
          var ammoType = LoadoutManager.getPrimaryAmmoType(memberId)
          if (!ammoType) { continue }
          var existing = inv.getDropItem(slot)
          if (existing && !existing.isEmpty()) { slot++; if (slot > 5) { break } }
          var ammoStack = world.createItem(ammoType, 30)
          if (ammoStack) { inv.setDropItem(slot, ammoStack, 100); slot++ }
        }
      } catch (e) { LLM_LOG("TACZConnector: prepareSquadAmmoKit error: " + e) }
    },

    // Scan world tempdata for ammo requests and fulfil them using NPC refs.
    // Called on medic's resupply timer (every 3 seconds).
    checkSquadAmmoRequests: function(medicId, medicNpc) {
      try {
        var leaderStr = medicNpc.getStoreddata().get("ll_leader")
        if (!leaderStr) { return }
        var leaderId = String(leaderStr)
        var members  = FormationManager.getMembers(leaderId)
        var tempdata = medicNpc.getWorld().getTempdata()
        var world    = medicNpc.getWorld()
        for (var i = 0; i < members.length; i++) {
          var memberId = members[i]
          if (memberId === medicId) { continue }
          var reqKey = "ll_ammo_req_" + memberId
          if (!tempdata.has(reqKey)) { continue }
          var memberNpc = FormationManager.getNpcRef(leaderId, memberId)
          if (!memberNpc) { continue }
          var ammoType = LoadoutManager.getPrimaryAmmoType(memberId)
          var gave = LoadoutManager.giveAmmoToNpc(ammoType, memberNpc, memberId, world)
          if (gave) {
            tempdata.remove(reqKey)
            try { memberNpc.say("Reloading — thanks, Doc.") } catch (e2) { /* ignore */ }
            LLM_LOG("TACZConnector: medic resupplied " + memberId)
          }
        }
      } catch (e) { LLM_LOG("TACZConnector: checkSquadAmmoRequests error: " + e) }
    },

    // ── RECRUITMENT ───────────────────────────────────────────────────────────

    // Scan a 16-block radius around the leader for same-faction NPCs that have no
    // assigned leader (or are already assigned to this leader).  Registers them
    // as squad members and assigns formation positions.
    recruitNearbyTroops: function(leaderId, leaderNpc) {
      try {
        var world   = leaderNpc.getWorld()
        var lx = leaderNpc.getX(), ly = leaderNpc.getY(), lz = leaderNpc.getZ()
        var factionId = -1
        try { factionId = leaderNpc.getFaction().getId() } catch (ef) { /* no faction */ }
        var candidates = world.getNearbyEntities(lx, ly, lz, 16, 2) // 2 = NPC
        if (!candidates) { return 0 }
        var recruited = 0
        var len = 0
        try { len = candidates.size() } catch (es) { len = candidates.length || 0 }
        for (var i = 0; i < len; i++) {
          var candidate = candidates.size ? candidates.get(i) : candidates[i]
          if (!candidate || !candidate.isAlive()) { continue }
          var candidateId = String(candidate.getUUID())
          if (candidateId === leaderId) { continue }
          // Same-faction check (skip if leader has no faction)
          if (factionId !== -1) {
            try {
              var cf = candidate.getFaction ? candidate.getFaction() : null
              if (!cf || cf.getId() !== factionId) { continue }
            } catch (ef2) { continue }
          }
          // Skip if already assigned to a different leader
          try {
            var existingLeader = candidate.getStoreddata().get("ll_leader")
            if (existingLeader && String(existingLeader) !== "" && String(existingLeader) !== leaderId) {
              continue
            }
          } catch (en) { /* no stored data — candidate is eligible */ }
          FormationManager.registerMember(leaderId, candidateId)
          FormationManager.setNpcRef(leaderId, candidateId, candidate)
          try {
            candidate.getStoreddata().put("ll_leader", leaderId)
            candidate.say("Copy that — joining up.")
          } catch (es2) { /* ignore */ }
          recruited++
        }
        LLM_LOG("TACZConnector: recruited " + recruited + " troops for " + leaderId)
        return recruited
      } catch (e) {
        LLM_LOG("TACZConnector: recruitNearbyTroops error: " + e)
        return 0
      }
    },

    // ── AI COMMAND TRIGGERS ───────────────────────────────────────────────────

    // Parse an AI response for embedded [trigger] tags.
    // Returns { cleanText: String, triggers: String[] }.
    // The cleanText is the response with all trigger tags stripped (for saying aloud).
    // Known triggers: recruit, hold, engage, fallback, resupply, report, move
    parseCommandTriggers: function(responseText) {
      var triggers = []
      var text = responseText || ""
      // Match any [word] pattern that corresponds to a known command
      var knownTriggers = ["recruit", "hold", "engage", "fallback", "resupply", "report", "move"]
      for (var t = 0; t < knownTriggers.length; t++) {
        var triggerName = knownTriggers[t]
        var re = new RegExp("\\[" + triggerName + "\\]", "gi")
        if (re.test(text)) {
          triggers.push(triggerName)
          // Reset and remove all occurrences
          var re2 = new RegExp("\\[" + triggerName + "\\]", "gi")
          text = text.replace(re2, "")
        }
      }
      var cleanText = text.replace(/\s{2,}/g, " ").trim()
      return { cleanText: cleanText, triggers: triggers }
    }

  }

})()


