import type { Scenario } from '../Scenario.js';
import { aLevelOfTiles } from './aLevelOfTiles.js';
import { animateADoor } from './animateADoor.js';
import { blocksFromAScene } from './blocksFromAScene.js';
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
import { oneMoreArgument } from './oneMoreArgument.js';
import { theCrateByTheRamp } from './theCrateByTheRamp.js';
import { onlyThePlayerOpensTheDoor } from './onlyThePlayerOpensTheDoor.js';
import { patrolBetweenPoints } from './patrolBetweenPoints.js';
import { paintOneEnemy } from './paintOneEnemy.js';
import { pauseMenu } from './pauseMenu.js';
import { paveTheCourtyard } from './paveTheCourtyard.js';
import { playtestWithoutAWindow } from './playtestWithoutAWindow.js';
import { reachTheIsland } from './reachTheIsland.js';
import { renameEverywhere } from './renameEverywhere.js';
import { sameLookAfterTheRefactor } from './sameLookAfterTheRefactor.js';
import { resumeTheMenu } from './resumeTheMenu.js';
import { rideTheRail } from './rideTheRail.js';
import { silenceInTheArena } from './silenceInTheArena.js';
import { skinTheMenu } from './skinTheMenu.js';
import { sparksOnImpact } from './sparksOnImpact.js';
import { stopTheSlowdown } from './stopTheSlowdown.js';
import { swingTheGate } from './swingTheGate.js';
import { swordInHand } from './swordInHand.js';
import { thirdPersonPrototype } from './thirdPersonPrototype.js';
import { tidyTheProject } from './tidyTheProject.js';
import { translateTheMenu } from './translateTheMenu.js';
import { turnOnAPlugin } from './turnOnAPlugin.js';
import { whyIsItDark } from './whyIsItDark.js';

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
  onlyThePlayerOpensTheDoor,
  sparksOnImpact,
  skinTheMenu,
  rideTheRail,
  swingTheGate,
  swordInHand,
  blocksFromAScene,
  reachTheIsland,
  silenceInTheArena,
  whyIsItDark,
  sameLookAfterTheRefactor,
  oneMoreArgument,
  theCrateByTheRamp,
];
