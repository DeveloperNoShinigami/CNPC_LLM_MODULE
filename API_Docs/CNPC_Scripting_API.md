# CNPC Scripting API Reference (1.20.1)

> **Runtime:** Rhino JavaScript Engine (ES5)  
> **Coding rules:** ES5 · No semicolons · `function` keyword only · No imports  
> **Path resolution:** Always use `Java.type("noppes.npcs.api.NpcAPI").getLevelDir()` to anchor
> all `load()` paths so they work in both single-player and dedicated-server environments.

---

## Event Handler Naming

Handler function names are derived from the event class name:

1. Take the event class name (e.g. `TimerEvent`, `InteractEvent`)
2. Remove the `Event` suffix
3. Convert to camelCase (lowercase first letter)
4. Special case: `UpdateEvent` → `tick`
5. `CustomGuiEvent` handlers keep the `customGui` prefix

| Event Class                        | Handler Function         |
|------------------------------------|--------------------------|
| `NpcEvent.InitEvent`               | `function init(event)`   |
| `NpcEvent.UpdateEvent`             | `function tick(event)`   |
| `NpcEvent.InteractEvent`           | `function interact(event)` |
| `NpcEvent.DamagedEvent`            | `function damaged(event)` |
| `NpcEvent.DiedEvent`               | `function died(event)`   |
| `NpcEvent.KilledEntityEvent`       | `function killed(event)` |
| `NpcEvent.TimerEvent`              | `function timer(event)`  |
| `NpcEvent.TargetEvent`             | `function targetAcquired(event)` |
| `NpcEvent.TargetLostEvent`         | `function targetLost(event)` |
| `NpcEvent.MeleeAttackEvent`        | `function meleeAttack(event)` |
| `NpcEvent.RangedLaunchedEvent`     | `function rangedLaunched(event)` |
| `PlayerEvent.UpdateEvent`          | `function tick(event)`   |
| `PlayerEvent.LoginEvent`           | `function login(event)`  |
| `PlayerEvent.LogoutEvent`          | `function logout(event)` |
| `PlayerEvent.InteractEvent`        | `function interact(event)` |
| `PlayerEvent.DiedEvent`            | `function died(event)`   |
| `BlockEvent.TimerEvent`            | `function timer(event)`  |
| `BlockEvent.ClickedEvent`          | `function clicked(event)` |
| `CustomGuiEvent.ButtonEvent`       | `function customGuiButton(event)` |
| `CustomGuiEvent.CloseEvent`        | `function customGuiClosed(event)` |
| `CustomGuiEvent.SlotClickedEvent`  | `function customGuiSlotClicked(event)` |

---

## Core Event Properties

### NpcEvent
```
event.npc      — ICustomNpc  : the NPC entity
event.API      — NpcAPI      : global CNPC API
```

### NpcEvent.InteractEvent
```
event.npc      — ICustomNpc
event.player   — IPlayer
```

### NpcEvent.DamagedEvent
```
event.npc          — ICustomNpc
event.damageSource — IDamageSource
event.source       — IEntity  (attacker)
event.damage       — Number
```

### NpcEvent.DiedEvent
```
event.npc          — ICustomNpc
event.damageSource — IDamageSource
event.droppedItems — IItemStack[]
event.expDropped   — Number
```

### NpcEvent.TimerEvent
```
event.npc   — ICustomNpc
event.id    — Number   (timer ID passed to forceStart)
```

---

## ICustomNpc — NPC Entity API

```javascript
// Identity / display
npc.getName()                          // String
npc.getUUID()                          // String (unique entity ID)
npc.getX() / npc.getY() / npc.getZ()  // Number
npc.getPos()                           // IPos
npc.setPosition(x, y, z)              // void
npc.getRotation()                      // Number (yaw in degrees)
npc.setRotation(rotation)             // void
npc.getPitch()                         // Number

// Health
npc.getHealth()                        // Number
npc.setHealth(n)                       // void
npc.getMaxHealth()                     // Number
npc.setMaxHealth(n)                    // void

// Communication
npc.say(message)                       // broadcasts to nearby players
npc.sayTo(player, message)             // sends to specific player

// Inventory
npc.getInventory()                     // INPCInventory  ← weapon/armor/loot slots
npc.getMainhandItem()                  // IItemStack
npc.setMainhandItem(item)              // void
npc.getOffhandItem()                   // IItemStack
npc.setOffhandItem(item)               // void
npc.getArmor(slot)                     // IItemStack (0=boots, 1=legs, 2=chest, 3=head)
npc.setArmor(slot, item)               // void

// AI / Navigation
npc.getAi()                            // INPCAi
npc.navigateTo(x, y, z, speed)        // pathfind to position
npc.clearNavigation()                  // stop current path
npc.isNavigating()                     // boolean
npc.setAttackTarget(entity)            // IEntityLivingBase
npc.getAttackTarget()                  // IEntityLivingBase

// Timers
npc.getTimers()                        // ITimers
//   .forceStart(id, ticks, repeat)
//   .stop(id)
//   .has(id)

// World
npc.getWorld()                         // IWorld
npc.isAlive()                          // boolean
npc.kill()                             // kill (does not despawn)
npc.despawn()                          // permanently remove

// Data storage
npc.getTempdata()                      // IData — cleared on reload
npc.getStoreddata()                    // IData — persists through restarts
npc.getNbt()                           // INbt  — raw entity NBT

// Stats / advanced
npc.getStats()                         // INPCStats
npc.getDisplay()                       // INPCDisplay
npc.getAdvanced()                      // INPCAdvanced
npc.executeCommand(cmd)                // String  (requires op command block setting)
npc.reset()                            // full NPC reset (also calls init script)
npc.giveItem(player, item)             // give item to player
```

