import type { Scenario } from '../Scenario.js';
import { aLevelOfTiles } from './aLevelOfTiles.js';
import { animateADoor } from './animateADoor.js';
import { bringBackThePillars } from './bringBackThePillars.js';
import { buildAnArena } from './buildAnArena.js';
import { cameraFollow } from './cameraFollow.js';
import { characterStates } from './characterStates.js';
import { collectCoins } from './collectCoins.js';
import { cratesOnTheHill } from './cratesOnTheHill.js';
import { dashWithATest } from './dashWithATest.js';
import { exportsForWindowsAndLinux } from './exportsForWindowsAndLinux.js';
import { exportTheGame } from './exportTheGame.js';
import { extractEnemyScene } from './extractEnemyScene.js';
import { findABugWithBreakpoints } from './findABugWithBreakpoints.js';
import { findTheSlowFunction } from './findTheSlowFunction.js';
import { fixTheJumpError } from './fixTheJumpError.js';
import { fixTheWaterShader } from './fixTheWaterShader.js';
import { followThePlayer } from './followThePlayer.js';
import { footstepsAndBlend } from './footstepsAndBlend.js';
import { gamepadControls } from './gamepadControls.js';
import { healthBarHud } from './healthBarHud.js';
import { hudAtTwoSizes } from './hudAtTwoSizes.js';
import { importACharacter } from './importACharacter.js';
import { keepTheBestScore } from './keepTheBestScore.js';
import { landOnce } from './landOnce.js';
import { musicOnItsOwnBus } from './musicOnItsOwnBus.js';
import { patrolBetweenPoints } from './patrolBetweenPoints.js';
import { paintOneEnemy } from './paintOneEnemy.js';
import { pauseMenu } from './pauseMenu.js';
import { paveTheCourtyard } from './paveTheCourtyard.js';
import { playtestWithoutAWindow } from './playtestWithoutAWindow.js';
import { renameEverywhere } from './renameEverywhere.js';
import { resumeTheMenu } from './resumeTheMenu.js';
import { stopTheSlowdown } from './stopTheSlowdown.js';
import { thirdPersonPrototype } from './thirdPersonPrototype.js';
import { tidyTheProject } from './tidyTheProject.js';
import { translateTheMenu } from './translateTheMenu.js';
import { turnOnAPlugin } from './turnOnAPlugin.js';

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
  paintOneEnemy,
  landOnce,
  resumeTheMenu,
  cratesOnTheHill,
  footstepsAndBlend,
  hudAtTwoSizes,
  renameEverywhere,
  findTheSlowFunction,
  fixTheWaterShader,
  bringBackThePillars,
  turnOnAPlugin,
  exportsForWindowsAndLinux,
  keepTheBestScore,
  musicOnItsOwnBus,
  translateTheMenu,
  paveTheCourtyard,
  aLevelOfTiles,
];
