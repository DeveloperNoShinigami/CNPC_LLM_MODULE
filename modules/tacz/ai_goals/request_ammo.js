// modules/tacz/ai_goals/request_ammo.js — AI Goal: request_ammo
//
// Self-registers with GoalsLoader when loaded via load().

GoalsLoader.registerGoal(
  "request_ammo",
  "When ammo is critically low, broadcast an ammo request to the squad medic and player master. Announce the shortage aloud so nearby allies hear it. The system checks for resupply automatically every 15 seconds. Once resupplied, confirm receipt and reload to full."
)