---

## INPCInventory — NPC Item Slots

```javascript
var inv = npc.getInventory()

inv.getRightHand()                     // IItemStack — main weapon
inv.setRightHand(item)                 // void
inv.getLeftHand()                      // IItemStack — offhand
inv.setLeftHand(item)                  // void
inv.getProjectile()                    // IItemStack — ranged projectile
inv.setProjectile(item)                // void
inv.getArmor(slot)                     // IItemStack (0=boots 1=legs 2=chest 3=head)
inv.setArmor(slot, item)               // void

// Loot / drop inventory (what NPC carries and can drop on death)
inv.setDropItem(slot, item, chance)    // void  (chance 0-100)
inv.getDropItem(slot)                  // IItemStack
inv.getItemsRNG()                      // IItemStack[]  (all loot slots)

// XP drop range
inv.getExpMin() / inv.getExpMax()      // Number
inv.setExp(min, max)                   // void
```

**Slot conventions used by LLM_MODULE:**
| Slot | Content |
|------|---------|
| RightHand | Primary weapon |
| LeftHand (Offhand) | Primary ammo stack |
| DropItem slot 0 | Secondary weapon |
| DropItem slot 1 | Secondary ammo stack |
| DropItem slot 2 | Melee weapon |
| Armor slot 2 | Chestplate |

---

## IPlayer — Player Entity API

```javascript
event.player.getName()                 // String
event.player.getUUID()                 // String
event.player.getInventory()            // IContainer  (36-slot player inventory)
event.player.getInventoryHeldItem()    // IItemStack  (hotbar selected item)
event.player.getMainhandItem()         // IItemStack
event.player.getOffhandItem()          // IItemStack
event.player.getHealth()               // Number
event.player.getMaxHealth()            // Number
event.player.message(text)             // send chat message to this player
event.player.getWorld()                // IWorld
event.player.getTimers()               // ITimers
event.player.getX() / getY() / getZ() // Number
event.player.getRotation()             // Number (yaw)
event.player.giveItem(item)            // boolean
event.player.removeItem(item, amount)  // boolean
event.player.getTempdata()             // IData
event.player.getStoreddata()           // IData
```

---

## IWorld — World API

```javascript
var world = npc.getWorld()

world.createItem(name, count)          // IItemStack  ← use this to create items by registry ID
world.createItemFromNbt(nbt)           // IItemStack
world.getBlock(x, y, z)               // IBlock
world.getNearbyEntities(x, y, z, range, type) // IEntity[]
world.getClosestEntity(x, y, z, range, type)  // IEntity
world.getAllEntities(type)             // IEntity[]
world.getAllPlayers()                  // IPlayer[]
world.getPlayer(name)                  // IPlayer
world.getTime()                        // number (ticks since world creation)
world.isDay()                          // boolean
world.isRaining()                      // boolean
world.getBiomeName(x, z)              // String
world.broadcast(message)               // send to all players
world.playSoundAt(pos, sound, vol, pitch)
world.spawnParticle(particle, x,y,z, dx,dy,dz, speed, count)
world.getTempdata()                    // IData
world.getStoreddata()                  // IData
world.explode(x, y, z, range, fire, grief)
world.executeCommand(world, cmd)       // String
```

**Entity type constants (use numeric literals at runtime):**
```
-1 = ANY      1 = PLAYER    2 = NPC       3 = MONSTER
 4 = ANIMAL   5 = LIVING    6 = ITEM      7 = PROJECTILE
```

---

## ITimers — Timer API

```javascript
var timers = npc.getTimers()   // or player.getTimers() / block.getTimers()

timers.forceStart(id, ticks, repeat)   // start timer (overwrites existing)
timers.start(id, ticks, repeat)        // start timer (throws if id exists)
timers.stop(id)                        // boolean
timers.has(id)                         // boolean
timers.reset(id)                       // reset countdown
timers.clear()                         // stop all timers
```

**Pattern — repeating 1-second tick:**
```javascript
function init(event) {
  event.npc.getTimers().forceStart(1, 20, true)   // fires every 20 ticks = 1 second
}

function timer(event) {
  if (event.id !== 1) { return }
  // your periodic logic here
}
```

---

## IItemStack — Item API

