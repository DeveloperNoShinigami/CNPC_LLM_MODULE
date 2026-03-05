// modules/tacz/utils/formation_manager.js — Squad Formation Manager
//
// CNPC ES5 Scripting Standard — Rhino JavaScript Engine
//
// Manages tactical formations for TACZ squads.  The squad leader registers
// squad members here; the leader's interact() and tick() handlers call
// updateFormation() to reposition squad members via CNPC's navigateTo() API.
//
// ── FORMATION TYPES ──────────────────────────────────────────────────────────
//   column  — single-file line trailing the leader
//   line    — spread horizontally behind the leader
//   wedge   — V-formation with leader at the tip (most common combat spread)
//   defend  — squad encircles the leader at short radius
//
// ── USAGE ────────────────────────────────────────────────────────────────────
//   // In each squad member's init():
//   TACZConnector.setSquadLeader(myEntityId, leaderEntityId)
//
//   // In squad leader's interact() after detecting a formation keyword:
//   TACZConnector.setFormation(leaderEntityId, "wedge")
//   TACZConnector.updateFormation(leaderEntityId, event.npc)
//
//   // In squad member's init() to cache the live NPC ref for navigation:
//   FormationManager.setNpcRef(leaderEntityId, myEntityId, event.npc)

var FormationManager = (function() {

  // ── Formation offset tables ────────────────────────────────────────────────
  // Offsets are relative to the leader in local space (before yaw rotation).
  // dz > 0 = behind the leader.  Supports up to 8 squad members.

  var _FORMATIONS = {
    "column": [
      {dx:  0, dz:  4}, {dx:  0, dz:  8},
      {dx:  0, dz: 12}, {dx:  0, dz: 16},
      {dx:  0, dz: 20}, {dx:  0, dz: 24},
      {dx:  0, dz: 28}, {dx:  0, dz: 32}
    ],
    "line": [
      {dx: -4, dz: 3}, {dx:  4, dz: 3},
      {dx: -8, dz: 3}, {dx:  8, dz: 3},
      {dx:-12, dz: 3}, {dx: 12, dz: 3},
      {dx:-16, dz: 3}, {dx: 16, dz: 3}
    ],
    "wedge": [
      {dx: -3, dz:  4}, {dx:  3, dz:  4},
      {dx: -6, dz:  8}, {dx:  6, dz:  8},
      {dx: -9, dz: 12}, {dx:  9, dz: 12},
      {dx:-12, dz: 16}, {dx: 12, dz: 16}
    ],
    "defend": [
      {dx: -5, dz:  0}, {dx:  5, dz:  0},
      {dx:  0, dz:  5}, {dx:  0, dz: -5},
      {dx: -4, dz:  4}, {dx:  4, dz:  4},
      {dx: -4, dz: -4}, {dx:  4, dz: -4}
    ]
  }

  var _VALID_FORMATIONS = ["column", "line", "wedge", "defend"]

  // leaderId → { formation: String, memberIds: String[], npcRefs: {} }
  var _squads = {}

  // ── Private helpers ────────────────────────────────────────────────────────

  // Rotate a local (dx, dz) offset by yawDeg degrees to produce a world-space
  // offset aligned to the leader's facing direction.
  //
  // Local-frame convention used by the offset tables:
  //   dz > 0  = behind the leader   (opposite of their facing direction)
  //   dz < 0  = in front of the leader
  //   dx > 0  = to the leader's right
  //   dx < 0  = to the leader's left
  //
  // Minecraft yaw convention: 0 = south (+Z), 90 = west (-X), 180 = north (-Z),
  // 270 = east (+X).  The leader's forward vector in world space is:
  //   forwardX = -sin(yaw),  forwardZ = cos(yaw)
  // Right and backward basis vectors:
  //   right    = ( cos(yaw),  sin(yaw))
  //   backward = ( sin(yaw), -cos(yaw))
  //
  // world_offset = dx * right + dz * backward
  function _rotateOffset(dx, dz, yawDeg) {
    var rad  = yawDeg * Math.PI / 180
    var sinY = Math.sin(rad)
    var cosY = Math.cos(rad)
    return {
      dx: dx * cosY + dz * sinY,
      dz: dx * sinY - dz * cosY
    }
  }

  function _getOrCreateSquad(leaderId) {
    if (!_squads[leaderId]) {
      _squads[leaderId] = {
        formation: "column",
        memberIds: [],
        npcRefs:   {}
      }
    }
    return _squads[leaderId]
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {

    // Register a squad member with their leader.
    // Call from the squad member's init() handler.
    registerMember: function(leaderId, memberId) {
      if (!leaderId || !memberId) { return }
      var squad = _getOrCreateSquad(leaderId)
      if (squad.memberIds.indexOf(memberId) === -1) {
        squad.memberIds.push(memberId)
      }
    },

    // Cache the live NPC reference for a squad member so navigation calls work.
    // Call from the squad member's init() handler after registerMember().
    setNpcRef: function(leaderId, entityId, npc) {
      if (!_squads[leaderId]) { return }
      _squads[leaderId].npcRefs[entityId] = npc
    },

    // Set the formation type for a squad.
    // formationType must be one of: "column", "line", "wedge", "defend"
    setFormation: function(leaderId, formationType) {
      var squad = _getOrCreateSquad(leaderId)
      var f = formationType ? String(formationType).toLowerCase() : "column"
      squad.formation = (_VALID_FORMATIONS.indexOf(f) !== -1) ? f : "column"
      LLM_LOG("FormationManager: squad[" + leaderId + "] → " + squad.formation)
    },

    // Get the current formation type for a squad.
    getFormation: function(leaderId) {
      return _squads[leaderId] ? _squads[leaderId].formation : "column"
    },

    // Reposition all squad members into formation around the leader.
    // Call from the squad leader's interact() or a periodic timer.
    // leaderNpc must be the live ICustomNpc entity.
    updateFormation: function(leaderId, leaderNpc) {
      var squad = _squads[leaderId]
      if (!squad || squad.memberIds.length === 0) { return }
      var lx  = leaderNpc.getX()
      var ly  = leaderNpc.getY()
      var lz  = leaderNpc.getZ()
      var yaw = leaderNpc.getRotation ? leaderNpc.getRotation() : 0
      var offsets = _FORMATIONS[squad.formation] || _FORMATIONS["column"]
      for (var i = 0; i < squad.memberIds.length; i++) {
        var memberId  = squad.memberIds[i]
        var memberNpc = squad.npcRefs[memberId]
        if (!memberNpc) { continue }
        var off = offsets[i % offsets.length]
        var rot = _rotateOffset(off.dx, off.dz, yaw)
        var tx  = lx + rot.dx
        var tz  = lz + rot.dz
        try {
          memberNpc.navigateTo(tx, ly, tz, 0.8)
        } catch (e) { /* ignore if pathfinding unavailable */ }
      }
    },

    // Remove a squad member from all squads (call on removal or death).
    removeMember: function(entityId) {
      for (var leaderId in _squads) {
        var squad = _squads[leaderId]
        var idx   = squad.memberIds.indexOf(entityId)
        if (idx !== -1) {
          squad.memberIds.splice(idx, 1)
          delete squad.npcRefs[entityId]
        }
      }
    },

    // Disband an entire squad (call when the squad leader dies).
    disbandSquad: function(leaderId) {
      delete _squads[leaderId]
    },

    // Get a copy of the member ID list for a squad.
    getMembers: function(leaderId) {
      return _squads[leaderId] ? _squads[leaderId].memberIds.slice() : []
    },

    // List all supported formation type names.
    listFormations: function() {
      return _VALID_FORMATIONS.slice()
    }

  }

})()
