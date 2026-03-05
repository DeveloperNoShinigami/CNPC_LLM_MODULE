/**
 * modules/tacz/utils/context_builder.js
 *
 * Utility: Game-State Context Builder for TACZ NPCs.
 *
 * Scrapes the current game state and assembles it into a standardised context
 * object that every model_brain.js `buildSystemPrompt()` function understands.
 *
 * In a real Minecraft environment this module would call the CNPC scripting API,
 * the TACZ API, and vanilla Minecraft accessors.  The `build()` function accepts
 * those raw API data objects and normalises them into the shared context schema.
 *
 * ─────────────────────────────────────────────────────────────
 * CONTEXT SCHEMA
 * ─────────────────────────────────────────────────────────────
 * {
 *   npc: {
 *     name        : string,
 *     health      : number,
 *     maxHealth   : number,
 *     equipment   : string[],   // weapons, armour, items the NPC carries
 *     currentTask : string,
 *   },
 *   player: {
 *     name     : string,
 *     health   : number,
 *     maxHealth: number,
 *     heldItem : string,
 *   },
 *   world: {
 *     time   : string,   // e.g. "Day (06:00)", "Night (22:00)"
 *     weather: string,   // "clear", "rain", "storm"
 *     biome  : string,   // e.g. "plains", "forest", "desert"
 *   },
 *   nearby: {
 *     hostiles  : [{type: string, distance: number}],
 *     friendlies: [{type: string, distance: number}],
 *   }
 * }
 */

'use strict';

const ContextBuilder = {

  /**
   * Build a full game-state context object from raw API data.
   *
   * @param {object} opts
   * @param {object} opts.npcData     - Raw NPC data from the CNPC API
   * @param {object} opts.playerData  - Raw player data
   * @param {object} opts.worldData   - Raw world/environment data
   * @param {object} opts.nearbyData  - Raw nearby-entity data
   * @returns {object}                - Normalised context object
   */
  build({ npcData = {}, playerData = {}, worldData = {}, nearbyData = {} } = {}) {
    return {
      npc:    _buildNPCContext(npcData),
      player: _buildPlayerContext(playerData),
      world:  _buildWorldContext(worldData),
      nearby: _buildNearbyContext(nearbyData),
    };
  },

  /**
   * Build a minimal context for testing or when full data is unavailable.
   *
   * @param {string} npcName
   * @param {string} playerName
   * @returns {object}
   */
  buildMinimal(npcName = 'Soldier', playerName = 'Player') {
    return {
      npc:    { name: npcName,   health: 20, maxHealth: 20, equipment: [], currentTask: 'standing by' },
      player: { name: playerName, health: 20, maxHealth: 20, heldItem: 'nothing' },
      world:  { time: 'unknown', weather: 'clear', biome: 'unknown' },
      nearby: { hostiles: [], friendlies: [] },
    };
  },
};

// ── Private normalisation helpers ─────────────────────────────────────────────

function _buildNPCContext(raw) {
  return {
    name:        raw.name        || 'Soldier',
    health:      raw.health      ?? 20,
    maxHealth:   raw.maxHealth   ?? 20,
    equipment:   Array.isArray(raw.equipment) ? raw.equipment : _parseEquipment(raw.equipment),
    currentTask: raw.currentTask || raw.task || 'standing by',
  };
}

function _buildPlayerContext(raw) {
  return {
    name:      raw.name      || raw.username || 'Player',
    health:    raw.health    ?? 20,
    maxHealth: raw.maxHealth ?? 20,
    heldItem:  raw.heldItem  || raw.mainHand || 'nothing',
  };
}

function _buildWorldContext(raw) {
  return {
    time:    _formatTime(raw.time ?? raw.dayTime),
    weather: _formatWeather(raw.weather ?? raw.isRaining, raw.isThundering),
    biome:   raw.biome || raw.biomeName || 'unknown',
  };
}

function _buildNearbyContext(raw) {
  const hostiles   = (raw.hostiles   || []).map(_normaliseEntity);
  const friendlies = (raw.friendlies || []).map(_normaliseEntity);
  return { hostiles, friendlies };
}

function _normaliseEntity(e) {
  if (typeof e === 'string') return { type: e, distance: null };
  return {
    type:     e.type || e.entityType || 'unknown',
    distance: e.distance != null ? Math.round(e.distance) : null,
  };
}

function _formatTime(dayTime) {
  if (dayTime == null || dayTime === undefined) return 'unknown';
  if (typeof dayTime === 'string') return dayTime;
  // Minecraft ticks: 0 = 06:00, 6000 = 12:00, 12000 = 18:00, 18000 = 00:00
  const totalMinutes = Math.floor(((dayTime + 6000) % 24000) / 1000 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const label = h >= 6 && h < 20 ? 'Day' : 'Night';
  return `${label} (${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period})`;
}

function _formatWeather(isRaining, isThundering) {
  if (isThundering) return 'storm';
  if (isRaining)    return 'rain';
  return 'clear';
}

function _parseEquipment(equipment) {
  if (!equipment) return [];
  if (typeof equipment === 'string') return equipment.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

module.exports = ContextBuilder;
