// modules/tacz/ai_goals/recruit_squad.js — AI Goal: recruit_squad
//
// Self-registers with GoalsLoader when loaded via load().

GoalsLoader.registerGoal(
  "recruit_squad",
  "When ordered to [recruit], scan an 8-16 block radius for same-faction troops that have no assigned leader. Verify they share your faction before adding them to the squad. Assign formation positions and announce the new headcount. Only perform active recruitment when the player or master issues the recruit command — otherwise maintain the existing squad roster."
)
