// iibcode fork: single source for the fork's brand strings. Keeping them here
// means rebranding touches upstream files in as few lines as possible — each
// call site is a one-line change that is trivial to re-apply after an
// upstream merge conflict.
export const BRAND = {
  /** Product name shown in terminal titles and UI chrome. */
  name: "iibcode",
  /** Short prefix for terminal titles ("iib | <session title>"). */
  short: "iib",
}
