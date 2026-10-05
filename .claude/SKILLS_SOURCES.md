# Installed Claude Code skills

Project skills live in `.claude/skills/` (auto-loaded by Claude Code). Sources:

| Source | Skills |
|---|---|
| anthropics/claude-code (frontend-design plugin) | frontend-design |
| anthropics/skills | canvas-design, web-artifacts-builder |
| ComposioHQ/awesome-claude-skills | theme-factory, brand-guidelines |
| AlmogBaku/debug-skill | debugging-code |
| PleasePrompto/notebooklm-skill | notebooklm |
| netresearch/file-search-skill | file-search |
| haidrrrry/claude-remotion-skill | remotion-motion-graphics |
| juliusbrussee/caveman | caveman*, cavecrew, megacave, ultracave, investigate-first, lean-build, migration, safe-refactor, surgical-patch, verify-and-stop |
| obra/superpowers | brainstorming, writing-plans, executing-plans, systematic-debugging, test-driven-development, … |
| kepano/obsidian-skills | obsidian-cli, obsidian-bases, obsidian-markdown, json-canvas, defuddle, knap |
| diegosouzapw/OmniRoute | omni-*, cli-*, config-codex-cli, ponytail |
| coreyhaines31/marketingskills | copywriting, cro, pricing, … (its `seo-audit` renamed `marketing-seo-audit`) |
| AgricIDaniel/claude-seo | seo, seo-* ; agents in `.claude/agents/`, runtime in `.claude/vendor/claude-seo/` |

Not installed: `infinri/Writ` (a Docker/Python enforcement plugin, not a skill — install with
`claude plugin marketplace add infinri/Writ && claude plugin install writ@writ`) and
`travisvn/awesome-claude-skills` (a curated link list with no skills of its own).
