/**
 * modules/tacz/utils/goals_loader.js
 *
 * Utility: AI Task / Goal Set Loader for TACZ NPCs.
 *
 * Loads goal definitions from the TACZ config and provides helpers for
 * resolving which goal set applies to a given NPC role.
 *
 * In a full CNPC implementation these goals would be passed to the CNPC AI
 * goal queue.  Here they serve as context enrichment strings that the brain
 * can reference when deciding NPC behaviour.
 *
 * ─────────────────────────────────────────────────────────────
 * GOAL DEFINITIONS
 * ─────────────────────────────────────────────────────────────
 * Goals are defined in modules/tacz/tacz_config.json under each role:
 *   "rifleman": { "goals": ["patrol", "engage_hostiles", ...] }
 *
 * Custom goal descriptors can be added by registering them with
 * GoalsLoader.registerGoal(name, descriptor).
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// Built-in goal descriptors — describe what the NPC does for each goal name.
const _goalDescriptors = {
  patrol:                  'Move along a predefined patrol route, staying alert for hostiles.',
  engage_hostiles:         'Attack any detected hostile entity within range.',
  follow_player_on_order:  'Follow the player when ordered to do so.',
  hold_position:           'Stay at the current location and do not advance.',
  engage_priority_targets: 'Identify and eliminate the highest-threat target first.',
  report_contacts:         'Verbally report when new entities are detected nearby.',
  suppress_hostiles:       'Lay down suppressive fire to pin down enemies.',
  resupply_allies:         'Distribute ammunition and supplies to nearby friendly NPCs.',
  secure_area:             'Clear and hold the immediate area of all hostile entities.',
};

let _taczConfig = null;

function _getConfig() {
  if (!_taczConfig) {
    const configPath = path.resolve(__dirname, '..', 'tacz_config.json');
    _taczConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return _taczConfig;
}

const GoalsLoader = {

  /**
   * Get the list of goal names for a given NPC role.
   *
   * @param {string} role - Role name from tacz_config.json (e.g. "rifleman")
   * @returns {string[]}  - Array of goal name strings
   */
  getGoalNames(role) {
    const config = _getConfig();
    return config.roles?.[role]?.goals || [];
  },

  /**
   * Get full goal descriptors for a given NPC role.
   * Returns an array of human-readable strings suitable for inclusion
   * in a system prompt.
   *
   * @param {string} role
   * @returns {string[]}
   */
  getGoalDescriptors(role) {
    const names = GoalsLoader.getGoalNames(role);
    return names.map(name => {
      const desc = _goalDescriptors[name];
      return desc ? `[${name}] ${desc}` : `[${name}] (no descriptor available)`;
    });
  },

  /**
   * Format goals as a single multi-line string for embedding in a system prompt.
   *
   * @param {string} role
   * @returns {string}
   */
  formatForPrompt(role) {
    const descriptors = GoalsLoader.getGoalDescriptors(role);
    if (descriptors.length === 0) return 'No specific goals assigned.';
    return descriptors.join('\n');
  },

  /**
   * Register a custom goal descriptor.
   * Use this to extend the built-in goal set without modifying this file.
   *
   * @param {string} name       - Goal identifier (must match entries in tacz_config.json)
   * @param {string} descriptor - Human-readable description of the goal
   */
  registerGoal(name, descriptor) {
    _goalDescriptors[name] = descriptor;
  },

  /**
   * List all registered goal names.
   *
   * @returns {string[]}
   */
  listGoals() {
    return Object.keys(_goalDescriptors);
  },
};

module.exports = GoalsLoader;
