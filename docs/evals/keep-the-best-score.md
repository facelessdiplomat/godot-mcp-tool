# Keep the best score

**Request**

> The best score in the Score autoload goes back to 0 every time the game starts. Save it to user://save.json whenever it changes and load it when the game starts.

**Starting point**

The arena with a walking, jumping player as the main scene, and an autoload `Score` (`res://score.gd`) that holds
`var best := 0` and nothing else.

**Done when**

- The scripts have no errors.
- A best score set in one run of the game is there in the next run.
- `user://save.json` holds that score.

**Notes**

- A setter on `best` that saves, and `_ready` that loads, is enough; `game_set_properties` on `/root/Score`, which
  sets script variables without `@export` and runs their setters, and a second `game_run` show that it works.
- `user_data_get` shows the saved file; `user_data_delete`, an unsafe tool, clears it.
- Evaluation run: `server/test/evals/scenarios/keepTheBestScore.ts`.
