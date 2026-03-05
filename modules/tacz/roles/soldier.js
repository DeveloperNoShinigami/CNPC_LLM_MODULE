// modules/tacz/roles/soldier.js — SOLDIER ROLE
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// ── HOW TO USE ───────────────────────────────────────────────────────────────
// Assign this file as the script for any CNPC NPC you want to behave as an
// AI-driven Soldier.  No other setup is needed on a per-NPC basis.
//
// The script resolves its own path using the CNPC NpcAPI so it works
// identically in single-player and on a dedicated server.
//
// ── WHAT THIS SCRIPT DOES ────────────────────────────────────────────────────
//   1. Resolves LLM_BASE_PATH via NpcAPI.getLevelDir().
//   2. Loads the entire LLM_MODULE_SYSTEM via loader.js (once per session).
//   3. Loads role-specific ai_goals files and declares them via GoalsLoader.
//   4. Initialises NPC loadout (respects existing items / persisted state).
//   5. Wires up CNPC event hooks: init(), interact(), timer(), removed(), died().
//
// ── SOLDIER ROLE ─────────────────────────────────────────────────────────────
//   Persona   : Disciplined, follows orders — executes tasks and reports status.
//   Loadout   : AK-47 / M1911 / Combat Knife  (configurable in tacz_config.json)
//   Goals     : patrol, engage_hostiles, follow_player_on_order,
//               suppress_hostiles, follow_leader_formation,
//               reload_gun, request_ammo
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Path resolution ────────────────────────────────────────────────────────
var _API          = Java.type("noppes.npcs.api.NpcAPI")
var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"

// ── 2. Load core system (guard inside loader.js prevents double-loading) ──────
load(LLM_BASE_PATH + "/core/loader.js")

// ── 3. Load role-specific goals ───────────────────────────────────────────────
var _g = LLM_BASE_PATH + "/modules/tacz/ai_goals/"
load(_g + "patrol.js")
load(_g + "engage_hostiles.js")
load(_g + "follow_player_on_order.js")
load(_g + "suppress_hostiles.js")
load(_g + "follow_leader_formation.js")
load(_g + "reload_gun.js")
load(_g + "request_ammo.js")

// ── 4. Role configuration ─────────────────────────────────────────────────────
var SOLDIER_ROLE = {
  roleId:        "soldier",
  moduleId:      "tacz",
  brainProvider: "gemini",
  defaultTask:   "standing by for orders",
  goals:         ["patrol", "engage_hostiles", "follow_player_on_order",
                  "suppress_hostiles", "follow_leader_formation",
                  "reload_gun", "request_ammo"]
}

// Register goals declared above with GoalsLoader for this roleId
GoalsLoader.setRoleGoals(SOLDIER_ROLE.roleId, SOLDIER_ROLE.goals)

// ── CNPC EVENT HOOKS ──────────────────────────────────────────────────────────

// init() — fires when the NPC loads or the server starts.
function init(event) {
  var entityId = String(event.npc.getUUID())
  var npcName  = String(event.npc.getName())
  BrainRegistry.register(entityId, SOLDIER_ROLE.moduleId, SOLDIER_ROLE.roleId)
  // Apply loadout only if NPC has no weapon and no persisted state
  LoadoutManager.initNPC(entityId, SOLDIER_ROLE.roleId, event.npc)
  // Restore NBT-persisted leader reference into FormationManager
  _restoreLeaderLink(entityId, event.npc)
  // Ammo-check timer: every 15 s (300 ticks), repeating
  event.npc.getTimers().forceStart(10, 300, true)
  LLM_LOG("Soldier '" + npcName + "' (" + entityId + ") initialised.")
}

// timer() — fires on NPC timers.
function timer(event) {
  if (event.id === 10) {
    var entityId = String(event.npc.getUUID())
    if (LoadoutManager.isAmmoLow(event.npc, 5)) {
      event.npc.say("Running low on ammo — requesting resupply.")
      TACZConnector.requestAmmo(entityId, event.npc)
    }
  }
}

