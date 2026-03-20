// modules/tacz/ai_goals/follow_leader_formation.js — AI Goal: follow_leader_formation
//
// Self-registers with GoalsLoader when loaded via load().

GoalsLoader.registerGoal(
  "follow_leader_formation",
  "Maintain assigned formation position relative to the squad leader. Move when the leader moves. Hold position when ordered."
)
