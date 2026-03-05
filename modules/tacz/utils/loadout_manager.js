/**
 * modules/tacz/utils/loadout_manager.js
 *
 * Utility: NPC Loadout Manager for TACZ NPCs.
 *
 * Manages the weapons, equipment, and ammunition that a TACZ NPC carries.
 * Provides helpers for:
 *   - Building a loadout string for inclusion in AI context.
 *   - Updating an NPC's loadout at runtime.
 *   - Querying loadout details (primary weapon, secondary, attachments).
 *
 * In a full CNPC + TACZ integration, the `apply()` method would call the
 * appropriate CNPC/TACZ scripting API to actually equip the NPC.
 */

'use strict';

/** @type {Map<string, object>} entityId → loadout object */
const _loadouts = new Map();

/**
 * Default loadout template.
 *
 * @returns {object}
 */
function _defaultLoadout() {
  return {
    primary:    null,
    secondary:  null,
    melee:      null,
    armour:     null,
    attachments: [],
    ammo:       {},
  };
}

const LoadoutManager = {

  /**
   * Set the full loadout for an NPC.
   *
   * @param {string} entityId
   * @param {object} loadout
   * @param {string} [loadout.primary]       - Primary weapon name (e.g. "M4A1")
   * @param {string} [loadout.secondary]     - Sidearm name (e.g. "Glock 17")
   * @param {string} [loadout.melee]         - Melee weapon (e.g. "Combat Knife")
   * @param {string} [loadout.armour]        - Armour piece (e.g. "Kevlar Vest")
   * @param {string[]} [loadout.attachments] - Weapon attachments (e.g. ["Red Dot", "Suppressor"])
   * @param {object} [loadout.ammo]          - Ammo counts { weaponName: count }
   */
  set(entityId, loadout) {
    _loadouts.set(entityId, { ..._defaultLoadout(), ...loadout });
  },

  /**
   * Get the loadout for an NPC.
   * Returns a default empty loadout if none has been assigned.
   *
   * @param {string} entityId
   * @returns {object}
   */
  get(entityId) {
    return _loadouts.get(entityId) || _defaultLoadout();
  },

  /**
   * Update individual fields of an NPC's loadout without replacing the whole object.
   *
   * @param {string} entityId
   * @param {object} patch - Partial loadout fields to update
   */
  update(entityId, patch) {
    const existing = LoadoutManager.get(entityId);
    _loadouts.set(entityId, { ...existing, ...patch });
  },

  /**
   * Remove the loadout entry for an NPC.
   *
   * @param {string} entityId
   */
  remove(entityId) {
    _loadouts.delete(entityId);
  },

  /**
   * Format the loadout as a human-readable string for AI context embedding.
   *
   * @param {string} entityId
   * @returns {string}
   */
  formatForContext(entityId) {
    const l = LoadoutManager.get(entityId);
    const parts = [];

    if (l.primary)   parts.push(`Primary: ${l.primary}`);
    if (l.secondary) parts.push(`Secondary: ${l.secondary}`);
    if (l.melee)     parts.push(`Melee: ${l.melee}`);
    if (l.armour)    parts.push(`Armour: ${l.armour}`);

    if (l.attachments && l.attachments.length > 0) {
      parts.push(`Attachments: ${l.attachments.join(', ')}`);
    }

    const ammoKeys = Object.keys(l.ammo || {});
    if (ammoKeys.length > 0) {
      const ammoStr = ammoKeys.map(k => `${k}: ${l.ammo[k]}`).join(', ');
      parts.push(`Ammo: ${ammoStr}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'No loadout assigned';
  },

  /**
   * Return the loadout as a simple equipment string array.
   * Compatible with the `context.npc.equipment` field expected by model_brain.js.
   *
   * @param {string} entityId
   * @returns {string[]}
   */
  toEquipmentArray(entityId) {
    const l = LoadoutManager.get(entityId);
    const items = [];
    if (l.primary)   items.push(l.primary);
    if (l.secondary) items.push(l.secondary);
    if (l.melee)     items.push(l.melee);
    if (l.armour)    items.push(l.armour);
    return items;
  },
};

module.exports = LoadoutManager;