// interact() — fires on player right-click or CNPC dialog message.
function interact(event) {
  // ── Ammo hand-off: player right-clicks while holding ammo ─────────────────
  var heldItem = event.player.getMainhandItem ? event.player.getMainhandItem() : null
  if (heldItem && !heldItem.isEmpty()) {
    if (TimelessAPI.getOptionalAmmo(heldItem) != null) {
      var given = TACZConnector.onAmmoGiven(String(event.npc.getUUID()), event.npc, heldItem, event.player)
      if (given) {
        event.npc.say("Thanks. Reloading now.")
        return
      }
    }
  }

  var entityId  = String(event.npc.getUUID())
  var npcName   = String(event.npc.getName())
  var playerMsg = event.message ? String(event.message) : ""

  var loadoutEquip = LoadoutManager.toEquipmentArray(entityId, event.npc)

  var rawNPC = {
    name:        npcName,
    health:      event.npc.getHealth(),
    maxHealth:   event.npc.getMaxHealth(),
    equipment:   loadoutEquip,
    currentTask: SOLDIER_ROLE.defaultTask
  }

  var rawPlayer = {
    name:      String(event.player.getName()),
    health:    event.player.getHealth(),
    maxHealth: event.player.getMaxHealth(),
    heldItem:  _getHeldItemName(event.player)
  }

  var context = ContextBuilder.build({
    npcData:    rawNPC,
    playerData: rawPlayer,
    worldData:  _getWorldData(event.npc),
    nearbyData: _getNearbyData(event.npc)
  })

  TACZConnector.handleRoleInteraction(
    SOLDIER_ROLE,
    entityId,
    context,
    playerMsg,
    function(err, response) {
      if (err) {
        LLM_LOG("Soldier[" + npcName + "] error: " + err)
        event.npc.say("(static) Copy that — stand by.")
        return
      }
      event.npc.say(response)
    }
  )
}

// removed() — fires on despawn / chunk unload (NOT death).
// Saves inventory state so the loadout survives reload.
function removed(event) {
  var entityId = String(event.npc.getUUID())
  LoadoutManager.saveStateOnRemoval(entityId, event.npc)
  TACZConnector.onNPCRemoved(entityId)
  LLM_LOG("Soldier '" + String(event.npc.getName()) + "' removed — state preserved.")
}

// died() — fires on actual NPC death.
// Clears loadout state so the NPC gets a fresh loadout on next spawn.
function died(event) {
  var entityId = String(event.npc.getUUID())
  TACZConnector.onNPCDied(entityId)
  LLM_LOG("Soldier '" + String(event.npc.getName()) + "' died — loadout cleared for respawn.")
}

// ── Private helpers ───────────────────────────────────────────────────────────

// Re-register with FormationManager if a leader UUID was persisted in stored data.
function _restoreLeaderLink(entityId, npc) {
  try {
    var stored     = npc.getStoreddata()
    var leaderStr  = stored.has("ll_leader") ? String(stored.get("ll_leader")) : ""
    if (leaderStr && leaderStr !== "") {
      FormationManager.registerMember(leaderStr, entityId)
      FormationManager.setNpcRef(leaderStr, entityId, npc)
      LLM_LOG("Soldier " + entityId + " restored link to leader " + leaderStr)
    }
  } catch (e) { /* stored data not accessible */ }
}

function _getHeldItemName(player) {
  try {
    var stack = player.getMainhandItem ? player.getMainhandItem() : null
    if (stack && !stack.isEmpty()) { return String(stack.getDisplayName()) }
  } catch (e) { /* ignore */ }
  return "nothing"
}

function _getWorldData(npc) {
  try {
    var w = npc.getWorld ? npc.getWorld() : null
    if (!w) { return {"time": "unknown", "weather": "clear", "biome": "unknown"} }
    var ticks   = w.getTime ? w.getTime() : 0
    var weather = w.isRaining ? (w.isRaining() ? "rain" : "clear") : "clear"
    var biome   = "unknown"
    try { biome = String(w.getBiomeName(npc.getBlockX(), npc.getBlockZ())) } catch(e2) { /* ignore */ }
    return {"time": ticks, "weather": weather, "biome": biome}
  } catch (e) {
    return {"time": "unknown", "weather": "clear", "biome": "unknown"}
  }
}

function _getNearbyData(npc) {
  return {"hostiles": [], "friendlies": []}
}