```javascript
item.getName()                         // String — registry ID (e.g. "tacz:ak47")
item.getDisplayName()                  // String — shown name
item.getItemName()                     // String — localization key
item.getStackSize()                    // Number
item.setStackSize(n)                   // void
item.isEmpty()                         // boolean
item.getNbt()                          // INbt
item.hasNbt()                          // boolean
item.getType()                         // Number (ItemType_*)
item.isBlock()                         // boolean
item.isWearable()                      // boolean
item.copy()                            // IItemStack
item.setAttribute(name, value)         // void
item.getAttribute(name)                // Number
item.getTempdata()                     // IData
item.getStoreddata()                   // IData
```

---

## IData — Key-Value Store

```javascript
// Temp data: cleared on world reload
var temp = npc.getTempdata()
temp.put("key", value)    // Object (String, Number, Boolean, IItemStack, etc.)
temp.get("key")           // Object
temp.has("key")           // boolean
temp.remove("key")        // void
temp.clear()              // void
temp.getKeys()            // String[]

// Stored data: persists through restarts (Strings and Numbers only)
var store = npc.getStoreddata()
store.put("key", "value")
store.get("key")
```

---

## INbt — NBT Tag API

```javascript
var nbt = npc.getNbt()
nbt.has(key)                           // boolean
nbt.getString(key)                     // String
nbt.putString(key, value)              // void
nbt.getInteger(key)                    // Number
nbt.setInteger(key, value)             // void
nbt.getBoolean(key)                    // boolean
nbt.setBoolean(key, value)             // void
nbt.getFloat(key)                      // Number
nbt.setFloat(key, value)               // void
nbt.getCompound(key)                   // INbt
nbt.setCompound(key, nbt)              // void
nbt.getKeys()                          // String[]
nbt.toJsonString()                     // String
nbt.merge(otherNbt)                    // void
nbt.clear()                            // void
nbt.isEmpty()                          // boolean
```

---

## INPCAi — NPC AI Settings

```javascript
var ai = npc.getAi()
ai.getAnimation()                      // Number
ai.setAnimation(type)                  // AnimationType_* constant
ai.getMovingType()                     // Number
ai.setMovingType(type)                 // void
ai.getWalkingSpeed()                   // Number
ai.setWalkingSpeed(speed)              // void
ai.getAggroRange()                     // (via getStats())
ai.getTacticalType()                   // Number (TacticalType_*)
ai.setTacticalType(type)               // void
ai.getRetaliateType()                  // Number
ai.setRetaliateType(type)              // void
ai.getWanderingRange()                 // Number
ai.setWanderingRange(range)            // void
ai.getCanSwim()                        // boolean
ai.setCanSwim(bo)                      // void
```

---

## Thread-based Delays (ES5)

```javascript
function interact(event) {
  var npc = event.npc
  var Thread = Java.type("java.lang.Thread")
  var HThread = Java.extend(Thread, {
    run: function() {
      npc.say("Starting sequence...")
      Thread.sleep(2000)               // 2-second delay
      npc.say("Done.")
    }
  })
  new HThread().start()
  npc.say("This runs immediately.")
}
```

---

## Loading Scripts (Path Resolution)

Always anchor `load()` calls to `NpcAPI.getLevelDir()` to work in both
single-player and dedicated-server environments:

```javascript
var _API          = Java.type("noppes.npcs.api.NpcAPI")
var LLM_BASE_PATH = _API.getLevelDir() + "scripts/ecmascript/LLM_MODULE"
load(LLM_BASE_PATH + "/core/loader.js")
```

---

## Reading JSON Config Files

```javascript
function _loadJson(path) {
  var File       = Java.type("java.io.File")
  var FileReader = Java.type("java.io.FileReader")
  var JsonParser = Java.type("com.google.gson.JsonParser")
  var file = new File(path)
  if (!file.exists()) { throw new Error("File not found: " + path) }
  var reader = new (Java.type("java.io.BufferedReader"))(new FileReader(file))
  var sb = new (Java.type("java.lang.StringBuilder"))()
  var line
  while ((line = reader.readLine()) !== null) { sb.append(line).append("\n") }
  reader.close()
  return JSON.parse(sb.toString())
}
```

---

## Projectile Example

```javascript
function interact(event) {
  var npc    = event.npc
  var player = event.player
  var world  = npc.getWorld()
  var P      = world.createEntity("customnpcs:customnpcprojectile")
  var item   = world.createItem("minecraft:arrow", 1)
  P.setItem(item)
  P.setPosition(npc.getX(), npc.getY() + 1.5, npc.getZ())
  P.setHeading(player)
  world.spawnEntity(P)
  var n = P.getEntityNbt()
  n.setFloat("damagev2", 8)
  P.setEntityNbt(n)
}
```

---

## Direction Vector Helper

```javascript
function FrontVectors(entity, dr, dp, distance, mode) {
  if (!mode) { mode = 0 }
  var angle, pitch
  if (mode === 1) {
    angle = dr + entity.getRotation()
    pitch = (-entity.getPitch() + dp) * Math.PI / 180
  } else {
    angle = dr
    pitch = dp * Math.PI / 180
  }
  var dx = -Math.sin(angle * Math.PI / 180) * (distance * Math.cos(pitch))
  var dy =  Math.sin(pitch) * distance
  var dz =  Math.cos(angle * Math.PI / 180) * (distance * Math.cos(pitch))
  return [dx, dy, dz]
}
```
