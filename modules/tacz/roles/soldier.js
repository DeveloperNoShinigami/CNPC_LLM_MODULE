// modules/tacz/roles/soldier.js — SOLDIER ROLE
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// ── HOW TO USE ───────────────────────────────────────────────────────────────
// Assign this file as the script for any CNPC NPC you want to behave as an
// AI-driven Soldier.  No other setup is needed on a per-NPC basis.
//
// The script resolves its own path using the CNPC NpcAPI so it works
// identically in single-player and on a dedicated server — no manual path
// configuration required.
//
// ── WHAT THIS SCRIPT DOES ────────────────────────────────────────────────────
//   1. Resolves LLM_BASE_PATH via NpcAPI.getLevelDir().
//   2. Loads the entire LLM_MODULE_SYSTEM via loader.js (once per session).
//   3. Declares the Soldier role configuration.
//   4. Wires up CNPC event hooks: init(), interact(), removed().
//
// ── SOLDIER ROLE ─────────────────────────────────────────────────────────────
//   Persona   : Disciplined, follows orders — executes tasks and reports status.
//   Provider  : configurable via SOLDIER_ROLE.brainProvider
//   Goals     : patrol, engage_hostiles, follow_player_on_order, suppress_hostiles
// ─────────────────────────────────────────────────────────────────────────────

// Resolve the base path from the CNPC NpcAPI.
// NpcAPI.getLevelDir() returns the world/save directory with a trailing
// separator and works correctly for both servers and single-player worlds.
var _API          = Java.type("noppes.npcs.api.NpcAPI")
var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"

// Load the full LLM system (the guard inside loader.js prevents double-loading).
load(LLM_BASE_PATH + "/core/loader.js")

// ── ROLE CONFIGURATION ────────────────────────────────────────────────────────
// Change brainProvider to "openrouter" (or any registered provider) to switch
// the AI model this NPC uses without touching any other file.

var SOLDIER_ROLE = {
  roleId:        "soldier",
  moduleId:      "tacz",
  brainProvider: "gemini",        // override per-NPC if desired
  defaultTask:   "standing by for orders"
}

// ── CNPC EVENT HOOKS ──────────────────────────────────────────────────────────

// init() — fires when the NPC loads or the server starts.
// Registers the NPC in BrainRegistry so the system tracks it.
function init(event) {
  var entityId = String(event.npc.getUniqueID())
  var npcName  = String(event.npc.getName())
  BrainRegistry.register(entityId, SOLDIER_ROLE.moduleId, SOLDIER_ROLE.roleId)
  LLM_LOG("Soldier '" + npcName + "' (" + entityId + ") initialised.")
}

// interact() — fires on player right-click OR when the player sends a message
// through the CNPC dialog.
//   event.npc         — the NPC Java entity
//   event.player      — the player Java entity
//   event.message     — player's typed message ("" on plain right-click)
function interact(event) {
  var entityId  = String(event.npc.getUniqueID())
  var npcName   = String(event.npc.getName())
  var playerMsg = event.message ? String(event.message) : ""

  // ── Build game-state context from CNPC / Minecraft API ───────────────────
  var loadoutEquip = LoadoutManager.toEquipmentArray(entityId)

  var rawNPC = {
    name:        npcName,
    health:      event.npc.getHealth(),
    maxHealth:   event.npc.getMaxHealth(),
    equipment:   (loadoutEquip.length > 0) ? loadoutEquip : [],
    currentTask: SOLDIER_ROLE.defaultTask
  }

  var rawPlayer = {
    name:      String(event.player.getName()),
    health:    event.player.getHealth(),
    maxHealth: event.player.getMaxHealth(),
    heldItem:  _getHeldItemName(event.player)
  }

  var rawWorld  = _getWorldData(event.npc)
  var rawNearby = _getNearbyData(event.npc)

  var context = ContextBuilder.build({
    npcData:    rawNPC,
    playerData: rawPlayer,
    worldData:  rawWorld,
    nearbyData: rawNearby
  })

  // ── Forward to connector using the role-driven path ───────────────────────
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

// removed() — fires when the NPC dies, despawns, or is unloaded from the world.
// Cleans up session data so stale state doesn't bleed into a respawned NPC.
function removed(event) {
  var entityId = String(event.npc.getUniqueID())
  TACZConnector.onNPCRemoved(entityId)
  LLM_LOG("Soldier '" + String(event.npc.getName()) + "' removed — session cleared.")
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getHeldItemName(player) {
  try {
    var stack = player.getHeldItem ? player.getHeldItem() : null
    if (stack && !stack.func_190926_b()) return String(stack.getDisplayName())
  } catch (e) { /* ignore */ }
  return "nothing"
}

function _getWorldData(npc) {
  try {
    var w = npc.getEntityWorld ? npc.getEntityWorld() : null
    if (!w) return {"time": "unknown", "weather": "clear", "biome": "unknown"}
    var ticks   = w.getTotalWorldTime ? w.getTotalWorldTime() : 0
    var weather = w.isThundering() ? "storm" : (w.isRaining() ? "rain" : "clear")
    var biome   = "unknown"
    try {
      var bp = npc.getPosition ? npc.getPosition() : null
      if (bp) biome = String(w.getBiome(bp).getBiomeName())
    } catch(e2) { /* ignore */ }
    return {"time": ticks, "weather": weather, "biome": biome}
  } catch (e) {
    return {"time": "unknown", "weather": "clear", "biome": "unknown"}
  }
}

function _getNearbyData(npc) {
  // Basic scan — extend with actual entity list from CNPC API as needed.
  // Returning empty arrays is safe; the AI will note "no contacts".
  return {"hostiles": [], "friendlies": []}
}
