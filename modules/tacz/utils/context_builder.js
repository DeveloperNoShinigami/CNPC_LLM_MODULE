// modules/tacz/utils/context_builder.js — Game-State Context Builder for TACZ NPCs.
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Scrapes the current game state and assembles it into a standardised context
// object that every model_brain.js buildSystemPrompt() function understands.
//
// In a real Minecraft environment this module calls the CNPC scripting API,
// the TACZ API, and vanilla Minecraft accessors.  The build() function accepts
// those raw API data objects and normalises them into the shared context schema.
//
// CONTEXT SCHEMA
//   {
//     npc: {
//       name        : string,
//       health      : number,
//       maxHealth   : number,
//       equipment   : string[],   // weapons, armour, items the NPC carries
//       currentTask : string,
//     },
//     player: {
//       name     : string,
//       health   : number,
//       maxHealth: number,
//       heldItem : string,
//     },
//     world: {
//       time   : string,   // e.g. "Day (06:00 AM)"
//       weather: string,   // "clear", "rain", "storm"
//       biome  : string,
//     },
//     nearby: {
//       hostiles  : [{type: string, distance: number}],
//       friendlies: [{type: string, distance: number}],
//     }
//   }

var ContextBuilder = (function() {

  // ── NPC context ────────────────────────────────────────────────────────────

  function _buildNPCContext(raw) {
    return {
      name:        raw.name        || "Soldier",
      health:      (raw.health      !== undefined) ? raw.health      : 20,
      maxHealth:   (raw.maxHealth   !== undefined) ? raw.maxHealth   : 20,
      equipment:   Array.isArray(raw.equipment) ? raw.equipment : _parseEquipment(raw.equipment),
      currentTask: raw.currentTask || raw.task || "standing by"
    }
  }

  // ── Player context ─────────────────────────────────────────────────────────

  function _buildPlayerContext(raw) {
    return {
      name:      raw.name      || raw.username || "Player",
      health:    (raw.health    !== undefined) ? raw.health    : 20,
      maxHealth: (raw.maxHealth !== undefined) ? raw.maxHealth : 20,
      heldItem:  raw.heldItem  || raw.mainHand || "nothing"
    }
  }

  // ── World context ──────────────────────────────────────────────────────────

  function _buildWorldContext(raw) {
    return {
      time:    _formatTime(raw.time !== undefined ? raw.time : raw.dayTime),
      weather: _formatWeather(raw.weather !== undefined ? raw.weather : raw.isRaining, raw.isThundering),
      biome:   raw.biome || raw.biomeName || "unknown"
    }
  }

  // ── Nearby entities context ────────────────────────────────────────────────

  function _buildNearbyContext(raw) {
    var hostiles   = raw.hostiles   || []
    var friendlies = raw.friendlies || []
    var result = {hostiles: [], friendlies: []}
    for (var i = 0; i < hostiles.length;   i++) result.hostiles.push(_normaliseEntity(hostiles[i]))
    for (var j = 0; j < friendlies.length; j++) result.friendlies.push(_normaliseEntity(friendlies[j]))
    return result
  }

  function _normaliseEntity(e) {
    if (typeof e === "string") return {"type": e, "distance": null}
    return {
      "type":     e.type || e.entityType || "unknown",
      "distance": (e.distance !== undefined && e.distance !== null) ? Math.round(e.distance) : null
    }
  }

  // ── Time formatter (Minecraft ticks → human-readable) ─────────────────────
  // Minecraft ticks: 0 = 06:00, 6000 = 12:00, 12000 = 18:00, 18000 = 00:00

  function _formatTime(dayTime) {
    if (dayTime === undefined || dayTime === null) return "unknown"
    if (typeof dayTime === "string") return dayTime
    var totalMinutes = Math.floor(((dayTime + 6000) % 24000) / 1000 * 60)
    var h = Math.floor(totalMinutes / 60) % 24
    var m = totalMinutes % 60
    var period = (h < 12) ? "AM" : "PM"
    var h12 = (h % 12 === 0) ? 12 : (h % 12)
    var label = (h >= 6 && h < 20) ? "Day" : "Night"
    var hStr = h12 < 10 ? "0" + h12 : "" + h12
    var mStr = m   < 10 ? "0" + m   : "" + m
    return label + " (" + hStr + ":" + mStr + " " + period + ")"
  }

  function _formatWeather(isRaining, isThundering) {
    if (isThundering) return "storm"
    if (isRaining)    return "rain"
    return "clear"
  }

  function _parseEquipment(equipment) {
    if (!equipment) return []
    if (typeof equipment === "string") {
      var parts = equipment.split(",")
      var result = []
      for (var i = 0; i < parts.length; i++) {
        var s = parts[i].trim()
        if (s) result.push(s)
      }
      return result
    }
    return []
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {

    // Build a full game-state context object from raw API data.
    build: function(opts) {
      var npcData    = (opts && opts.npcData)    || {}
      var playerData = (opts && opts.playerData) || {}
      var worldData  = (opts && opts.worldData)  || {}
      var nearbyData = (opts && opts.nearbyData) || {}
      return {
        npc:    _buildNPCContext(npcData),
        player: _buildPlayerContext(playerData),
        world:  _buildWorldContext(worldData),
        nearby: _buildNearbyContext(nearbyData)
      }
    },

    // Build a minimal context for testing or when full data is unavailable.
    buildMinimal: function(npcName, playerName) {
      return {
        npc:    {"name": npcName || "Soldier",  "health": 20, "maxHealth": 20, "equipment": [], "currentTask": "standing by"},
        player: {"name": playerName || "Player", "health": 20, "maxHealth": 20, "heldItem": "nothing"},
        world:  {"time": "unknown", "weather": "clear", "biome": "unknown"},
        nearby: {"hostiles": [], "friendlies": []}
      }
    }

  }

})()

