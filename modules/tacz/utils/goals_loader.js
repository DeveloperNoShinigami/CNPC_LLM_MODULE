// modules/tacz/utils/goals_loader.js — AI Task / Goal Set Loader
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Goals are now defined as individual self-registering files in ai_goals/.
// Role scripts load only the goal files they need, then call setRoleGoals()
// to declare which goals are active for their roleId.
//
// ── Pattern ──────────────────────────────────────────────────────────────────
//   1. Role script loads goal files:
//        load(LLM_BASE_PATH + "/modules/tacz/ai_goals/patrol.js")
//        load(LLM_BASE_PATH + "/modules/tacz/ai_goals/hold_position.js")
//      Each goal file calls GoalsLoader.registerGoal(name, description).
//
//   2. Role script declares which goals apply to its roleId:
//        GoalsLoader.setRoleGoals("sniper", ["hold_position", "report_contacts"])
//
//   3. TACZConnector calls GoalsLoader.formatForPrompt(roleId) to embed goals
//      in the AI system prompt.
//
// ── Priority ─────────────────────────────────────────────────────────────────
//   setRoleGoals() declarations (file-based) take precedence over
//   tacz_config.json role.goals arrays (legacy / fallback).

var GoalsLoader = (function() {

  // name → description string.  Populated by registerGoal() calls (from ai_goals/*.js).
  var _goalDescriptors = {}

  // roleId → string[]  Declared by setRoleGoals() in role scripts.
  var _roleGoals = {}

  var _config = null

  return {

    // Provide the parsed tacz_config object (called by TACZConnector.init()).
    // Still used as fallback when a role has not called setRoleGoals().
    init: function(configObj) {
      _config = configObj
    },

    // Register a goal descriptor.
    // Called automatically by ai_goals/*.js files when they are load()-ed.
    registerGoal: function(name, descriptor) {
      _goalDescriptors[name] = descriptor
    },

    // Declare which goals are active for a roleId.
    // Called by role scripts after they have loaded their ai_goals files.
    // This takes priority over tacz_config.json for that roleId.
    setRoleGoals: function(roleId, goalNames) {
      _roleGoals[roleId] = goalNames || []
    },

    // Get the list of goal names for a role.
    // Prefers setRoleGoals() declarations; falls back to tacz_config.json.
    getGoalNames: function(role) {
      if (_roleGoals[role]) return _roleGoals[role]
      if (!_config || !_config.roles || !_config.roles[role]) return []
      return _config.roles[role].goals || []
    },

    // Get full goal descriptors for a role.
    // Returns an array of human-readable strings for inclusion in a system prompt.
    getGoalDescriptors: function(role) {
      var names = GoalsLoader.getGoalNames(role)
      var results = []
      for (var i = 0; i < names.length; i++) {
        var desc = _goalDescriptors[names[i]]
        results.push(desc
          ? "[" + names[i] + "] " + desc
          : "[" + names[i] + "] (no descriptor — load the goal file in the role script)")
      }
      return results
    },

    // Format goals as a single multi-line string for embedding in a system prompt.
    formatForPrompt: function(role) {
      var descriptors = GoalsLoader.getGoalDescriptors(role)
      if (descriptors.length === 0) return "No specific goals assigned."
      return descriptors.join("\n")
    },

    // List all registered goal names (across all loaded goal files).
    listGoals: function() {
      return Object.keys(_goalDescriptors)
    },

    // List all roles that have called setRoleGoals().
    listRolesWithGoals: function() {
      return Object.keys(_roleGoals)
    }

  }

})()

