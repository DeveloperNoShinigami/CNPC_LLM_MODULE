// modules/tacz/roles/squad_leader.js — SQUAD LEADER ROLE
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// ── HOW TO USE ───────────────────────────────────────────────────────────────
// Assign this file as the script for any CNPC NPC you want to behave as an
// AI-driven Squad Leader.  No other setup is needed on a per-NPC basis.
//
// The script resolves its own path using the CNPC NpcAPI so it works
// identically in single-player and on a dedicated server.
//
// ── WHAT THIS SCRIPT DOES ────────────────────────────────────────────────────
//   1. Resolves LLM_BASE_PATH via NpcAPI.getLevelDir().
//   2. Loads the entire LLM_MODULE_SYSTEM via loader.js (once per session).
//   3. Loads role-specific ai_goals files and declares them via GoalsLoader.
//   4. Initialises NPC loadout (respects existing items / persisted state).
//   5. Detects formation keywords in player messages and updates FormationManager.
//   6. Wires up CNPC event hooks: init(), interact(), removed(), died().
//
// ── SQUAD LEADER ROLE ────────────────────────────────────────────────────────
//   Persona   : Authoritative, tactical — commands troops and coordinates attacks.
//   Loadout   : M4A1 / Glock 17 / Combat Knife  (configurable in tacz_config.json)
//   Goals     : patrol, engage_hostiles, report_contacts, follow_player_on_order,
//               coordinate_squad, maintain_formation
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Path resolution ────────────────────────────────────────────────────────
var _API          = Java.type("noppes.npcs.api.NpcAPI")
var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"

// ── 2. Load core system ───────────────────────────────────────────────────────
load(LLM_BASE_PATH + "/core/loader.js")

// ── 3. Load role-specific goals ───────────────────────────────────────────────
var _g = LLM_BASE_PATH + "/modules/tacz/ai_goals/"
load(_g + "patrol.js")
load(_g + "engage_hostiles.js")
load(_g + "report_contacts.js")
load(_g + "follow_player_on_order.js")
load(_g + "coordinate_squad.js")
load(_g + "maintain_formation.js")

// ── 4. Role configuration ─────────────────────────────────────────────────────
var SQUAD_LEADER_ROLE = {
  roleId:        "squad_leader",
  moduleId:      "tacz",
  brainProvider: "gemini",
  defaultTask:   "commanding the squad",
  goals:         ["patrol", "engage_hostiles", "report_contacts",
                  "follow_player_on_order", "coordinate_squad", "maintain_formation"]
}

GoalsLoader.setRoleGoals(SQUAD_LEADER_ROLE.roleId, SQUAD_LEADER_ROLE.goals)

// ── CNPC EVENT HOOKS ──────────────────────────────────────────────────────────

function init(event) {
  var entityId = String(event.npc.getUUID())
  var npcName  = String(event.npc.getName())
  BrainRegistry.register(entityId, SQUAD_LEADER_ROLE.moduleId, SQUAD_LEADER_ROLE.roleId)
  LoadoutManager.initNPC(entityId, SQUAD_LEADER_ROLE.roleId, event.npc)
  LLM_LOG("Squad Leader '" + npcName + "' (" + entityId + ") initialised.")
}

function interact(event) {
  var entityId  = String(event.npc.getUUID())
  var npcName   = String(event.npc.getName())
  var playerMsg = event.message ? String(event.message) : ""

  // ── Detect formation commands from the player ─────────────────────────────
  var formationType = _detectFormationCommand(playerMsg)
  if (formationType) {
    TACZConnector.setFormation(entityId, formationType)
    TACZConnector.updateFormation(entityId, event.npc)
    LLM_LOG("Squad Leader: formation changed to " + formationType)
  }

  var loadoutEquip = LoadoutManager.toEquipmentArray(entityId, event.npc)

  var rawNPC = {
    name:        npcName,
    health:      event.npc.getHealth(),
    maxHealth:   event.npc.getMaxHealth(),
    equipment:   loadoutEquip,
    currentTask: SQUAD_LEADER_ROLE.defaultTask
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

  // Include current formation in context for the AI prompt
  context.formation = FormationManager.getFormation(entityId)

  TACZConnector.handleRoleInteraction(
    SQUAD_LEADER_ROLE,
    entityId,
    context,
    playerMsg,
    function(err, response) {
      if (err) {
        LLM_LOG("SquadLeader[" + npcName + "] error: " + err)
        event.npc.say("(static) Copy that — stand by.")
        return
      }
      event.npc.say(response)
    }
  )
}

function removed(event) {
  var entityId = String(event.npc.getUUID())
  LoadoutManager.saveStateOnRemoval(entityId, event.npc)
  TACZConnector.onNPCRemoved(entityId)
  LLM_LOG("Squad Leader '" + String(event.npc.getName()) + "' removed — state preserved.")
}

function died(event) {
  var entityId = String(event.npc.getUUID())
  TACZConnector.onLeaderDied(entityId)
  LLM_LOG("Squad Leader '" + String(event.npc.getName()) + "' died — squad disbanded.")
}

// ── Private helpers ───────────────────────────────────────────────────────────

// Detect a formation keyword in the player's message.
// Uses word-boundary regex to avoid false positives
// (e.g. "decline" must not match "line", "wedge-shaped" is fine).
// Returns the formation type string, or null if none found.
function _detectFormationCommand(msg) {
  if (!msg) { return null }
  var lower = String(msg).toLowerCase()
  if (/\bcolumn\b/.test(lower))            { return "column" }
  if (/\bwedge\b/.test(lower))             { return "wedge" }
  if (/\bline\b/.test(lower))              { return "line" }
  if (/\bdefend\b|\bdefense\b/.test(lower)) { return "defend" }
  if (/\bcircle\b/.test(lower))            { return "defend" }
  return null
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
