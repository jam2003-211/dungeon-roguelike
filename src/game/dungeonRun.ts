import { createBattleState, type BattleState } from './battle'
import { instantiateEnemies, stairAction, type GeneratedDungeon } from './dungeon'
import type { PlayerState } from './player'

export interface DungeonRunState {
  currentFloor: number
  battle: BattleState
}

export function startDungeonRun(player: PlayerState, dungeon: GeneratedDungeon): DungeonRunState {
  const floor = dungeon.floors[0]
  return { currentFloor: 1, battle: createBattleState(player, instantiateEnemies(floor), floor.start) }
}

export function advanceDungeonRun(run: DungeonRunState, dungeon: GeneratedDungeon): { run: DungeonRunState; cleared: boolean } {
  const floor = dungeon.floors[run.currentFloor - 1]
  const action = stairAction(floor, dungeon.totalFloors, run.battle.combat.position, run.battle.combat.enemies)
  if (action === 'clear') return { run, cleared: true }
  if (action !== 'next') return { run, cleared: false }
  const nextNumber = run.currentFloor + 1; const nextFloor = dungeon.floors[nextNumber - 1]
  const fresh = createBattleState(run.battle.player, instantiateEnemies(nextFloor), nextFloor.start)
  return { cleared: false, run: { currentFloor: nextNumber, battle: { ...fresh, combat: { ...fresh.combat, turn: run.battle.combat.turn }, cooldowns: { ...run.battle.cooldowns }, guardTurns: run.battle.guardTurns, experienceEarned: run.battle.experienceEarned, levelNotices: [...run.battle.levelNotices] } } }
}
