/**
 * Moves focus to the element with `id` once React has rendered it (design-system 6.1 focus rules,
 * CO-01): for controls that replace the one the user pressed, such as a vendor card that moved to
 * another column. Tries for a few frames, then gives up quietly.
 */
export function focusById(id: string, frames = 5): void {
  const attempt = (left: number) => {
    const element = document.getElementById(id);
    if (element) element.focus();
    else if (left > 0) requestAnimationFrame(() => attempt(left - 1));
  };
  requestAnimationFrame(() => attempt(frames));
}
