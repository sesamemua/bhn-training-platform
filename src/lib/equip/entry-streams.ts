/** The URL spelling of each stream, kept apart from the stored value so
 *  a link on somebody else's website is not a database identifier. */
export const STREAMS: Record<string, "venture_connect" | "venture_lift"> = {
  "venture-connect": "venture_connect",
  ventureconnect: "venture_connect",
  connect: "venture_connect",
  "venture-lift": "venture_lift",
  venturelift: "venture_lift",
  lift: "venture_lift",
};
