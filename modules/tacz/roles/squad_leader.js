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
//   6. Parses AI command triggers ([recruit], [hold], etc.) and executes them.
//   7. Timer 10: own ammo-low check every 15 s.
//   8. Timer 20: faction-based troop recruitment scan (activated on demand).
//   9. Wires up CNPC event hooks: init(), interact(), timer(), removed(), died().
//
// ── SQUAD LEADER ROLE ────────────────────────────────────────────────────────
//   Persona   : Authoritative, tactical — commands troops and coordinates attacks.
//   Loadout   : M4A1 / Glock 17 / Combat Knife  (configurable in tacz_config.json)
//   Goals     : patrol, engage_hostiles, report_contacts, follow_player_on_order,
//               coordinate_squad, maintain_formation, reload_gun, request_ammo,
//               recruit_squad
//
// ── NBT KEYS (stored data) ────────────────────────────────────────────────────
//   ll_master  — player name who owns this NPC (master authority)
//   ll_leader  — UUID of this NPC's own squad leader (if sub-command)
//   ll_faction — faction ID used for troop-recruitment matching
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
load(_g + "reload_gun.js")
load(_g + "request_ammo.js")
load(_g + "recruit_squad.js")

// ── 4. Role configuration ─────────────────────────────────────────────────────
var SQUAD_LEADER_ROLE = {
  roleId:        "squad_leader",
  moduleId:      "tacz",
  brainProvider: "gemini",
  defaultTask:   "commanding the squad",
  goals:         ["patrol", "engage_hostiles", "report_contacts",
                  "follow_player_on_order", "coordinate_squad", "maintain_formation",
                  "reload_gun", "request_ammo", "recruit_squad"]
}

GoalsLoader.setRoleGoals(SQUAD_LEADER_ROLE.roleId, SQUAD_LEADER_ROLE.goals)

// ── CNPC EVENT HOOKS ──────────────────────────────────────────────────────────

function init(event) {
  var entityId = String(event.npc.getUUID())
  var npcName  = String(event.npc.getName())
  BrainRegistry.register(entityId, SQUAD_LEADER_ROLE.moduleId, SQUAD_LEADER_ROLE.roleId)
  LoadoutManager.initNPC(entityId, SQUAD_LEADER_ROLE.roleId, event.npc)
  // Restore any previously saved squad leader link (sub-command scenario)
  _restoreLeaderLink(entityId, event.npc)
  // Ammo-check timer: every 15 s (300 ticks), repeating
  event.npc.getTimers().forceStart(10, 300, true)
  LLM_LOG("Squad Leader '" + npcName + "' (" + entityId + ") initialised.")
}

function timer(event) {
  // Timer 10 — own ammo check
  if (event.id === 10) {
    var entityId = String(event.npc.getUUID())
    if (LoadoutManager.isAmmoLow(event.npc, 5)) {
      event.npc.say("Low on ammo — requesting resupply.")
      TACZConnector.requestAmmo(entityId, event.npc)
    }
  }
  // Timer 20 — one-shot recruitment scan (activated by [recruit] trigger)
  if (event.id === 20) {
    event.npc.getTimers().stop(20)
    var entityId = String(event.npc.getUUID())
    var count    = TACZConnector.recruitNearbyTroops(entityId, event.npc)
    if (count > 0) {
      event.npc.say("Recruited " + count + " trooper" + (count > 1 ? "s" : "") + ". Squad assembled — form up.")
      TACZConnector.updateFormation(entityId, event.npc)
    } else {
      event.npc.say("No unassigned troops in range.")
    }
  }
}

function interact(event) {
  var entityId  = String(event.npc.getUUID())
  var npcName   = String(event.npc.getName())
  var playerMsg = event.message ? String(event.message) : ""

  // ── Ammo hand-off: player right-clicks while holding ammo ─────────────────
  var heldItem = event.player.getMainhandItem ? event.player.getMainhandItem() : null
  if (heldItem && !heldItem.isEmpty()) {
    if (TimelessAPI.getOptionalAmmo(heldItem) != null) {
      var given = TACZConnector.onAmmoGiven(entityId, event.npc, heldItem, event.player)
      if (given) { event.npc.say("Got it. Topping off now."); return }
    }
  }

  // ── Track player master via NBT (first interaction registers the player) ───
  _recordMaster(event.npc, event.player)

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

  // Include squad member count for context awareness
  context.squadSize = FormationManager.getMembers(entityId).length

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
      // ── Process AI command triggers embedded in the response ──────────────
      var parsed = TACZConnector.parseCommandTriggers(response)
      _executeCommandTriggers(entityId, event.npc, parsed.triggers)
      event.npc.say(parsed.cleanText || response)
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

// Execute actions for each trigger parsed from the AI response.
function _executeCommandTriggers(entityId, npcRef, triggers) {
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i]
    if (t === "recruit") {
      // Delay 5 ticks then run one-shot recruitment scan (timer id 20)
      npcRef.getTimers().forceStart(20, 5, false)
    }
    if (t === "hold") {
      try { npcRef.clearNavigation() } catch (e) { /* ignore */ }
    }
    if (t === "engage") {
      TACZConnector.updateFormation(entityId, npcRef)
    }
    if (t === "fallback") {
      // Navigate squad members toward the leader's current position
      TACZConnector.updateFormation(entityId, npcRef)
    }
    if (t === "resupply") {
      // Broadcast a resupply order: each squad member checks ammo via tempdata
      var members = FormationManager.getMembers(entityId)
      var world   = npcRef.getWorld()
      for (var m = 0; m < members.length; m++) {
        try { world.getTempdata().put("ll_resupply_order_" + members[m], "1") } catch (e2) { /* ignore */ }
      }
    }
  }
}

// Save the interacting player as the master of this NPC (stored data).
// Only sets the master if none is recorded yet, so the original owner is kept.
function _recordMaster(npc, player) {
  try {
    var stored = npc.getStoreddata()
    if (!stored.has("ll_master") || String(stored.get("ll_master")) === "") {
      stored.put("ll_master", String(player.getName()))
    }
  } catch (e) { /* ignore */ }
}

// Re-register with FormationManager if this NPC was itself a sub-leader
// assigned to another leader (edge case for hierarchical squads).
// A squad leader can itself have a parent leader UUID stored in 'll_leader'
// when two squad leaders operate in a command hierarchy (e.g. a platoon leader
// commands multiple squad leaders, each of whom commands their own units).
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

