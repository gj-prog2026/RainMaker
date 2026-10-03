<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Agent behaviour is deterministic logic in src/lib/agent.ts behind /api/* server routes; the client (src/lib/api.ts) falls back to local logic so a real AI backend can be swapped in without UI changes.
- Gemma (src/lib/gemma.server.ts, getModel) and ElevenLabs (src/lib/eleven.server.ts) are called only from /api/* routes; every route returns source/model and falls back to the deterministic logic on any failure.
- Story video ads render client-side in src/lib/story-video.ts (canvas + Web Audio + MediaRecorder); narration comes from /api/voice and is cached per script; music falls back to a synthesised beat when public/audio/{mood}.mp3 is missing. Why: no server video tooling on the edge runtime.
- Poster themes are a fixed preset list (THEMES in src/lib/postkit.ts); posters and video read colours from the preset, never free-form values. Why: AI edits stay validated and readable.
