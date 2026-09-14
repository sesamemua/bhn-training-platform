/**
 * Keep page-level single-key shortcuts from eating keystrokes typed into a
 * Shadow-DOM editor.
 *
 * The video script editor mounts its document inside a shadow root so the
 * original guide's CSS stays isolated. The cost: any listener outside that
 * root sees the event retargeted to the host — a plain <div> — and cannot
 * tell the person is typing. The Vercel Toolbar, injected on this site for
 * team members, binds "c" to Comments with a capture-phase listener that
 * calls preventDefault unless the target is editable, so "c" vanished
 * mid-sentence and opened the comment tool instead.
 *
 * Stopping propagation from inside cannot fix that: a window capture
 * listener registered before ours runs first, whatever we do at the target.
 * What works is answering its question truthfully — while focus is inside
 * the editor, the host reports as contenteditable, so any "is the user
 * typing?" check reading the target says yes.
 *
 * Measured before shipping:
 *  - contenteditable descendants that opt out (the Gantt grid, injected
 *    buttons) stay non-editable, and a read-only document stays read-only;
 *  - adding the attribute mid-focus keeps focus and the caret where they
 *    are, but REMOVING it mid-focus blurs the editor. So removal waits a
 *    tick and only happens once focus has actually left the shadow tree.
 *
 * Returns a cleanup function.
 */
export function shieldShadowTyping(
  host: HTMLElement,
  shadow: ShadowRoot,
  isEditable: () => boolean,
): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;

  const onFocusIn = () => {
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
    if (isEditable()) host.setAttribute("contenteditable", "true");
  };

  const onFocusOut = () => {
    if (pending) clearTimeout(pending);
    // Moving between two editable spans inside the editor fires focusout
    // first; stripping the attribute then would blur the one being entered.
    // A window losing focus keeps shadow.activeElement, so the attribute
    // stays and typing works the moment the person comes back.
    pending = setTimeout(() => {
      pending = null;
      if (!shadow.activeElement) host.removeAttribute("contenteditable");
    }, 0);
  };

  shadow.addEventListener("focusin", onFocusIn);
  shadow.addEventListener("focusout", onFocusOut);

  return () => {
    if (pending) clearTimeout(pending);
    shadow.removeEventListener("focusin", onFocusIn);
    shadow.removeEventListener("focusout", onFocusOut);
    host.removeAttribute("contenteditable");
  };
}
