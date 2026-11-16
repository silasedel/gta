# Southline: read this first (every lane)

You are one of 4 Claude Code sessions (see `01_FOUR_ACCOUNT_PLAN.md`, which overrides lane letters), each on a different account, building the same game in parallel for a YouTube video due Wednesday Nov 18. Goal: **professional-quality** open-world crime game (original; real-scale Miami-style city plus an island, on the user's road map). The bar is GTA 6 footage: photoreal with a game finish, smooth (no grain, no dots, no pixelation), locked 1080p, **60 fps on ordinary hardware**. Graphics are cut last.

## Read, in this order
1. `docs/v2/plan/BIG_UPDATE_PLAN.md` (esp. sections 0-2, 13 = the user's final answers, 12 scope).
2. `docs/v2/plan/EXECUTION_PLAN.md` (lanes, gaps).
3. Your lane brief `docs/v2/briefs/LANE_<letter>.md`.
4. `docs/v2/LEAD_STATE.md`, `references/` and `docs/v2/plan/` images (road map, HUD, house photos).
Model library: `~/Downloads/Models` (README.txt, catalog.csv). Never copy brand names; use made-up brands. American spelling.

## Rules
- **Branch:** work only on your branch (`lane-a` ... `lane-e`), created from `v2`. Never push to `main` or `v2`. Commit small and often. Push your branch to the `gta-v2` remote when told (every checkpoint).
- **Files:** only edit files your lane owns (listed in your brief). If you need a change in another lane's file, write it in `docs/v2/briefs/REQUESTS.md` (lane, file, what, why) and keep going.
- **Quality:** after every big step, take screenshots in the real app (Electron/Mac or headless browser at 1080p), look at them yourself, fix what looks bad, and save the best to `docs/v2/shots/<lane>/`. Never claim done without looking. Do not take shortcuts that make it look worse ("slop layers": dithering, noise, flat colors, floating or clipping objects).
- **Performance:** every change is measured; the frame budget is 16.6 ms at 1080p on a mid laptop GPU. Use instancing, LOD, culling. Report ms before/after.
- **Usage:** you have about 0.9 of a weekly plan. Use Opus-class models for design and hard work, cheaper models for mechanical checks. Run heavy commands in the background. Ask nothing the code or docs already answer.
- **Reports:** append a short status to `docs/v2/briefs/STATUS_<letter>.md` at every checkpoint: done, in progress, blocked, screenshots, fps.
- **Checkpoints (user local time):** Mon 12:00, Mon 22:00, Tue 12:00, Tue 22:00 (feature freeze), Wed 12:00 (final merge, Mac app build, V2.1 publish by account 3).
- **Do not:** touch the user's published repo history, delete assets, publish anything, enter credentials, or use files whose license is not free for games. 4 catalog rows are "personal use only": exclude them (see EXECUTION_PLAN.md).

## Integration
Account 3 merges accounts 1, 2, 3, 4 at each checkpoint into branch `integration`, runs the game, and reports breakage into `REQUESTS.md`. Fixes go to the owning lane.
