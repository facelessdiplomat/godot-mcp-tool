import type { Scenario } from '../Scenario.js';
import { animateADoor } from './animateADoor.js';
import { buildAnArena } from './buildAnArena.js';
import { cameraFollow } from './cameraFollow.js';
import { characterStates } from './characterStates.js';
import { collectCoins } from './collectCoins.js';
import { dashWithATest } from './dashWithATest.js';
import { exportTheGame } from './exportTheGame.js';
import { extractEnemyScene } from './extractEnemyScene.js';
import { findABugWithBreakpoints } from './findABugWithBreakpoints.js';
import { fixTheJumpError } from './fixTheJumpError.js';
import { followThePlayer } from './followThePlayer.js';
import { gamepadControls } from './gamepadControls.js';
import { healthBarHud } from './healthBarHud.js';
import { importACharacter } from './importACharacter.js';
import { patrolBetweenPoints } from './patrolBetweenPoints.js';
import { pauseMenu } from './pauseMenu.js';
import { playtestWithoutAWindow } from './playtestWithoutAWindow.js';
import { stopTheSlowdown } from './stopTheSlowdown.js';
import { thirdPersonPrototype } from './thirdPersonPrototype.js';
import { tidyTheProject } from './tidyTheProject.js';

export const allScenarios: readonly Scenario[] = [
  buildAnArena,
  thirdPersonPrototype,
  dashWithATest,
  healthBarHud,
  fixTheJumpError,
  patrolBetweenPoints,
  collectCoins,
  pauseMenu,
  cameraFollow,
  stopTheSlowdown,
  gamepadControls,
  extractEnemyScene,
  importACharacter,
  followThePlayer,
  animateADoor,
  characterStates,
  tidyTheProject,
  exportTheGame,
  findABugWithBreakpoints,
  playtestWithoutAWindow,
];
