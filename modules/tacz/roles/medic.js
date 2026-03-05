// modules/tacz/roles/medic.js — MEDIC ROLE
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Assign this file as the script for any CNPC NPC you want to behave as an
// AI-driven Combat Medic.  Follows orders from the player (master) or the
// squad leader.  Prioritises treating wounded allies and resupplying ammo.
//
// ── AMMO RESUPPLY SYSTEM ─────────────────────────────────────────────────────
//   • Timer 10 (300 ticks / 15 s): own ammo-low check + broadcast request
//   • Timer 11  (60 ticks /  3 s): scan squad for ammo requests and fulfil them
//   • Drop slots 3-5 are reserved for carrying squad ammo kits
//   • Player right-clicks medic with ammo → transferred to medic's inventory
//
// Default loadout (tacz_config.json): MP5 / Glock 17 / Combat Knife

var _API          = Java.type("noppes.npcs.api.NpcAPI")
var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"

load(LLM_BASE_PATH + "/core/loader.js")

var _g = LLM_BASE_PATH + "/modules/tacz/ai_goals/"
load(_g + "treat_wounded.js")
load(_g + "resupply_allies.js")
load(_g + "follow_leader_formation.js")
load(_g + "follow_player_on_order.js")
load(_g + "engage_hostiles.js")
load(_g + "reload_gun.js")
load(_g + "request_ammo.js")

var MEDIC_ROLE = {
  roleId:          "medic",
  moduleId:        "tacz",
  brainProvider:   "gemini",
  defaultTask:     "treating wounded and managing squad resupply",
  squadLeaderId:   null,
  goals:           ["treat_wounded", "resupply_allies", "follow_leader_formation",
                    "follow_player_on_order", "engage_hostiles",
                    "reload_gun", "request_ammo"]
}

GoalsLoader.setRoleGoals(MEDIC_ROLE.roleId, MEDIC_ROLE.goals)

function init(event) {
  var entityId = String(event.npc.getUUID())
  var npcName  = String(event.npc.getName())
  BrainRegistry.register(entityId, MEDIC_ROLE.moduleId, MEDIC_ROLE.roleId)
  LoadoutManager.initNPC(entityId, MEDIC_ROLE.roleId, event.npc)
  _restoreLeaderLink(entityId, event.npc)
  if (MEDIC_ROLE.squadLeaderId) {
    TACZConnector.setSquadLeader(entityId, MEDIC_ROLE.squadLeaderId)
    TACZConnector.setNpcRef(MEDIC_ROLE.squadLeaderId, entityId, event.npc)
  }
  // Pre-populate ammo kits for any squad members already registered
  TACZConnector.prepareSquadAmmoKit(entityId, event.npc)
  // Timer 10: own ammo check every 15 s
  event.npc.getTimers().forceStart(10, 300, true)
  // Timer 11: resupply scan every 3 s
  event.npc.getTimers().forceStart(11, 60, true)
  LLM_LOG("Medic '" + npcName + "' (" + entityId + ") initialised.")
}

function timer(event) {
  if (event.id === 10) {
    var entityId = String(event.npc.getUUID())
    if (LoadoutManager.isAmmoLow(event.npc, 5)) {
      event.npc.say("Low on ammo — requesting resupply.")
      TACZConnector.requestAmmo(entityId, event.npc)
    }
  }
  if (event.id === 11) {
    // Fulfil ammo requests from squad members
    TACZConnector.checkSquadAmmoRequests(String(event.npc.getUUID()), event.npc)
  }
}

function interact(event) {
  // Ammo hand-off check
  var heldItem = event.player.getMainhandItem ? event.player.getMainhandItem() : null
  if (heldItem && !heldItem.isEmpty()) {
    if (TimelessAPI.getOptionalAmmo(heldItem) != null) {
      var given = TACZConnector.onAmmoGiven(String(event.npc.getUUID()), event.npc, heldItem, event.player)
      if (given) { event.npc.say("Stocked. Squad will be covered."); return }
    }
  }

  var entityId  = String(event.npc.getUUID())
  var npcName   = String(event.npc.getName())
  var playerMsg = event.message ? String(event.message) : ""

  var rawNPC = {
    name:        npcName,
    health:      event.npc.getHealth(),
    maxHealth:   event.npc.getMaxHealth(),
    equipment:   LoadoutManager.toEquipmentArray(entityId, event.npc),
    currentTask: MEDIC_ROLE.defaultTask
  }

  var context = ContextBuilder.build({
    npcData:    rawNPC,
    playerData: _buildPlayerData(event.player),
    worldData:  _getWorldData(event.npc),
    nearbyData: {"hostiles": [], "friendlies": []}
  })

  TACZConnector.handleRoleInteraction(
    MEDIC_ROLE, entityId, context, playerMsg,
    function(err, response) {
      if (err) { LLM_LOG("Medic[" + npcName + "] error: " + err); event.npc.say("Hold on — patching up."); return }
      event.npc.say(response)
    }
  )
}

function removed(event) {
  var entityId = String(event.npc.getUUID())
  LoadoutManager.saveStateOnRemoval(entityId, event.npc)
  TACZConnector.onNPCRemoved(entityId)
  LLM_LOG("Medic '" + String(event.npc.getName()) + "' removed — state preserved.")
}

function died(event) {
  var entityId = String(event.npc.getUUID())
  TACZConnector.onNPCDied(entityId)
  LLM_LOG("Medic '" + String(event.npc.getName()) + "' died — loadout cleared.")
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

