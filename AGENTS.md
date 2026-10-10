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

## Editor architecture
- Keep local media and edit state in the browser, with explicit project downloads; local files must not be uploaded implicitly.
- Keep shared editor types and formatting in a browser-safe model module; isolate draggable canvas rendering behind ClientOnly for SSR safety.
- Export compositions through canvas capture and MediaRecorder with capability checks; label the actual output format and audio limitations.
- Store imported font binaries alongside local media and font descriptors in each project; load FontFace resources before preview reopening and export so typography survives reloads.
- Keep tool navigation beside the workspace and partition timeline lanes by content type so editing controls do not consume timeline height.
