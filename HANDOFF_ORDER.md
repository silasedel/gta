# Handoff order (for the user): 3 full accounts, then the half account last

Hand the folder from AI to AI in this order. Each account does exactly one stage and hands back the whole folder.

| Order | Account | Stage file | Budget | What it hands over |
|---|---|---|---|---|
| 1 | Full account A | `docs/v2/briefs/STAGE_1_WORLD.md` | about 95% of a week | The new traced map, roads, traffic, buildings, clean smooth graphics, weather, the exact HUD, and `docs/v2/CONVENTIONS.md` |
| 2 | Full account B | `docs/v2/briefs/STAGE_2_PEOPLE.md` | about 95% | About 100 people with crowds, every shop and interior including the casino and hotel lobbies, Nico's house, the dialogue wheel |
| 3 | Full account C | `docs/v2/briefs/STAGE_3_VEHICLES.md` | about 95% | About 60 cars with color variants, damage, theft, boats and air, the full police system, polish pass |
| 4 | Half account (dad) | `docs/v2/briefs/STAGE_4_FINISH.md` | about 50% | Shop buying and robbery, jobs, weapons, radio, save, the casino heist, final check |

Every account is told to leave about 5% of its weekly usage unused.

## What you do for each handoff
1. **Receive:** unzip the folder the previous account gave you (same layout) into a new folder, so you keep the older one as a backup.
2. **Check, 5 minutes:** run `npm install` then the game. Open `docs/v2/briefs/STATUS_stage<N>.md` and the screenshots. Look at the "done test" list in that stage's brief. If something important is clearly broken, send the previous account a short message to fix it (it has about 5% left, so only for small things) or tell the next account about it.
3. **Models:** open `docs/v2/briefs/MODEL_REQUESTS_stage<N>.md`. Download or generate what it asks for (common and small: download; big or polished: download; custom single items: Tripo) and put the files into `Models/` in the right category folder. Do this while the previous stage is still running so nothing waits.
4. **Zip:** zip the whole folder without `node_modules`. You need about 33 GB free (or send `Models/` as a separate link, since nobody changes it).
5. **Message to paste to the next account** (change the number):
   "Read `READ_ME_FIRST.md` in the project folder, then your stage file. You are stage N. Start now: run the app, take a screenshot, and tell me which model and effort to use for your first job."
6. **Set the model and effort** the new account recommends (it tells you at the start and when the work changes).

## What each account must leave for the next
- A folder that runs (`npm install` then the dev server or the desktop build).
- `docs/v2/CONVENTIONS.md` updated.
- `STATUS_stage<N>.md`, `MODEL_REQUESTS_stage<N>.md` and screenshots inside the folder.
- Nothing deleted from `Models/` or `references/`.

## If an account runs out early
Stage budgets inside each brief tell it what to cut first. Anything left over goes to the next account: tell it in your handoff message ("stage 2 did not finish X, please do it first"). The last stage (half account) has the smallest budget, so if earlier stages leave work, drop the heist's extra polish before dropping basic shop and job systems.
