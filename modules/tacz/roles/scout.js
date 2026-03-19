// modules/tacz/roles/scout.js — SCOUT ROLE
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Assign this file as the script for any CNPC NPC you want to behave as an
// AI-driven Scout.  Follows orders from the player (master) or the squad
// leader.  Moves ahead to gather intel and mark enemy positions.
//
// Default loadout (tacz_config.json): MP5 / Glock 17 / Combat Knife

var _API          = Java.type("noppes.npcs.api.NpcAPI")
var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"

load(LLM_BASE_PATH + "/core/loader.js")

var _g = LLM_BASE_PATH + "/modules/tacz/ai_goals/"
load(_g + "scout_area.js")
load(_g + "report_contacts.js")
load(_g + "follow_leader_formation.js")
load(_g + "engage_hostiles.js")
load(_g + "follow_player_on_order.js")
load(_g + "reload_gun.js")
load(_g + "request_ammo.js")

var SCOUT_ROLE = {
  roleId:          "scout",
  moduleId:        "tacz",
  brainProvider:   "gemini",
  defaultTask:     "scouting ahead",
  squadLeaderId:   null,
  goals:           ["scout_area", "report_contacts", "follow_leader_formation",
                    "engage_hostiles", "follow_player_on_order",
                    "reload_gun", "request_ammo"]
}

GoalsLoader.setRoleGoals(SCOUT_ROLE.roleId, SCOUT_ROLE.goals)

function init(event) {
  var entityId = String(event.npc.getUUID())
  var npcName  = String(event.npc.getName())
  BrainRegistry.register(entityId, SCOUT_ROLE.moduleId, SCOUT_ROLE.roleId)
  LoadoutManager.initNPC(entityId, SCOUT_ROLE.roleId, event.npc)
  _restoreLeaderLink(entityId, event.npc)
  if (SCOUT_ROLE.squadLeaderId) {
    TACZConnector.setSquadLeader(entityId, SCOUT_ROLE.squadLeaderId)
    TACZConnector.setNpcRef(SCOUT_ROLE.squadLeaderId, entityId, event.npc)
  }
  event.npc.getTimers().forceStart(10, 300, true)
  LLM_LOG("Scout '" + npcName + "' (" + entityId + ") initialised.")
}

function timer(event) {
  if (event.id === 10) {
    var entityId = String(event.npc.getUUID())
    if (LoadoutManager.isAmmoLow(event.npc, 5)) {
      event.npc.say("Ammo low — requesting resupply.")
      TACZConnector.requestAmmo(entityId, event.npc)
    }
  }
}

function interact(event) {
  try {
    var heldItem = event.player.getMainhandItem ? event.player.getMainhandItem() : null
    if (heldItem && !heldItem.isEmpty()) {
      if (TimelessAPI.getOptionalAmmo(heldItem) != null) {
        var given = TACZConnector.onAmmoGiven(String(event.npc.getUUID()), event.npc, heldItem, event.player)
        if (given) { event.npc.say("Appreciated. Loading up."); return }
      }
    }
  } catch (ammoErr) { /* TimelessAPI unavailable — fall through to dialog */ }

  var entityId  = String(event.npc.getUUID())
  var npcName   = String(event.npc.getName())
  var playerMsg = event.message ? String(event.message) : ""

  var rawNPC = {
    name:        npcName,
    health:      event.npc.getHealth(),
    maxHealth:   event.npc.getMaxHealth(),
    equipment:   LoadoutManager.toEquipmentArray(entityId, event.npc),
    currentTask: SCOUT_ROLE.defaultTask
  }

  var context = ContextBuilder.build({
    npcData:    rawNPC,
    playerData: _buildPlayerData(event.player),
    worldData:  _getWorldData(event.npc),
    nearbyData: {"hostiles": [], "friendlies": []}
  })

  TACZConnector.handleRoleInteraction(
    SCOUT_ROLE, entityId, context, playerMsg,
    function(err, response) {
      if (err) { LLM_LOG("Scout[" + npcName + "] error: " + err); event.npc.say("Moving up — stay sharp."); return }
      event.npc.say(response)
    }
  )
}

function removed(event) {
  var entityId = String(event.npc.getUUID())
  LoadoutManager.saveStateOnRemoval(entityId, event.npc)
  TACZConnector.onNPCRemoved(entityId)
  LLM_LOG("Scout '" + String(event.npc.getName()) + "' removed — state preserved.")
}

function died(event) {
  var entityId = String(event.npc.getUUID())
  TACZConnector.onNPCDied(entityId)
  LLM_LOG("Scout '" + String(event.npc.getName()) + "' died — loadout cleared.")
}

function _restoreLeaderLink(entityId, npc) {
  try {
    var stored    = npc.getStoreddata()
    var leaderStr = stored.has("ll_leader") ? String(stored.get("ll_leader")) : ""
    if (leaderStr && leaderStr !== "") {
      FormationManager.registerMember(leaderStr, entityId)
      FormationManager.setNpcRef(leaderStr, entityId, npc)
    }
  } catch (e) { /* ignore */ }
}

function _buildPlayerData(player) {
  try {
    var stack = player.getMainhandItem ? player.getMainhandItem() : null
    var held  = (stack && !stack.isEmpty()) ? String(stack.getDisplayName()) : "nothing"
    return { name: String(player.getName()), health: player.getHealth(), maxHealth: player.getMaxHealth(), heldItem: held }
  } catch(e) { return { name: "Player", health: 20, maxHealth: 20, heldItem: "nothing" } }
}

function _getWorldData(npc) {
  try {
    var w = npc.getWorld ? npc.getWorld() : null
    if (!w) { return {"time": "unknown", "weather": "clear", "biome": "unknown"} }
    var biome = "unknown"
    try { biome = String(w.getBiomeName(npc.getBlockX(), npc.getBlockZ())) } catch(e2) { /* ignore */ }
    return {"time": w.getTime ? w.getTime() : 0, "weather": w.isRaining && w.isRaining() ? "rain" : "clear", "biome": biome}
  } catch(e) { return {"time": "unknown", "weather": "clear", "biome": "unknown"} }
}

