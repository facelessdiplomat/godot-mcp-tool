# Translate the menu

**Request**

> Translate the main menu into German: when the game runs in German, its Start button should read Starten and its Quit button Beenden.

**Starting point**

`res://menu.tscn`, the main scene: a full-screen `Control` with a `VBoxContainer` named `Buttons` that holds two
buttons, `Start` and `Quit`, whose texts are "Start" and "Quit".

**Done when**

- Run in German, the `Start` button shows "Starten" and the `Quit` button "Beenden".
- Run in English, the `Start` button still shows "Start".

**Notes**

- A CSV translation (`keys,en,de`) that the editor imports, listed in `internationalization/locale/translations` with
  `project_settings_set`, does it; `game_run` with `locale` shows each language.
- The check reads `atr(text)` of each button, so a translation key in `text` and a translated text set by a script
  both count.
- Evaluation run: `server/test/evals/scenarios/translateTheMenu.ts`.
