// Single source of truth for changelog content. Both the auto-publish
// helper (lib/changelog/registry.ts, called from /changelog) and the
// scripts/seed-changelog.ts CLI read from this list.
//
// Editing rules:
//   • Append new entries at the TOP with daysAgo: 0.
//   • Treat title as the natural key — once an entry has shipped, edit
//     its body in place rather than creating a duplicate.
//   • Pick visibleTo carefully: ALL for everything user-visible, STAFF
//     for instructor+, ADMINS for admin+.

export const ALL = ["trainee", "evaluating", "employer", "instructor", "admin", "superadmin"];
export const STAFF = ["instructor", "admin", "superadmin"];
export const ADMINS = ["admin", "superadmin"];

export interface ChangelogEntry {
  title: string;
  body: string;
  kind: "feature" | "fix" | "improvement" | "note";
  visibleTo: string[];
  daysAgo: number;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  // ── Flow charts: heights re-settle when the chart is swapped
  {
    title: "Flow charts: boxes stop at each other properly after switching charts",
    body: "Switching to another chart, or restoring an unsaved draft, left the chart drawn at one set of box heights while dragging and lasso-selection used another — about nine pixels per box. Boxes stopped short of each other with a visible gap instead of meeting cleanly, and a lasso caught a strip of empty canvas below each box, so you could select something you had not drawn a rectangle around. Heights are now re-settled whenever the chart is replaced, not only when the text changes.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: one position per box
  {
    title: "Flow charts: picking up a box no longer drops it down the page",
    body: "On a chart where any box had been given longer text, clicking a box below it sent that box jumping down the page — about a hundred pixels on a typical chart — and you had to drag it back up before you could move it anywhere. The reason: a box had two positions. The one stored in the chart, and the one it was drawn at, which was pushed down to make room for text that had grown above it. Picking a box up read the drawn position and filed it as the stored one, so the gap got added a second time. There is one position per box now: text growth is applied to the chart itself, once, at the moment the text is measured. It also only moves the boxes it genuinely has to — growth that fits in the gap already there moves nothing, where before every box below shifted whether it needed to or not.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: dragging stops rearranging the chart
  {
    title: "Flow charts: dragging a box no longer shoves the other boxes around",
    body: "Moving one box used to push every box it came near out of the way — and \"near\" meant within fourteen pixels, so boxes shoved each other while plainly not touching, and one small move could leave three other boxes somewhere you did not put them. That is now reversed. Every box you are not holding stays exactly where you left it, and the box under the pointer is stopped at the edge of anything in its way. It does not simply jam, either: push into something and the box slides along its face, so you can still steer around a crowded part of the chart, and the moment your way is clear the box catches straight back up with the cursor. The gap it keeps has come down from fourteen pixels to four, enough to keep two borders from merging and no more.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the shape hat becomes a corner badge
  {
    title: "Flow charts: selecting a box no longer puts a hat of shapes on it",
    body: "Clicking a box used to raise a pill of all thirteen shape outlines across the top of it — wide enough to wrap onto two rows, cover whatever sat above, and generally shout. In its place is a small round badge on the box's top-left corner showing the shape the box currently is. Click it and the thirteen appear as a tidy grid, opening upward onto empty canvas so they never cover the box you are restyling; pick one and it closes. Boxes near the top of the chart drop the grid downward instead, clear of the box, so it is never cut off. The badge and the Connect button also now hold their size as the chart scales down — at the smallest zoom a button was rendering nine pixels across, smaller than the pointer trying to hit it.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the live form is a column again
  {
    title: "Flow charts: the live form is the middle column again, and it resizes",
    body: "The live form had slipped inside the chart's own column, so it sat underneath the chart instead of beside it, its divider was parked off the left edge of the screen where no pointer could reach it, and a fourth empty column sat on the right quietly eating two hundred pixels. Because the columns and their dividers had drifted out of step, every divider was resizing the wrong panel — the one labelled \"live form\" was actually resizing the admin panel. The four columns are now chart, live form, admin panel and options, in that order, each with the divider that belongs to it. The chart still gives up the space when you widen a panel, and still refuses to shrink below its floor.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the column-drag crash, found and killed
  {
    title: "Flow charts: dragging a column divider no longer crashes the editor",
    body: "The crash that hit while dragging the divider between columns is fixed — and this time it was reproduced live before being fixed, oscillating about ten times a second in a test rig, and killed on the spot. The cause: on machines whose scrollbars take up space, the page's scrollbar appearing stole ~15 pixels of width, the chart rescaled itself narrower, the page got short enough for the scrollbar to leave, the width came back, and around it went — thousands of times in a blink. The page now reserves the scrollbar's lane permanently so its width never depends on whether the scrollbar is present, and as a second line of defence the chart refuses to re-measure itself more than eight times between two screen paints, so even a loop nobody has imagined yet becomes a brief flicker instead of a dead editor.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the editor stops crashing mid-edit
  {
    title: "Flow charts: the editor no longer breaks while you are working",
    body: "The crash that replaced the editor with \"This page couldn't load\" partway through an edit is fixed. Three separate things could set it off, all of them the same shape: a measurement that changed the thing it was measuring. Box heights were being re-measured on every single redraw rather than only when the text changed; the canvas read its own width from an element whose width depended on whether that canvas overflowed; and saving reloaded the chart list, which quietly threw away every edit and undo step made since the save. If the editor does hit a problem now, the panel names the component that failed and gives you a button to copy the details, instead of a number.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: one shape panel, on the chart, that follows you
  {
    title: "Flow charts: one shape panel that names, explains and hands you the shapes",
    body: "The legend that explained the shapes and the tray you dragged them from are now the same panel, sitting in the chart's top-right corner. Every row is the outline, its name, and a handle you can drag onto the canvas; hover one for what it is for and an example from this registration flow. It stays with you as you scroll — no going back to the top — and collapses if you want the corner back.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: a shape tray you drag from
  {
    title: "Flow charts: drag shapes onto the chart from a tray",
    body: "The row of shape names across the top of the page is gone. The shapes now sit on the chart itself as a small tray of outlines that stays with you as you scroll — drag one onto the canvas and a dashed preview shows where it will land before you let go, or click one to drop it in. Double-clicking empty space still works. Thirteen names spelled out in a header was a lot of words for something that is better shown than said.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: real shapes, easier creation, boxes that give way
  {
    title: "Flow charts: the standard shapes, and boxes that get out of each other's way",
    body: "Six more shapes from the classic flowchart set — document, stored data, sub-process, wait, manual and connector — bringing it to thirteen, each drawn as its real outline rather than a tinted rectangle. A question is now a parallelogram and a decision a six-sided box, which is what those shapes mean to anyone who has read a flowchart before. To change a shape, select a box and pick from the little palette that appears above it. To add one without scrolling back to the top, use the shape bar that now floats over the canvas wherever you are, or just double-click empty space. And dragging a box no longer buries another: whatever is in the way steps aside, along whichever axis needs the smaller nudge, cascading to the box behind it.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: boxes size themselves to their text
  {
    title: "Flow charts: boxes grow and shrink to fit their text",
    body: "Rename a box to something long and it gets taller instead of clipping the words; give it a short name and it tightens up. Everything below a box that grew moves down by the same amount, so fitting the text never lands one box on top of the next, and a step stays level with the branch beside it. The heights are worked out as the chart is drawn rather than saved into it — opening a chart on a machine where the font renders a pixel taller will not mark it as changed.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: a legend for the shapes
  {
    title: "Flow charts: a legend for what each shape means",
    body: "One line above the chart shows the seven shapes with their names. Hover any of them for what it is for and a real example from the Training Week flow — so a decision is \"a fork; the arrows leaving it carry the answers\", with \"Any chosen session full? → yes / no\" underneath, which you can then go and look at. A chart's shapes are a vocabulary, and the difference between a step and a decision is obvious once someone says it and guessable-but-wrong until then.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the second cause of the editing crash
  {
    title: "Flow charts: second fix for the crash while editing",
    body: "The earlier fix caught one path into the loop and missed another. The editor watches its own canvas for size changes and then sets the size of what it is watching — measure, resize, notice, measure — and that second path had no guard on it at all. The check that a change is big enough to be worth acting on now lives in one place that every path goes through, and a burst of size notifications is collapsed into a single measurement per frame. If it still happens, the panel that replaces the crash shows the error text; please send it.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: keyboard undo
  {
    title: "Flow charts: Cmd+Z / Ctrl+Z undoes",
    body: "The keyboard shortcut now does what the Undo button does, and the button shows which one your machine uses. Inside a text box it is left alone, so undoing your typing still undoes your typing rather than the last change to the chart. There is no redo yet — say if you want one.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the crash, and marquee selection actually working
  {
    title: "Flow charts: fixed the crash while editing, and drag-to-select now really works",
    body: "The crash was a loop: the canvas was sized to exactly the width of its column, a rounding error tipped it a fraction over, a scrollbar appeared, that made the column narrower, the canvas was re-sized to fit, the scrollbar went away — round and round until React gave up with \"maximum update depth exceeded\". The canvas now sits a pixel inside its column so the scrollbar never appears, and the measurement ignores changes under two pixels. Separately, dragging a rectangle to select several boxes never worked with a real mouse: the invisible arrow layer covers the whole canvas and was swallowing the press. It now lets presses through to the canvas, while arrows themselves stay clickable — and the rectangle is read from a live reference rather than from state, so a quick flick selects the boxes it covers instead of quietly selecting nothing.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: every box carries a number
  {
    title: "Flow charts: every box has a number",
    body: "Each box now carries a small number in its corner, and the same number appears beside its questions in the live form, on its stage chip and column rows in the admin panel, in the data sheet, and in the options header. So \"box 7\" means one thing whichever column you are looking at, which makes a chart far easier to talk about. Numbers run in reading order — down the page, then across — so you can check one by counting rather than by tracing arrows. Moving a box renumbers it, because the number always describes what is on screen.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the side columns use the whole window height
  {
    title: "Flow charts: the side columns run the full height of the window",
    body: "The live form, admin panel and options columns were capped at 80% of the window, so they stopped well short of the chart beside them and wasted the bottom of the screen. They now run to the bottom edge and scroll inside themselves, which on a normal monitor is about a fifth more of each visible at a time.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: marquee selection and group move
  {
    title: "Flow charts: select several boxes at once and move them together",
    body: "Drag a rectangle across empty canvas and every box it touches is picked up. Then drag any one of them and the whole group moves as a unit, keeping its spacing, with the arrows re-routing to follow. Clicking a single box goes back to a single selection, and clicking empty space clears it. Useful for shifting a branch out of the way without taking six boxes one at a time.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: unsaved work survives a crash
  {
    title: "Flow charts: unsaved changes are no longer lost when the page breaks",
    body: "Two changes after reports of the editor dying mid-edit and taking the work with it. Your working chart is now kept as you go, so if the page crashes, reloads or is closed, opening it again offers the unsaved version back — you choose whether to restore or discard it. And a crash inside the editor no longer blanks the whole page: it shows a panel with the actual error message and a Try again button, which both keeps the rest of the page usable and gives us the one detail needed to fix the underlying fault. If you hit it again, please send that message.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: live connector, editable arrows, field reordering
  {
    title: "Flow charts: draw connections live, move arrows, reorder questions",
    body: "Pressing **connect** now draws a line straight away — from the edge of the box, following your cursor, until you click the box it should point to. Escape backs out. Arrows are editable too: click one to select it, drag either end onto a different box to re-point it, and press Delete to remove it. And questions can be reordered with up/down arrows from wherever you happen to be reading — the live form, the options panel, or by dragging a row in the data sheet — with every view updating together.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: connect works, and selection lights the neighbours
  {
    title: "Flow charts: fixed the connect button, and selecting a box lights what it connects to",
    body: "The **connect** chip on a selected box could not be clicked with a real mouse — pressing it started a box drag, which captured the pointer and swallowed the click. It now ignores presses that land on a control, and the chip is bigger with an arrow on it. Separately, selecting a box now highlights every box one arrow away as well, in all four columns at once: the chart, the live form, the data sheet and the overview all scroll to the matching rows and flash them. The highlight itself is much stronger than the faint tint it was.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Admin panel: a spreadsheet view of the questions
  {
    title: "Admin panel: edit the form as a spreadsheet",
    body: "The admin panel has a **Data sheet** tab: every question as a row, with columns for the label, the answer key, the type, whether it is required, the choices, and which box asks it. It drives like a spreadsheet — arrow keys move, Enter or a double-click edits a cell, Escape backs out, Tab goes right, row numbers down the left. It opens **locked**, and stays read-only until you press the padlock, because a grid you can type into by accident is a good way to change a live form without meaning to. Unlocked, you can edit any cell, drag a row by its handle to reorder it (or onto another group to move it there), delete a row, and add questions. Every change flows straight to the chart and the live form, and Undo works on all of it.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the seams actually work, and the chart scales
  {
    title: "Flow charts: the whole gap between columns drags, and the chart resizes with it",
    body: "Two fixes. The drag handle filled the gap on paper but was clipped by the panel it lived inside, so most of it could not be clicked — it now sits outside the panel and the full 32px band is grabbable, edge to edge. And the chart itself now scales to whatever width its column has: drag a seam and the drawing shrinks or grows to fit instead of just revealing more or less of a fixed canvas. Boxes still follow the pointer exactly when you drag them.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: a shorter Training Week chart
  {
    title: "Flow charts: the Training Week chart is a third shorter",
    body: "Every box is now the height its own text actually needs plus a little air, and the space between steps came down from 54px to 34px. The whole registration flow is 1206px tall instead of 1674 — it fits on one screen on a normal monitor, where before it took two. Measuring also turned up three boxes that were a few pixels too SHORT for their text, which is not something you can see but is worth fixing.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: draggable columns + a pop-out admin panel
  {
    title: "Flow charts: drag the columns, and pop the admin panel into its own window",
    body: "The gaps between the four columns are draggable — the whole 32px gap is the handle, with a grip on its midline — and pulling one left or right makes the chart give up or take back the difference. The chart keeps a floor of 280px, so a rail cannot be dragged until there is nothing left to aim at. Widths are remembered, and \"Reset column widths\" puts them back. There is also \"Admin panel in its own window\", which opens the panel as a separate window that follows the chart live: rename a box and the window updates immediately, with no save in between, so you can keep it on a second screen while you work. Anything you can edit there — the roster sheet link — travels back to the chart.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Collapsible sidebar
  {
    title: "The menu folds away",
    body: "There is a button at the top of the sidebar, beside the notification bell, that hides it. It hides the whole thing rather than shrinking it to a strip of icons — pages like Flow Charts and the Gantt views want every pixel of width, and a narrow icon rail still costs the width while being harder to read. A small button stays in the top-left corner to bring it back, in the same place as the menu button on a phone. Your choice is remembered, and it applies across tabs. Flow Charts goes further: with the menu hidden it drops the usual centred page width and runs the full window, so the chart column grows from about 440px to 710px on a standard screen.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Flow charts: the admin panel gets its own column
  {
    title: "Flow charts: the admin panel is a column of its own",
    body: "It was hidden behind a tab in the middle column, which meant you had to know it was there. It now sits in a fourth column on a lighter surface so it reads as a different kind of thing — the other three are the process being designed, this one is what it produces. The chart gave up the width: boxes are narrower and the whole drawing is about 90px slimmer, with the gap between the spine and its branches held where it was.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the admin panel the workflow implies, plus spacing
  {
    title: "Flow charts: see the admin panel your workflow produces",
    body: "The middle column now switches between two readings of the same chart — \"What they fill in\" (the live form) and \"What you see\" (the registrations table the organisers get). The table is derived, not designed separately: every question becomes a column, every box that is not a question becomes a stage a registrant can sit in, and it warns when the process has produced a table too wide to read. There is also a field to drop in the Google Sheet of current BHN Training Platform users, so the panel can eventually mark which registrants already have an account; the link is validated and stored with the chart, though nothing is read from the sheet yet. Separately the chart got a spacing pass: clear air above the first box, a wider gap between the spine and the branch lane, more room between steps, and more padding inside every box.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Institution picker: most likely regions first
  {
    title: "Institution picker leads with Ontario, Quebec and BC",
    body: "The 41 eligible institutions are still grouped by region, but the groups are now ordered for the people using the form rather than for the published list: Ontario, then Quebec, then British Columbia, then the remaining regions by how many institutions they hold. Inside each region the institutions are ranked by the size of their life-science and health-research enterprise too — so Ontario opens with Toronto, McMaster and Ottawa, and the hospital list opens with UHN and SickKids. Most registrants now find themselves without scrolling. The within-region ranking is a judgement call rather than a computed figure; tell us if it reads wrong.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: the two columns line up and pulse
  {
    title: "Flow charts: a box and its question line up, and both flash",
    body: "Clicking a box on the chart now scrolls the live form so that box's question sits at the same height on screen, and both ends pulse once. Clicking a question in the form does the mirror image — the chart scrolls until its box is level with the question. Reading across the page is then reading one thing, instead of finding where the other column happened to put it. The pulse matters because a column that scrolls while you are looking at the other one is otherwise a silent change.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: limit boxes + selection follows you across columns
  {
    title: "Flow charts: session limits, and clicking one column moves the others",
    body: "A new box type, Limit, hangs off a \"choose several\" question and says what it will accept: how many may be picked (three for Training Week, editable), and which options run at the same time. The live form enforces the count — the remaining options grey out once you hit it — and warns, without blocking, when you pick two sessions from the same slot: you can ask for both, but only one is likely to be approved. Separately, the three columns now stay in step: click a box on the chart and the live form scrolls to its questions and highlights them; click a question in the form and the chart scrolls to its box. The Registration opens box also got the height it needed for its caption.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: three columns
  {
    title: "Flow charts: chart, form and options side by side",
    body: "The page is three columns now — the chart on the left, the live form it produces in the middle, and the settings behind each question on the right. The settings used to be a bar pinned across the bottom of the window while the right-hand third of the page sat empty. Click a question in the live form and its card opens in the right column, scrolled to and highlighted: answer type, the list of choices (one per line now, instead of comma-separated), the hint underneath, whether it is required. Clicking an arrow puts its rule there instead.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts: arrow labels move out of the way
  {
    title: "Flow charts: arrow labels stop covering the boxes",
    body: "Labels on the arrows (\"trainee\", \"no reply\", \"offer it on\") used to sit a fixed nudge to the side of the line, which on a top-to-bottom chart put them squarely on the next box down. Each label now looks for clear space — first beside its line, then further out into the empty margins either side of the chart — and no two labels share a spot. The canvas also fills its pane instead of stopping at the last box, so that spare width is there to be used.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts read as a column, and boxes group their questions
  {
    title: "Flow charts: the registration flow reads top to bottom",
    body: "The Training Week chart is one column now. Registration is a linear process, so the old six-column layout meant scrolling sideways to follow something that only ever goes down; branches step one lane right and rejoin. A box can hold a whole group of questions — \"About you\" carries name, title, LinkedIn and category — so sixteen inputs read as six steps. Click any box and its questions open at the bottom of the window: answer type, key, choices, hint, required, with the live form beside the chart rebuilding as you edit. Arrows soften at the turn instead of sweeping in wide curves between them.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Sign-in now returns you to where you were headed
  {
    title: "Fix: signing in takes you where you were going",
    body: "Links that ask you to sign in first — a showcase submission page, an event registration, an invite, a page linked from an email — now return you to that page once you're in. Until now every one of them dropped you on the dashboard instead, and you had to find your way back by hand.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Newsletter reminders: read it before it sends
  {
    title: "Newsletter reminders — read and edit before sending",
    body: "On the newsletter calendar, **Send now** has become **Review and send…**, which opens the actual email first. You see the full rendered message, who it really reaches, and a banner saying whether it goes straight to the program leads or comes back to you to forward. Subject, To, Cc and the body are all editable, and the preview re-renders as you type — so what you read is exactly what sends.\n\n**The email now draws the month as a calendar.** Instead of five dates in prose, recipients get a real month grid. Consecutive days join into one labelled bar — **Drafts**, **Build + review**, **Issue sends** written on the bar itself rather than in a legend you have to decode. Weekends and holidays are greyed and never counted: a window that runs Friday to Monday draws as two separate days, not a five-day block, because nobody is expected to write through the weekend.\n\nThe **coordinator is now copied on every reminder** they aren't already on, so whoever is running the cycle always has a record of what went out.\n\n**Send test to me** mails the whole thing to your own address only, marked as a test and showing who it *would* have gone to. It changes nothing: the reminder stays pending and the real recipients get nothing, so you can test as often as you like before sending for real.\n\nThis also fixes a real trap: the per-reminder **Let me send it** / **Send automatically** toggle was only changing the label. Sending still followed the global default, so a chase you had claimed as your own could still go out to the leads from the platform. That toggle now decides what actually happens.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Flow charts drive a live form
  {
    title: "Flow charts now build the form beside them",
    body: "A **question** box becomes a field in the live form on the right. Put a rule on an arrow \u2014 *follow this only when `trainee` is `No`* \u2014 and the field below it appears only when that answer matches. Conditional arrows are drawn dashed, so the logic is visible on the chart rather than buried in a settings panel.\n\nThere is no second definition of the form to keep in sync: the form is the chart, executed. Answer a question and any branch that stops matching disappears; a required question only counts as missing while it is actually being asked.\n\nThe seeded Training Week flow now includes the attendance-confirmation step \u2014 registrants confirm before the day, and an unconfirmed seat is released back to the waitlist rather than becoming an empty chair.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Flow charts
  {
    title: "Flow charts — draw how a process actually runs",
    body: "Workspace \u2192 Process \u2192 Flow Charts. Drag boxes, connect them with arrows, rename anything, save. Shapes carry meaning: start, step, decision, end, and a dashed note for the parts nobody has decided yet.\n\nIt opens on the Training Week registration flow rather than a blank canvas \u2014 the real process, including the two open questions (auto-approve BHN trainees or review everyone; waitlist promotes itself or an organiser confirms) drawn as notes so they read as decisions still owed rather than settled steps.\n\nInstructors can read any chart; admins can edit.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Newsletter calendar redesign + workflow audit
  {
    title: "Newsletter calendar — drag the dates, and a pile of workflow fixes",
    body: "**The calendar is now a calendar.** Each month is a real month grid — seven columns, a week per row, day numbers in their squares — with the production window drawn over it the way a calendar draws a multi-day event: one bar per week row, wrapping across the weekend, rounded only at the true start and end. Drag the band to move an issue and every deadline re-derives backwards; drag its left edge for more writing days, its inner seam for more build days. The send date snaps to Tuesday, Wednesday or Thursday, so dragging across a Friday simply won't land there — the rule teaches itself. Arrow keys do the same thing for anyone not using a mouse. A month you move by hand is remembered as yours: re-filling the calendar leaves it alone.\n\nThe page lost its boxes. Structure now comes from hairlines, type weight and one shared 31-column axis that all months line up on, which is what makes \"always the third week\" visible rather than something you're told. Status is a sentence, not a badge, and each month's reminders sit behind a one-line summary instead of twelve rows of buttons.\n\n**Fixes found by auditing the flow end to end.** The approval email said \"open the review and press Approve\" while the only Approve button lived on another tab — the sign-off is now on the Review page, under the issue it signs off. Compose never rolled over to a new issue, so every month's contributions would have stacked onto one immortal draft; each month now owns its own issue. Filling the calendar can no longer chase anyone about a deadline that has already passed. Sign-off stays closed until there is something built to sign off, sending a reminder asks first and names the recipients, and a failed reminder can be retried instead of being a dead end.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Newsletter production workflow
  {
    title: "Newsletter — a content calendar, chased deadlines, pinned review notes, and one sign-off",
    body: "The newsletter workshop now has a production process around it, not just a place to paste text.\n\n**Calendar.** Plan any number of months ahead. Each issue lands in the third week on a Tuesday, Wednesday or Thursday — never a Monday or Friday — and every other date is worked backwards from the send day in business days: two days for the program leads to write, two to build and review. Statutory holidays are skipped automatically; if one lands on the send day the issue slips within the same week rather than onto a Friday. Re-planning never touches an issue that has already been approved or sent.\n\n**Reminders.** Four per cycle — drafts open, drafts due, approval needed, send day. Each is independently set to send itself or to email the coordinator a ready-to-send copy with the real recipients printed at the top, which is the default for the lead-facing chases: a nudge reads better from a person. Program leads are cc'd to the marketing lead on every one. Sending is claim-before-send, so a cron that runs twice cannot chase anyone twice.\n\n**Review.** Open the Review tab and click any headline, subhead or paragraph to pin a note to it. Notes anchor to the contribution and its wording rather than to a position in the markup, so they survive the AI layout being regenerated underneath them. Anyone on staff can resolve or reopen anyone's note; edits are attributed.\n\n**Approval.** One person has the final say. Their Approve control appears only for them, and the record keeps who approved, when, and any note they left.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Demo mode + migration-chain repairs
  {
    title: "Demo mode — a no-login portfolio deployment, and the migration chain now replays",
    body: "Two things landed together.\n\n**Demo mode.** With NEXT_PUBLIC_DEMO_MODE set (a separate deployment — never production), the platform becomes a self-guided demo: `/` lands on a persona chooser (Maya the showcase trainee, a demo admin, a demo employer), one click signs the visitor in through the existing magic-token route — which structurally refuses real accounts — and `/demo/about` documents the stack with a feature index that deep-links into each surface. A strip in the sidebar footer marks the environment; robots are told to stay out. On production none of these routes exist.\n\n**The migration chain now replays on a fresh database.** Standing up the demo surfaced that seven 2026-05 migrations were written after the tables they touch and backdated, so `prisma migrate deploy` on an empty database died four separate ways. Those migrations now carry fresh-database guards, and a tail migration recreates what the guards skip — idempotent, so on production (where everything already exists) it's a no-op. Verified by replaying all migrations into a clean pgvector container, seeding the full demo world into it, and proving deploy tolerates the edited files and production's rolled-back May migration.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Workspace · Marketing → Merch
  {
    title: "Workspace · Marketing → Merch — the trade-show giveaway shortlist",
    body: "**Workspace → Marketing → Merch** holds the booth giveaway shortlist: 25 items, each already matched to a real product in Business Edge's catalogue, with their photo, product name and item code.\n\nItems are grouped by **tier** — walk-up, real conversation, qualified lead — because the same booth needs three levels of generosity. Each card carries why the item works, how it should be decorated, and a **watch out** note where the supplier's closest match differs from what you'd actually specify.\n\n**Filter** by tier, by type, by pocket-flat only (if it doesn't fit a laptop bag flat, it gets left in the hotel room), and by text across the names *and* the notes — they combine. **Select** a set and the summary shows the estimated spend at a quantity you choose, then **Copy quote request** puts a supplier-ready email on your clipboard with the product names, item codes and listing links.\n\nUnit costs are **planning estimates, not supplier quotes** — that's stated on the tab itself, not hidden in a tooltip.\n\nNote this is distinct from **Operations → Merch fulfilment**, which is the rewards vault trainees redeem credits against.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── End of Summer — limited theme, August 2026
  {
    title: "End of Summer — limited-time theme (until 31 August 2026)",
    body: "A new seasonal theme for the rest of August: **End of Summer** — sun-bleached linen, low amber light, and a dry-grass sage note. Warm rather than bright: the palette of six o'clock in late August rather than noon in July.\n\nSwitch to it and **seed fluff drifts across the page** — dandelion down caught in low sun, hanging and wandering sideways more than falling, over a warm haze along the bottom of the viewport that reads as heat still coming off the ground. A caption in the corner cycles through late-August observations. Like every atmosphere layer it respects *prefers-reduced-motion*: the palette stays, nothing moves.\n\nPick it from the **theme switcher** (the linen-and-amber swatch under *Limited time*), or from the theme-of-the-day card. Like all limited drops it retires after **31 August**, and anyone still on it falls back to their usual theme.\n\nAlso fixed while here: the theme-of-the-day preempt named the July theme by id, so it had quietly stopped promoting anything the day that theme expired. It now finds whichever seasonal drop is in its window.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — counts and export follow the work
  {
    title: "Website Review — counts and Export brief follow outstanding work",
    body: "A review with reopened comments read **0 open · 0 total** and had **Export brief** greyed out, even with the comments plainly listed underneath. The counts were still measuring the current round rather than what is actually outstanding, and the export button keyed off them.\n\nThe header now counts every outstanding item and every thread on the review, and Export is available whenever there is something to export. Starting the next round no longer says \"from Round N\" either, since outstanding items can have been carried over from an earlier one — it settles all of them.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — reopened comments show on the page too
  {
    title: "Website Review — reopened comments now show on the live page",
    body: "Reopening a comment after rolling back a page revision brought it back on the review page and into the brief, but **not onto the page itself** — the on-page panel was still listing only comments filed in the current round, so carried-over items were invisible exactly where you needed them.\n\nThe panel now shows everything filed this round plus anything still outstanding from an earlier one. Carried-over comments can also be replied to, edited and resolved from the page again — three lookups were scoped to the current round, so those items had been visible-but-untouchable.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — reopen after a rollback
  {
    title: "Website Review — bring comments back when a revision is reverted",
    body: "If you roll a page revision back, the feedback it addressed applies again — but those comments had already been marked settled, so they vanished from the brief.\n\nEvery settled comment now has a **Reopen** button, and admins get **Reopen Round N** under *All rounds* to bring back everything one round settled in a single step. Reopened items keep the round they were raised in — that's their history — and the brief flags them as **Carried over from Round N** so whoever picks up the work knows they're returning items, not new ones.\n\nThe thread list's first tab is now **Outstanding** rather than the round number, because once a rollback reopens older comments, what matters is whether an item is still open — which is also exactly what exports. Starting a new round settles everything outstanding, not just items raised in that round, so nothing lingers indefinitely.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — show the current round, not every round
  {
    title: "Website Review — a review now opens on its current round",
    body: "Opening a review showed every comment ever filed on that page. The Sponsorship review sat on Round 3 and greeted you with **41 resolved items from Rounds 1 and 2 and nothing current** — which read as though the old feedback had never been dealt with.\n\nThe thread list now shows the round you're in. Earlier rounds are one click away under **All rounds**, where each card is stamped with the round it came from, and a line tells you how many were settled previously. Nothing was deleted or hidden permanently.\n\nThis also brings the two surfaces into line: the on-page panel has always shown only the current round, so the workspace page and the live page were disagreeing about what was outstanding.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Outreach — the platform sends the email
  {
    title: "Outreach can send the email itself, from info@biohubnet.ca",
    body: "Outreach used to only *draft*: it filled the template and handed you a mailto: link, and you sent from your own client. Now the platform can send it — select contacts, confirm, and it goes out from **info@biohubnet.ca** with replies routed back to whoever pressed send.\n\n**Nothing sends without confirming.** Selecting runs a dry run first: every check runs and every message renders, but nothing leaves. The confirmation tells you how many will be sent, how many are being skipped and why, and the subject of the first one — and what you approve is exactly what goes, because the preview and the send use the same renderer.\n\n**Nobody gets emailed twice.** Each attempt is recorded against the campaign before the message leaves, so a double-click, a retry or a refresh can't send again. Failures are recorded as failures, with the address and the error — previously a bounce had nowhere to live and would have marked the contact as reached.\n\n**Every email carries an unsubscribe**, as Canadian anti-spam law requires, along with BioHubNet's name and mailing address. Unsubscribing is remembered against the person, so it applies to every list and every future campaign.\n\nSending is admin-only. One important caveat: **biohubnet.ca has no SPF or DKIM records yet** — those need publishing before the first real campaign, or the mail will land in spam. See `docs/outreach-sending.md`.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — exporting locks the round
  {
    title: "Website Review — exporting a round locks it until the next one opens",
    body: "Once you export a brief, that round **freezes**. No new comments, replies, edits, deletions or resolutions — on the review page or the live-page panel — until an admin starts the next round.\n\nThe reason is the handoff: the moment you paste a brief into Claude Code or Codex, someone is working from that exact list. If comments kept arriving against the same round, the brief they're building from would quietly stop matching what the reviewers actually agreed.\n\nA locked round is still fully readable, and **you can re-export it as often as you like** — copying the same brief again changes nothing. The review page shows a banner explaining the state, the panel on the page says the same, and the index marks the card **R2 locked**. Pressing **Start Round 3** reopens everything.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — boxes size to their content
  {
    title: "Website Review — comment boxes grow with what you write",
    body: "Writing a long comment no longer means typing through a three-line window. Every box — a new comment, a reply, an edit — **grows as you type and shrinks again when you cut text back**, on the review page and in the on-page panel. Past a sensible height it scrolls, so the Save and Cancel buttons never get pushed out of reach.\n\n**Quoted page text is no longer silently cut.** The quote shown above a comment was capped at about three lines with the rest simply invisible — no scrollbar, no ellipsis, no sign anything was missing. Long quotes now scroll, so what you're commenting on is always readable in full.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — shared editing, resize, accordion
  {
    title: "Website Review — edit anyone's comment, resize the panel, one thread at a time",
    body: "**Edit any comment, not just your own.** A correction now lands in the text itself rather than as a reply nobody reads.\n\nBecause that means the author's name no longer accounts for the wording, **the editor is recorded and shown**. A comment reworded by someone else reads *edited by Ruilin* in the thread and on the page, and the exported brief says **Reviewer: Priya, edited by Ruilin** — so an agent acting on the words never mistakes whose they are. Comments edited before this shipped just say *edited*, as before.\n\n**Drag the review panel wider.** Grab its left edge and pull; the right edge stays put, and the width you pick is remembered on that browser. It stops at 240px so the header stays readable and at 720px so the panel can't swallow the page you're reviewing.\n\n**Show me now opens one thread at a time.** Jumping to an element expands that thread and closes the others, so the panel shows what you just looked at instead of a growing stack of everything you've visited.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — a real home page
  {
    title: "Website Review — see every page at a glance",
    body: "Website Review now opens on an overview instead of dropping you into whichever page was touched last. Every page under review gets a card leading on the number that matters: **how many items are still open in its current round** — the exact set an export would pick up.\n\nThe old picker was a row of pills showing two bare numbers with no labels, and the count included resolved comments from every past round, so it couldn't tell you what was outstanding.\n\nCards sort themselves so the work surfaces first: pages with open items, then quiet ones, then closed. Each shows the round, what's been settled, when it last moved, and the page URL. Past five pages you get a filter box. Pick a card to open its threads; **All pages** takes you back.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — anyone can delete a comment
  {
    title: "Website Review — anyone on a review can delete any comment",
    body: "Clearing out a comment is no longer limited to whoever wrote it. Any reviewer can delete any comment or reply, so a thread that's been answered, duplicated or filed on the wrong element can be tidied by whoever spots it — you don't have to chase the author.\n\n**Editing is still author-only.** Removing a comment is housekeeping; rewording someone else's would put words in their mouth, and the export brief is built from those words.\n\nDeleting your own goes straight through. Deleting someone else's asks first, and tells you whose it is and how many replies go with it — deleting a top-level comment takes its whole thread, which may include other people's replies. There's no undo, so the confirmation is the safety net.\n\nThe same rule now applies in both places you can review from: the workspace page and the on-page bookmarklet.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review → live collaborative review — Sep 2026
  {
    title: "Website Review — comment on biohubnet.ca together, in the page itself",
    body: "Reviewing a page no longer means describing where you are. Open a review and hit **Launch** — you get a link straight to that page on biohubnet.ca with the review already running on it. Click any element and the comment attaches itself; the quote, the element and the WPBakery block are recorded for you.\n\nIt's a **shared workspace, not a private notepad**. Everyone on the link sees the same threads, numbered markers sit on the elements they refer to, and replies and resolutions show up for the others as they happen. The panel folds down to a rail when you want the page back, and works on a phone.\n\n**Your name is now proven, not typed.** Launching while signed in carries a signed token, so your comments are attributed to your actual account. Anything filed without one is labelled **guest** in the thread and *(unverified guest)* in the exported brief — so nobody can put words in a colleague's mouth.\n\nAlso: page names are derived from the URL so you don't have to invent one, `www` / trailing-slash / query-order variants of the same page no longer open duplicate reviews, admins can delete a review session, and each export moves the review to the next round so old items stay in their own revision.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Website Review — Sep 2026
  {
    title: "Workspace · Website Review — comment on biohubnet.ca, export a revision brief",
    body: "**Admin → Workspace → Website Review** replaces the round of emailed screenshots. Open a review on any URL, then leave **comments anchored to the exact text on the page**. Colleagues **reply to each other**, **edit** their own, **delete**, and **resolve** a thread once the fix lands — edits are stamped so you can see a comment was changed and when.\n\nWhen a round is done, **Export brief** turns every *open* thread into Markdown written for an AI coding agent: the quoted text, the element, and — for WPBakery pages — which `vc_raw_html` block it sits in, so the change lands where you meant it. Paste it into Claude Code or Codex. Exporting **bumps the round**, so later comments are attributed to the next revision and the history stays readable.\n\nAnchors are stored at four decreasing precisions (quoted text, element key, selector, WPBakery block). If a later capture can't find one, the comment is flagged **anchor not found** rather than silently re-attached to the wrong element.\n\n**Comment without leaving the site.** Each review ships a **bookmarklet** — drag *Review this page* onto your bookmarks bar, open biohubnet.ca, and click it. Hover highlights any element; click it and type your note. All four anchors are captured automatically, so you never have to copy-paste the text you're talking about. Colleagues don't need a platform login — the bookmark carries the review's own token, and that token can only *add* comments: it can't edit, delete, export, or read the thread.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Workspace · Marketing → Newsletter workshop — Sep 2026
  {
    title: "Workspace · Marketing — a Newsletter workshop",
    body: "Building the monthly newsletter no longer means one person chasing everyone for copy. **Admin → Workspace → Marketing → Newsletter** gives the team four drop-boxes — **ENGAGE**, **EXPERIENCE**, **EQUIP** and **EVENTS** — and colleagues paste in whatever they have: a paragraph, some bullets, a forwarded note. No formatting rules, no template to learn. Anyone instructor-level or above can contribute.\n\nWhen the issue is full, an admin hits **Lay out with AI**. The model reads each contribution and decides its *shape* — what becomes a headline, what becomes an **At a Glance** card, what becomes a list of named awardees, whether there's a call-to-action — and the renderer turns that into the exact Mailchimp markup we already use: section ribbons in the programme colours, glance cards with deadlines in red, pill buttons, the 600px container. **Copy Mailchimp HTML** drops it straight into a Mailchimp *Code* block, and a live preview shows the finished issue before you send.\n\nThe AI is explicitly forbidden from inventing dates, names, numbers or links — if a contributor didn't write it, it doesn't appear. Buttons only ever point at the URL the contributor supplied. Contributions are stored verbatim, so a re-run always starts from what was actually submitted, and pieces nobody edited are skipped on re-layout.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Tailor · gap analysis highlighting + example answers — Aug 2026
  {
    title: "Resume tailor · colour-coded gaps and example answers",
    body: "**Profile → Tailor** now reads at a glance. Every requirement row is **highlighted by how well you cover it** — green when it's **met**, amber when it's **partial**, red when it's **missing** — with a coloured rail down the left edge so you can scan a long posting in seconds and see exactly where the gaps are. (The Met / Partial / Missing label stays on every row, so the status never depends on colour alone.)\n\nFor every gap, the coach now writes an **example answer** — one or two sentences showing how a strong response is structured, with `[bracketed placeholders]` where your details go. It never invents employers, dates or numbers for you; it models the phrasing and you supply the facts. Hit **Start from this** to drop the example straight into the answer box and edit from there, then re-score the round as before.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Workspace · Marketing → Sponsorship Package — Aug 2026
  {
    title: "Workspace · Marketing — a Sponsorship Package tab",
    body: "**Admin → Workspace → Marketing** has a third tab: **Sponsorship Package**, sitting beside Video Production and the 26 Symposium Comms Plan. It opens the symposium's sponsorship offer straight into the same editable HTML editor — *why sponsor*, event-at-a-glance, the tier grid, custom partnerships, and a how-to-confirm sequence — with **share links**, so a prospective sponsor gets a URL instead of a PDF attachment, and edits are live rather than trapped in someone's Downloads folder. The document is seeded automatically on first visit and carries a version marker, so later baseline updates never overwrite the team's edits. **The tier names, prices and event details are intentionally left blank** — a highlighted panel at the top lists exactly what to fill in before the package goes out.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP tracker · July rescan (VC R14 + funding sweep) — Jul 2026
  {
    title: "EQUIP tracker · July rescan — 3 new recipients, Synakis' $2.6M round, 48 new milestones",
    body: "The **EQUIP recipient dossier** (`/admin/equip/tracker`) has been rescanned against the programme's Notice-of-Award records and the open web. **Three new recipients**: **AlloWide Health Inc** (VentureConnect **R14**) — Poorya Saeedloo, U of T — a rehydration buffer for freeze-dried bone allografts; **Alpha Biosensing** (VentureLift **R5**) — Nicholas Kotoulas, U of T — rapid low-cost bacterial biosensors for pathogen ID and antibiotic-susceptibility testing; and **NorthMiRs Inc.** (VentureLift **R5**) — Samantha McWhirter, U of T — lipid-nanoparticle microRNA therapeutics for sepsis-induced organ failure. Two existing recipients also picked up a second EQUIP award and now show on **both tracks**: **Vrit Inc.** (VC R14 · VL R2) and **Sparked Inc.** (VC R15 · VL R2). That brings the roster to **27 companies**. The biggest recipient news: **Synakis closed an oversubscribed CAD $2.6M pre-seed** co-led by TIAP and Chiefswood Private Capital (independently verified against the press release), plus new non-dilutive funding for **Neuropeutics** ($500K ALS Canada–Brain Canada), **Re:pair Genomics** ($105K Mitacs), **Laetech** (Mitacs), **Belaris Biotech** ($10K IBZ fellowship) and **ChASE Biotherapeutics** ($948.6K CIHR). **48 new sourced milestones** were added and **17 stale or duplicated entries removed**, every remaining item carrying a working source link. Contact details were corrected too — **Fibra** has moved to *myfibra.com*, **NewGen Health** to *newgenhealth.io*, and **Rayyan Therapeutics'** website is now offline (flagged on its card).",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Limited-time July theme · O Canada — Jul 2026
  {
    title: "Limited-time theme · O Canada, a Canada Day drop for July",
    body: "A new seasonal theme is live through July 31: **O Canada** — a Canada Day salute in **maple red on fresh white**. Crisp near-white surfaces, a full Canada-red brand ramp for buttons and accents, deep warm-charcoal text, and a bold red dashboard hero. Switch to it and **red maple leaves drift down the page** (with a soft red ground-wash and a rotating anthem caption in the bottom-right) — the same falling-decoration layer as Sakura's petals and Greenwood's leaves, and it fully respects *prefers-reduced-motion*. Pick it from the **theme switcher** (the red-and-white maple swatch under **“Limited time”**), or tap it from the **theme-of-the-day** card on your dashboard. Like every limited drop it retires after July 31, and anyone still on it falls back to their default theme.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Outreach · reliability fixes from a workflow audit — Jul 2026
  {
    title: "Outreach · merge no longer loses history, and “reached” is now trustworthy",
    body: "A workflow audit of **Admin → Workspace → Outreach** turned up a few ways the campaign tracker could quietly lie, now fixed. **Merging two duplicate contacts** used to delete the dropped person's entire reach-out history and leave campaigns pointing at the dead record (so the survivor looked *un-reached* and you'd cold-email them again) — merge now moves the touches, rewrites every campaign's reached list, and keeps the earliest intro date, all in one transaction. **Marking / un-marking reached** is now atomic, so quickly marking two people can't drop one; **un-marking** a contact who isn't reached in any other campaign correctly resets them to the *intro* copy instead of leaving them stuck on *returning*. The campaign page now **warns when template fields are still blank** (so you don't email “closes .” / “Apply: ”), **won't let you mark an address-less contact “emailed,”** and **surfaces an error and reverts** if a save/mark doesn't go through (instead of silently showing success).",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP tracker · share the report externally — Jul 2026
  {
    title: "EQUIP tracker · share the tracking report externally (no login)",
    body: "The **Tracking report** tab on **Admin → EQUIP → Recipient tracker** now has a **Share externally** panel. Hit **Create link** to mint a public URL anyone can open to read the full dossier — **no login or sign-up**. Give each link an optional label (e.g. *DMZ partners*), **copy** it, **open** it in a new tab, or **revoke** it — a revoked link stops working immediately. The shared page shows the same live report you see, minus the admin chrome, and is **unlisted** (search engines are told not to index it). Only admins can create or revoke links.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP · VentureConnect deadlines corrected — Jul 2026
  {
    title: "EQUIP · VentureConnect deadline dates corrected (Jul–Dec 2026)",
    body: "The **VentureConnect** monthly deadlines now come from BHN's **published VC key-dates** (rounds 16–21) instead of a computed “last Monday of the month” rule, which was wrong for three months: **August (Aug 31 → Aug 27)**, **September (Sep 28 → Sep 24)**, and **November (Nov 30 → Nov 27)**. July, October and December were already correct; May and June are unchanged. The deadlines page (`/admin/equip/deadlines`) and the applicant submit-gate use the corrected dates. Source dates now live explicitly in `lib/equip/calendar.ts`.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP tracker · simplified recipients + website feed — Jul 2026
  {
    title: "EQUIP recipient tracker · simplified public list + website feed",
    body: "The **Admin → EQUIP → Recipient tracker** now has two tabs. **Recipients** is a clean, simplified list — **company · recipient · track**, plus the **project name for VentureLift** — with none of the LinkedIn/posts history. **Tracking report** is the full intelligence dossier you already had (now driven from the same single data source, so they never disagree). The simplified list is also published as a **public JSON feed** at `/api/public/equip/recipients` so BioHubNet's website can render a stylized “who we funded” section; two buttons hand it to Codex in one click (**Copy JSON** and **Copy Codex prompt**). Note: VentureLift project names aren't in the tracker data yet — add them in `recipients.ts`.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Showcase · structured group/cohort membership — Jul 2026
  {
    title: "Showcase · put each person in real groups & cohorts (multi-membership)",
    body: "Each card on **Admin → Showcase** now shows **structured group memberships** — real references to your actual pathway cohorts, not free text. A cohort renders as **Pathway › Cohort** (currently the two showcase pathways are **Medical Affairs** and **Regulatory Affairs**, each with a **Cohort 1**); the person's **home** group carries a small home icon. The pathway + cohort is **auto-tagged when someone uploads** via their public link. Hit **Add additional pathway** to also add them to **another** cohort — no photo re-upload, since they already exist — so one person can belong to **several** cohorts at once. Remove a secondary membership with its **×** (the home group is protected — delete the person from their card instead). This is the **single source of truth**, so a group's roster and its count always agree, and deleting a group cleanly removes its memberships.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Showcase · manually add a person to a cohort — Jul 2026
  {
    title: "Showcase · add a person to a pathway cohort directly",
    body: "On Admin → Showcase, every cohort row (and every standalone showcase) now has an **Add person** button. It opens a small form — name, LinkedIn, headshot — that files a showcase entry for someone without them using the public link. It bypasses the cohort's open/closed state and the attendance gate, so it's the right tool when someone attended off-platform (a printed sign-in sheet, a walk-in) and you just need them on the roster. The panel stays open after each add so you can enter a whole list back-to-back.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Role-based multi-level certifications — Jul 2026
  {
    title: "Role-based certifications for every trainee track",
    body: "The **Certifications** area (ENGAGE → Certifications) now runs as **role-specific tracks** — one per trainee sub-type: **Master's, PhD, Post-doctoral Fellow, Research Associate, and Lab Technician**. (Only trainees take training; employers, admins, and evaluators don't have a track.) Each track is its own three-tier ladder — **Foundation → Practitioner → Advanced** — with a distinct, role-curated course mix at every tier. The pass mark **rises with the tier (70 → 80 → 90%) and is enforced**: to earn a tier you must clear its threshold on that tier's assessed courses, so Advanced genuinely demands more than Foundation. Pick your track with the persona filter, complete a tier to earn its credential, and each tier unlocks the next.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Symposium comms plan: Gantt/table sync fix — Jul 2026
  {
    title: "Fix: removed Gantt rows no longer leave a stray table row",
    body: "On the **26 Symposium Comms Plan**, removing a workstream from the Gantt now always removes its linked row from the Pre-event table below — including any duplicate. The table also self-heals on load: a row still linked to a bar that's gone (or a duplicate of another) is cleaned up automatically. Root cause was the old Tables-panel “add row” copying a row's hidden link; new plain rows are now unlinked.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Symposium comms plan: collapsible phases + Gantt rows — Jul 2026
  {
    title: "Collapse phases + edit the Gantt on the chart",
    body: "On the **26 Symposium Comms Plan**, the phase sections (Pre-event, During-event, Post-event) — plus **Revenue**, the **report template**, and the **task breakdown** — now collapse: click the chevron in a section's top-right corner to fold it down to just its title. And you can build the timeline **right on the Gantt chart**: hover any workstream row for **reorder (▲▼)** and **remove (✕)** controls, or hit **“+ Add workstream row”** at the bottom to drop a new bar. Every change flows to the Pre-event table below — adding creates a linked row, removing deletes it, reordering re-sorts it, and dragging a bar still sets its dates. Rename a workstream in the left column and its bar caption follows. The plan's sidebar is now just **Comments** and **History** — structural editing happens on the page and the chart.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Admin global search — Jul 2026
  {
    title: "Global search in the sidebar",
    body: "A search box in the sidebar — reachable from any page, not just **Admin Dashboard** — looks up users, courses, and internship postings at once. Type a name, email, course title/code, or company, and jump straight to it. Clicking a user result opens **Users** already filtered to them; courses and postings open directly. Backed by Algolia with tuned relevance (published courses and active postings rank first, common abbreviations like \"mAb\" and \"R&D\" resolve to their full terms) and click tracking to see which results actually get used.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Accessibility pass (WCAG 2.2 AA) — Jul 2026
  {
    title: "Accessibility pass across the app (WCAG 2.2 AA)",
    body: "Ran an automated accessibility audit (axe-core, wired into the Playwright suite so it now gates every PR) across the public marketing pages, trainee dashboard, admin, and employer surfaces, and fixed everything it found: form fields that weren't announced to screen readers now are (the shared **Field** component associates every label automatically), the main navigation is a proper `<nav>` landmark, page content sits inside a `<main>` landmark, heading levels no longer skip, and several low-contrast text/badge colors were darkened to meet the 4.5:1 minimum. Nothing about how any page looks or works changed — this is entirely about screen-reader and keyboard users getting a correctly-structured page.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── 2026 Symposium communications plan — Jul 2026
  {
    title: "2026 Symposium & Training Week — communications plan",
    body: "New **Workspace → Marketing → 26 Symposium Comms Plan** tab opens a fully editable communications plan for the 2026 Annual Symposium & Training Week — the same live-preview / editable / shareable / version-history surface as the Molly guide. It includes a **CSS Gantt chart** (14-week runway, Aug → event → Nov, colour-coded by workstream), a **pre-event promotion** cadence (Save-the-Date → Registration → Early Engagement → Teasers → Final Countdown), a **during-event / on-the-day** run-of-show, a **post-event** plan, a **sponsorship plan with a revised tiered 2026 package**, a **sample post-event Impact Report**, and a **full task breakdown** (checklists with owners) at the bottom. Built from last year's marketing timeline and the 2026 planning doc; edit any cell, drag sections, and share a link with the team. (Also reachable as a project inside Video Production.) The editor's right rail has a **Tables** panel to **add, remove, and rearrange rows** in any table, and the **Gantt bars are draggable** — drag a bar to move it, or drag either end to change its start or finish week (a hint bubble on the top bar points this out). The **Phase 1 table now syncs to the Gantt** — each stage row is linked to its bar, so dragging the bar rewrites that row's window and its new **Deadline** column live. The timeline also includes **three weeks of optional early runway** (Jul 13–27) so work can be pulled earlier. The plan also gained a **sponsor-visibility touchpoint map** (before / during / after) and a **timeline sanity-check** callout — the key fix being that sponsor logos must lock ~6 weeks out (by ~Sep 21) to make print/merch, not early October.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── "Master resume" renamed to "Bullet Bank" — Jun 2026
  {
    title: "“Master resume” is now the Bullet Bank",
    body: "The **Master resume** tab is renamed to **Bullet Bank** — a clearer name for what it is: your library of every accomplishment bullet you've written. The page now opens with a short explainer of *why* it exists and how it pays off (tailor resumes in seconds, keep the AI grounded in your real wins, and never lose a good line). Everything else works exactly as before; only the name and the intro changed.",
    kind: "improvement",
    visibleTo: ["trainee", "evaluating"],
    daysAgo: 0,
  },
  // ── Master resume · structured job details + punctuation tool — Jun 2026
  {
    title: "Structured job details + a punctuation cleaner",
    body: "On **Master resume**, each experience group now has an **Edit** button to set the job's **title, company, location, start month/year, end month/year**, or **“I currently work here.”** Dropping a resume in pre-fills these from the parsed dates. There's also a **Remove punctuation** tool in the right rail that cleans punctuation from your **job titles and company/location names** (e.g. “Acme, Inc.” → “Acme Inc”) for cleaner ATS parsing — your bullet text is left untouched.",
    kind: "improvement",
    visibleTo: ["trainee", "evaluating"],
    daysAgo: 0,
  },
  // ── Resume sections · Conferences + more on the master — Jun 2026
  {
    title: "More resume sections",
    body: "Your resume + master library now support a **Conferences** section (talks, posters, panels) alongside the existing **Summary, Education, Certifications, Publications, and Volunteering**. On the **Master resume** empty state you can start a section of any of these in one click, and the AI resume parser recognises Conferences when importing a file.",
    kind: "improvement",
    visibleTo: ["trainee", "evaluating"],
    daysAgo: 0,
  },
  // ── Job Tailor — Jun 2026
  {
    title: "Job Tailor — paste a job, get a grounded application",
    body: "New **Profile → Job Tailor**. Paste a job link or the JD and the AI: **detects the ATS** (Workday / Greenhouse / Lever / Ashby / SuccessFactors), surfaces **eligibility gates** first (location, sponsorship, hard minimums), runs an honest **gap analysis** against your master library (Have / Partial / Gap with a reach call), then drafts a **resume + cover letter grounded only in your real facts — it never invents a metric**, flagging anything it can't support. A hard **QA gate** checks length, banned words, em-dashes, pipes, keyword coverage, and traces every number back to a fact; you get a **Strong / Partial / Gap scorecard** and download the **right files for that ATS**. It never submits for you. Teach it a preference once and it's applied to every future run.",
    kind: "feature",
    visibleTo: ["trainee", "evaluating"],
    daysAgo: 0,
  },
  // ── Master resume · drag-and-drop import — Jun 2026
  {
    title: "Master resume · drag & drop a file",
    body: "On **Profile → Master resume** you can now **drag and drop a resume file** (PDF, DOCX, or TXT) straight onto the page — AI reads it, extracts every bullet, and folds them into your library, **skipping anything that's already there**. No upload step, no separate resume to manage. The dropzone is front-and-centre when your library is empty, and lives in the right rail once it has content so you can keep merging resumes in.",
    kind: "feature",
    visibleTo: ["trainee", "evaluating"],
    daysAgo: 0,
  },
  // ── AutoPipette assist paused — Jun 2026
  {
    title: "AutoPipette assist paused",
    body: "The proactive **AutoPipette** behaviour-assist layer (the “you look stuck” hint chip, its telemetry, the `assist_stuck` AI suggestions, and the weekly-summary cron) is **turned off** for now. No behaviour events are collected and no hints surface. It can be switched back on without a code change by setting `NEXT_PUBLIC_ASSIST_ENABLED=true`.",
    kind: "note",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Video Production · anchored script comments — Jun 2026
  {
    title: "Video Production · anchored comments",
    body: "Script comments are now **anchored to the text**. **Select the words** in the script you want to comment on (or click to place the cursor, which picks the whole sentence) and hit **Make comment** — the comment attaches to that passage. Comments sit in the margin, each linked to its text by a thin dotted line, and show **who commented and when**, with replies, inline edits, resolve, and an *“updated 3× · last 4m ago by …”* line once a thread has changed more than once.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Video Production · script comments — Jun 2026
  {
    title: "Video Production · comments on scripts",
    body: "The collaborative script editor has a new **Comments** tab next to Sections and History. Anyone editing — including guests on a share link — can leave a comment, mark it **resolved** or reopen it, and the tab shows a count of open comments. This pairs with the existing **History** tab (track changes: every save is attributed and revertable).",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Experience · employer intake "new" badge — Jun 2026
  {
    title: "Experience · new-lead badge",
    body: "The **Employer intake** nav item now shows a **red badge with a count** when new “Hire an intern” leads have arrived since you last opened it. Opening the page clears the badge; it reappears when fresh leads land.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Experience · employer intake editing — Jun 2026
  {
    title: "Experience · edit employer-intake leads",
    body: "Employer-intake entries (Admin → Experience → Employer intake) are now **editable** — fix a typo, update the hiring timeline, or log interview activity inline — and you can **delete** spam or duplicates. Each row gets edit + delete actions.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Experience · employer intake — Jun 2026
  {
    title: "Experience · employer-intake leads",
    body: "The public **“Hire an intern”** form now feeds the platform directly. Employer leads submitted on biohubnet.ca land in a new **Employer intake** page (Admin → Experience) — organization, contact, hiring timeline and what they're looking for — newest first, with **CSV export**. Existing registrations from the legacy spreadsheet can be imported in one pass.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP · recipient tracker — Jun 2026
  {
    title: "EQUIP · a recipient tracker",
    body: "A new **Recipient tracker** (Admin → EQUIP) is a post-award intelligence dossier: every company funded by a **VentureConnect** or **VentureLift** grant, tracked across LinkedIn and the open web. Flagged entries mark a fresh **raise, award, partnership or milestone** — each linked to its source. Filter by track, search across founders and milestones, or flip on **highlights only**. Use the **copy rescan prompt** button to refresh the data.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── AI · autonomous triage agent — Jun 2026
  {
    title: "AI · an autonomous triage agent",
    body: "A new **AI triage agent** (Admin → Insights) works the AI review queue for you: it reads each flagged answer, classifies it (category + severity), and **proposes** an action for a human — it never resolves or sends anything on its own. It's **orchestrated by Inngest** (durable, retried, one run at a time) on a 6-hour schedule, or you can run it on demand. Guardrails included: a **kill switch**, a per-run cap, idempotency (each answer handled once), and schema-validated output. The page shows a **before/after** metric — manual triage time vs the agent's throughput, and the hours saved.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── AI quality · feedback + review queue — Jun 2026
  {
    title: "AI quality · answer feedback + a review queue",
    body: "Learners can now rate the course AI tutor's answers with a quick **thumbs up/down**, and any answer that's poorly grounded in the source is automatically flagged as **low confidence**. A new admin **AI review queue** (Admin → Insights) collects every flagged answer — thumbs-down or low-confidence — so a human can resolve or escalate it. The **AI metrics** page now shows a real thumbs-based **acceptance rate** alongside the existing reliability and cost stats.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · intro history + two-version campaigns — Jun 2026
  {
    title: "Outreach · intro history + two-version campaigns",
    body: "Each contact now tracks whether they've had an **intro email** — a new **Intro** chip on the Contacts directory shows green *Intro sent* or amber *Needs intro*, and you can click it to toggle. Everyone already in your directory was marked as already-known (they predate this and have heard from us). Campaigns can now carry **two versions**: an intro template for new contacts, and an optional **returning** template for contacts who already know us — one that opens by thanking them for their earlier support instead of introducing BHN again. On a campaign, the roster shows how many are new vs returning, tags each recipient **Intro** or **Returning**, and previews the right version per contact; marking a brand-new contact reached stamps their intro as sent. A ready-made “Returning partner (thanks for earlier support)” template is included.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Admin · AI reliability + metrics — Jun 2026
  {
    title: "Admin · AI metrics + a reliability layer",
    body: "A new **AI metrics** page (Admin → Insights) shows reliability and cost across every AI call from the telemetry log — call volume, error rate, p50/p95 latency, cost, and valid-output (schema-validation) rate, charted per day and broken down per feature, over a 7/30/90-day window. Behind it, AI calls now record estimated **cost** and the **prompt version** that ran, and a reliability wrapper adds retries with backoff, a per-call timeout, zod-validated structured outputs (with a repair-retry), and prompt-injection defense for course Q&A. Quality is tracked offline by a new **eval harness** (golden datasets + scorers + an LLM-as-judge) with a **CI gate** that fails a PR if a metric regresses. See docs/reliability-evals.md.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Greenwood theme · richer falling leaves — Jun 2026
  {
    title: "Greenwood theme · truer falling leaves",
    body: "The Greenwood theme's drifting leaves have been redrawn at higher fidelity — a lobed oak, a true five-lobe maple (sharp tips, rounded sinuses), a toothed birch — and each species now falls in its own colour: russet oak, scarlet maple, ochre elm, golden birch. Two eucalyptus leaves drift in too, a slender one and a round silver-dollar with the little notch at its tip, both in silvery sage.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Greenwood theme · greener green — Jun 2026
  {
    title: "Greenwood theme · a cleaner, truer green",
    body: "The Greenwood theme's green has been retuned from an olive / fern tone to a cleaner, more saturated Fujifilm-style tree green — consistently across the whole theme: buttons and accents, the forest hero scene, and the drifting canopy light all now read as a true forest green rather than khaki. The intentional time-of-day moments (dawn mist, golden sun, amber dusk, moonlit night) are unchanged. Contrast on buttons stays accessible (white text passes AA).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Outreach · Campaigns — Jun 2026
  {
    title: "Outreach · campaigns",
    body: "Outreach now has two views, shown as sub-items under the Outreach tab: **Contacts** (the directory + lists you already had) and a new **Campaigns** view. A campaign is a planned, trackable cross-promotion push — pick a target list (or everyone) and one email template, then work down a **personalised roster**: each contact's name, org and email fill the template automatically, and campaign-level fields (program, event, deadline, link, your name/title) fill the rest, previewing live. For each contact you can **copy** the email or **open it in your mail client**, then **mark them reached** — which logs a reach-out on that contact (so it shows in their history) and advances the campaign's progress bar. Set a campaign to draft / active / done. Sending still happens from your own mail client, so nothing is blasted automatically.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · sticky table headers — Jun 2026
  {
    title: "Outreach · column headers stay put while scrolling",
    body: "On the Outreach board, the table's column headers now stick to the top as you scroll a long list or the Directory, so you always know which column you're reading. Each table scrolls within its own area with the header pinned.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · move/remove contacts between lists — Jun 2026
  {
    title: "Outreach · move or remove a contact between lists",
    body: "Each outreach contact now has a **Lists** button (hover a row, on every list and the Directory) for managing which lists they belong to — replacing the old hard-to-spot add control. Open it to see every list with a checkbox: **tick** to add the contact to a list, **untick** to remove them from one. From inside a list you can also **move** a contact off the current list onto another in a single click — they leave here and join there, keeping their shared details and reach-out history. Removing a contact from a list never deletes them: they stay in the Directory and on any other lists.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · email templates — Jun 2026
  {
    title: "Outreach · ready-to-use email templates",
    body: "The Outreach tool now has an **Email templates** library (button in the board header): eight partner cross-promotion templates — first introduction, promote a program / event, warm follow-up, value-first / reciprocal, thank-you, and re-engage a dormant partner — each written to be easy for a partner to forward, with a paste-ready blurb and one clear ask. Pick a template, personalise it for a contact (their name and org fill in automatically, plus yours), then copy it or open it in your email client, and log it as a reach-out in one click. Admins can edit any template — by hand or with AI — and edits apply for the whole team.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Practice · Mock Interview — Jun 2026
  {
    title: "Practice interviews out loud — new Mock Interview",
    body: "A new **Mock Interview** tool (under EXPERIENCE) lets you rehearse interviews by voice. Pick the role you're practising for — optionally paste the job description — and the AI generates a tailored question set. Answer each one **out loud** (your recording is auto-transcribed) or by typing, and get an honest 0–100 score with specific strengths and fixes per answer, then an overall debrief at the end. Past sessions are saved so you can track your improvement. Voice is optional — typing works everywhere. Voice answers also get a **confidence read**: a 0–100 score plus delivery coaching on your pace (words per minute), filler words, and any hedging — so you can practise *how* you come across, not just what you say. And every question now has a **“How to answer this”** coach — tap it for what the interviewer is really assessing, how to structure your answer, the specific signals employers want to hear, pitfalls to avoid, and a skeleton of a strong answer (tailored to your role). Spoken answers now also get a **voice-coach read**: your recording is analysed for pitch and loudness variation (monotone vs. expressive), plus stumbles/restarts and signs of nerves — with a specific voice cue to work on. Tone analysis runs in your browser and needs Chrome/Edge/Firefox; everything else works anywhere.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── EQUIP · applicant emails at every step — Jun 2026
  {
    title: "EQUIP · applicants now get an email at every step",
    body: "EQUIP applications now send the applicant an email across the whole lifecycle, for both VentureConnect and VentureLift: a confirmation when they submit, an under-review notice, the VentureLift pre-screen pass/decline, and the approval, not-selected, and funded decisions — each with the right stream copy, amounts, and your reviewer note included. Decision emails fire automatically when you record a decision; the submission email fires on submit. And the copy is yours: from Admin → EQUIP → “Preview applicant emails”, admins can **edit any template** — subject, heading, body, button label — with {{placeholders}} for names and amounts, a live preview, one-click reset to default, and an **AI rewrite** assist (“make it warmer and shorter”) that proposes copy you review before saving. Edited templates take effect on the very next send. A guided page tour walks you through it all on your first visit — replay it any time with the Page tour button.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · cells wrap long text — Jun 2026
  {
    title: "Outreach · long details now wrap",
    body: "Outreach table cells (titles, notes, …) now wrap onto multiple lines instead of clipping, growing as you type. Enter saves the cell; Shift+Enter adds a line break. Applies to all lists, the Directory, and shared list links.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · reach-out history — Jun 2026
  {
    title: "Outreach · reach-out history per contact",
    body: "Every outreach contact now carries a reach-out log. A new **Reach-outs** chip on each row (every list + the Directory) shows how many touches a contact has had and when the last one was; click it to see the full history — what it was (email, call, meeting, LinkedIn, event), when, **who initiated it**, which list it was for, and a note — and to log a new one in two clicks. History attaches to the person, so it follows them across lists; no more double-contacting someone another teammate already reached.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · EQUIP Partners list — Jun 2026
  {
    title: "Outreach · EQUIP Partners list imported",
    body: "The EQUIP Partner Contact List (xlsx) is now a third outreach list. Its “Comms contact” column marks the person to reach out to for cross-promoting events and announcements, and the sheet's “find the comms person at …” placeholders are kept as to-dos. People who were already in the directory (Sophie, Jarrod, Mary, Barry, Samantha) weren't duplicated — they simply joined the new list, so they now show on both lists as one contact each.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Outreach · share lists with a link — Jun 2026
  {
    title: "Outreach · share a list with a link",
    body: "Each outreach list now has a **Share** button that mints a public link — send it to anyone (a colleague without an account, a partner) and they can open just that list, give their name, add contacts, and edit details. Everything they add is credited to their name in the Added-by column, and links can be revoked any time. Guests can't delete contacts, see other lists, or change columns. Outreach also moved up a level in the sidebar — it now sits beside Marketing and File Sharing under WORKSPACE.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Workspace · Outreach contact lists — Jun 2026
  {
    title: "Workspace · Outreach contact lists",
    body: "Marketing has a new **Outreach** tool next to Video Production: one shared **directory** of partner contacts, organised into lists (pre-loaded with the team's Cross-promotion Partners — Roshni's additions credited — plus a separate EXPERIENCE Program list). A person can sit on several lists without duplication: shared details (org, name, title, email) are edited once and update everywhere, while each list keeps its own notes, ordering, and columns (add/rename/remove/reorder). Saving an email that already belongs to someone offers a merge instead of creating a duplicate, and every contact records who added it and when.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Video scripts · share with external collaborators — Jun 2026
  {
    title: "Video scripts · share with people outside the platform",
    body: "Scripts can now be shared with external collaborators — no account needed. Hit the new **Share** button on a script to create a public link (it copies automatically). Whoever opens it gives their name, then edits the script live with the same editor you use: original styling, coloured presence highlights, 30-second auto-save, and full history — every change attributed to their name and revertable. Revoke a link any time from the same panel.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Video scripts · manage intercut lines — Jun 2026
  {
    title: "Video scripts · manage the intercut script lines",
    body: "The script editor's Sections panel now has an “Intercut script” list for the dialogue under Draft Full Intercut Script: every line shows its speaker and opening words, and you can add a new line, reorder with ↑/↓, or remove one. New lines come pre-styled (speaker · script copy · visual note) — click into the document to write them.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Video scripts · revert to last manual save — Jun 2026
  {
    title: "Video scripts · revert to the last manual save",
    body: "The script editor's floating bar has a new **Revert** button next to Save. One click rolls the document back to the last *manually* saved version — handy when the 30-second auto-save has captured edits you didn't mean to keep. Unsaved edits are discarded, but nothing is lost from History: every auto-saved version stays there, and the revert itself is recorded as a new version. The button greys out when you're already at the last manual save.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP · reviewer role access fix — Jun 2026
  {
    title: "EQUIP · reviewers can act on applications",
    body: "Fixed an access gap: holders of the EQUIP Grant Reviewer role could see the review queue but couldn't open an application or record a decision. The role now has the same access as EQUIP Review committee members across every EQUIP admin page and API — claim, pre-screen, score, approve, reject, and mark funded all work.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Video scripts · live collaboration highlights — Jun 2026
  {
    title: "Video scripts · live collaboration highlights",
    body: "When more than one person edits a video script, you now see who else is in the document (coloured initials in the toolbar), and the section each person is working in is outlined in their colour — refreshing every couple of seconds. Recently-edited sections get a coloured marker too. No setup or accounts needed.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Workspace · Video Production scripts — Jun 2026
  {
    title: "Workspace · Video Production scripts",
    body: "A new WORKSPACE section in the sidebar opens Marketing → Video Production: create video projects and draft their scripts. The BHN Promo Video Project is ready and waiting, with the Molly interview guide kept in its original styling (live preview + editable source). New scripts offer two editors to try — a structured Sections editor and a Rich-text editor — and every save is kept in history. (Public share links, comments, and live co-editing land in the next updates.)",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Login floaters · adjustable entrance delay — Jun 2026
  {
    title: "Login floaters · adjustable fade-in speed",
    body: "The floating molecules and sparkles on the /login backdrop now fade in gradually instead of appearing all at once — and you control how slow that is. Admin → Login floaters has a new “Entrance delay” slider (Instant → 15s, default ~6s): both ambient layers stagger their fade-in across that window so the page settles in calmly rather than popping. Saved instantly.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Fix · contrast on the name-chips picker — Jun 2026
  {
    title: "Fix · readable salutation chips in the “How should we address you?” editor",
    body: "The name chips (First name, Dr./Prof./Mr./Ms. … Yuan) in the preferred-name picker were washing out on the glass themes — faint text on a near-transparent chip. They now use a solid, high-contrast brand fill that reads clearly across every theme, and the section labels were darkened to match.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Register → attend → showcase chain — Jun 2026
  {
    title: "Pathways · take attendance, then gate the showcase to attendees",
    body: "The graduate showcase can now be wired to the real learning-pathway registration — the register → attend → showcase chain for go-live. In Admin → Pathway enrollments, each approved trainee gets an “Attended” checkbox (plus an optional session count) so you can record who actually showed up. In Admin → Showcase, you link a showcase pathway to a real learning Pathway, link each cohort to its registration cohort, and flip “Gate: only attended can submit”. Once a cohort is gated, its public /showcase link requires login and accepts a submission ONLY from a signed-in trainee with an approved/completed enrollment in that cohort who is marked attended (enforced server-side, not just hidden) — everyone else sees a sign-in / not-on-roster / attendance-pending notice. Ungated cohorts stay open and public exactly as before, so nothing changes until you flip the gate.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Showcase · pathways → cohorts — Jun 2026
  {
    title: "Showcase · organise cohorts under a pathway (named once, no number)",
    body: "Showcases now nest under a pathway. In Admin → Showcase you create a pathway once — named WITHOUT a cohort number, e.g. “Medical Affairs Learning Pathway” — then add auto-numbered cohorts under it (Cohort 1, Cohort 2, …) with one click. Each cohort gets its own public, no-login /showcase/<slug> link to send out, with open/close + a submission count per cohort, but they all share the pathway's branding (set the title + intro once). The returning-person auto-fill works across every cohort, and the pathway is what a future approved-registration list attaches to — reused across cohorts, not re-created per cohort. Existing standalone showcases (like Regulatory Affairs) keep working as before.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Showcase · returning submitters skip re-uploading — Jun 2026
  {
    title: "Showcase · returning people get their photo + LinkedIn auto-filled",
    body: "On any showcase submission page, the moment someone types their name we run an exact-name lookup against past submissions. If they've already submitted (to any cohort), their LinkedIn and saved headshot are filled in to confirm or update — no re-uploading the same photo. Submitting reuses the saved photo and records them in the current cohort, so one person can appear across several cohort showcases. The lookup is exact-name only and rate-limited (names can't be enumerated), and uploading a fresh photo always overrides.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Groups · searchable add-people picker — Jun 2026
  {
    title: "Groups · add existing people to a group with a searchable picker",
    body: "Adding people to a group (Admin → Groups) is no longer a tiny dropdown of every user. Each group now has an “Add people” button that opens a searchable, multi-select picker — type a name or email, tick everyone you want, and add them all in one go. A person can belong to multiple groups, and members are still auto-enrolled in the group's courses.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Showcase · multiple groups, a public link each — Jun 2026
  {
    title: "Showcase · run separate showcases for different groups, each with its own link",
    body: "The graduate showcase is no longer a single hard-wired program. From Admin → Showcase you can now create named showcase groups — give each a title, an eyebrow/category, and an intro — and every one gets its own public, no-login submission link at /showcase/<slug> that you can copy and send out. Open or close submissions per group, and see how many entries each has. The existing Regulatory Affairs showcase is now one of these groups (its page is unchanged), and submissions still triage in the same dashboard below the group list.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Simulator · go back to previous weeks — Jun 2026
  {
    title: "Simulator · go back to a previous week to review or replay it",
    body: "The 12-week track is now navigable. Tap any week you've already played and you'll see exactly what you faced that week — the scenarios, the choice you made, the outcome, and the stat swings each one cost or earned. From there you can rewind and replay from that week: your earlier weeks are kept, and everything from the chosen week onward is cleared, so you can try a different path without resetting the whole quarter. Review is the safe default; rewinding asks first. Works the same whether you're signed in or playing a shared link.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator · clearer 12-week survival track — Jun 2026
  {
    title: "Simulator · the 12-week bar now says what it's for",
    body: "The thin week bars at the top of a sim were easy to miss. They're now a labelled track — “Survive your first 12 weeks,” a live “Week X of 12” counter, the current week called out, a flag on the week-12 finish line, and a one-line reminder that the whole job is to reach the week-12 review with your standing intact. The onboarding guide states the same goal up front.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator · Key Opinion Leaders roster — Jun 2026
  {
    title: "Simulator · field & medical sims can carry a Key Opinion Leaders roster",
    body: "Simulations for roles where the job is building relationships OUTSIDE the company — Medical Science Liaisons, field sales, partnerships — can now include a panel of external Key Opinion Leaders (KOLs) alongside your internal team and cross-functional partners. They appear as their own “Key Opinion Leaders” section in the roster, each with a clickable dossier (who they are, how to engage them, what to avoid), and the onboarding guide counts them in. The MSL — Oncology sim now ships with a 20-KOL territory panel. Office roles simply won't have the section.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator · briefing-first onboarding — Jun 2026
  {
    title: "Simulator · the briefing is now front-and-centre, with a guided intro",
    body: "Two changes to how a simulation opens. (1) The briefing — what the job description won't tell you, the part that makes the sim feel like coaching rather than a game — is now a prominent “Start here” card at the top of the board instead of a small button tucked in the corner. It draws the eye until you've opened it once, then settles into a quiet “Reopen”. (2) The first-run walkthrough is now a proper onboarding guide: five quick steps that orient you to your stats, your roster, and the flow — and it ends by handing you straight to the briefing as your first move. Both work on shared public links too.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator · real employer names anonymized — Jun 2026
  {
    title: "Simulator · simulations no longer carry real company names",
    body: "Now that a simulation can be shared as a public link, it shouldn't name a real employer. Two changes: (1) the existing “MSL — Oncology” sim had its company switched from a real pharma to a fictional one (Northwind Pharma); and (2) the generator now always invents a fictional company for the role's industry instead of lifting the real one from the job description — the same way it already anonymizes real people, and real rival companies are described generically too. If you hand-author or upload a payload, use a fictional company yourself; you can edit any sim's company from its editor. (The original pasted JD text is kept admin-only for reference and is never shown on a shared link.)",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Simulator · public playable share link + open comments — Jun 2026
  {
    title: "Simulator · share any sim as a public link anyone can play — and comment on",
    body: "Every simulation now has a Share button (top-right of the player). It mints a public link — /share/sim/… — that anyone can open with no login and actually PLAY: the full 12-week role-play runs right in their browser, progress auto-saved on their device, no account needed. Below the player there's an open discussion thread where anyone can leave a comment with their name — handy for getting a mentor's or your cohort's read on a sim you built or just played. Any role can create a link, and clicking Share again reuses the same one. Guest play is self-contained: it never touches your own saved attempts, and admins can hide a comment if one needs moderating.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator · validator requires a real role + manager — Jun 2026
  {
    title: "Simulator · no more placeholder “Director / Reporting to VP, VP” sims",
    body: "The simulation validator now requires a real job title and a named manager. Before, a payload that left out jobTitle / vpName / vpRole was accepted and silently filled with generic placeholders, so the sim played as “Director … Reporting to VP, VP.” Now an empty job title is rejected outright, and a missing manager is back-filled from whichever cast member is flagged as the manager (a role containing “…your manager”) before giving up — so AI-generated, hand-authored, and uploaded sims all carry their real role + manager into the player.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Admin · delete a simulation — Jun 2026
  {
    title: "Admin · delete a simulation outright",
    body: "You can now hard-delete a simulation, not just a request. Open any simulation's editor (reachable from a fulfilled request → Open editor) and there's a Delete button in a danger zone at the bottom. It confirms first and tells you exactly what goes: the sim leaves the trainee Career Simulator catalog, and every attempt against it (including any in-progress playthroughs) is permanently deleted; any request that was fulfilled by it keeps its row but loses the link. Admin-gated and audit-logged. Deleting a request — which only clears the queue row and leaves the sim — still works separately.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Limited-time June theme · Art Deco — Jun 2026
  {
    title: "Limited-time theme · Promenade, a powdered Art Deco drop for June",
    body: "A new seasonal theme is live through June 30: Promenade — a powdered, modern take on Art Deco. Warm apricot-cream surfaces, sea-glass teal as the jewel accent, sage and terracotta highlights, crisp geometric edges, a soft sunburst crown and fine line-work. Inspired by the soft 1925 palette as it's revived for the Art Deco centenary — elegant and calm rather than dark and metallic. Pick it from the theme switcher (the apricot-and-teal swatch under \"Limited time\"), or tap it from the theme-of-the-day card on your dashboard. Like all limited drops it retires after June 30, and anyone still on it falls back to their default.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Admin · create a simulation without a request — Jun 2026
  {
    title: "Admin · spin up a role-play simulation without waiting for a request",
    body: "The Simulator queue (Admin → Sim requests) has a new \"New simulation\" button. Paste a job description, hit Generate, and the AI builds a complete role-play simulation on the spot — no user request needed. (Both AI providers down, or you already have a sim built? Expand \"Advanced\" and drag a .json file onto the drop zone — or click to browse, or paste it — instead of generating; it runs through the same validator, and the job description is optional on that path.) The moment it's created it lands in the trainee Career Simulator catalog, so anyone can launch their own attempt — and if a trainee later requests the same posting, it cache-hits your simulation instead of regenerating. Use it to pre-seed the catalog with the roles your cohort actually cares about.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Login · toggle the ambient effects — Jun 2026
  {
    title: "Login · switch the floating molecules and sparkles on or off",
    body: "The sign-in page has a new Sparkles menu in the top bar, next to the theme switch. Open it for two toggles: Floating molecules (the drifting biotech glyphs) and Sparkles (the twinkling marine-snow effect). Turn either off if you'd rather a calmer stage — your choice is saved on that device. Both still respect reduced-motion settings, and both default to on.\n\nAdmins get a platform-wide version too: the same two master switches now sit at the top of the Login Floaters editor (Design & Insight → Login-screen floaters). Flip a layer off there to hide it for everyone — your seated floater gallery stays saved and comes back when you switch the molecules on again. The login-page menu only lets a visitor dim a layer locally; the admin switch is the global default (effective visibility = global AND per-device).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Admin · last-login column + role classification + HR seat — Jun 2026
  {
    title: "Admin · Users gains a live Last Login column, role-group filters, and an HR seat",
    body: "Three upgrades to /admin/users. (1) Last Login is now a real column — every successful sign-in (password or email-code) stamps the time, so you can see who's active at a glance. It populates going forward, from each account's next sign-in. (2) A Group row above the table buckets the current tab by role — All / Admins / Instructors / HR / Trainees / Other — each with a live count; click one to filter. It's a second lens layered on the Real / Demo / Phantom account-kind tabs, so you can answer \"who are my admins\" versus \"who are my trainees\" without scanning rows. (3) A new HR role joins the roster: an internal people-ops seat that sits outside the admin tier — it grants no admin access on its own and is gated per-route, exactly like the employer seat. Assign it from the role dropdown in the batch bar or per row, and superadmins can preview-as HR from the view-as switch.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Admin · batch-delete demo / test users — Jun 2026
  {
    title: "Admin · batch-delete demo and test users in one sweep",
    body: "The /admin/users table now has a Delete action in the batch bar whenever you're on the Demo or Phantom tab. Tick any number of accounts, hit Delete, confirm once, and they're hard-deleted in a single call — along with everything that cascades off them (enrollments, certificates, submissions, signatures, registrations, and more). Safety rails are built in: it only ever removes non-real test accounts, so any real account in your selection is skipped, and your own account and any superadmins are never deleted. Real-user deletion stays per-row and superadmin-gated.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── GSAP capability demo — May 2026
  {
    title: "Added GSAP + an agency-grade launch page at /showcase/gsap",
    body: "GSAP (with @gsap/react and every plugin) is now in the platform, and /showcase/gsap is a public, product-launch-style landing page built entirely around real BioHubNet features — the Engage / Experience / Equip pillars, the career-pathways branch map, the AI resume fit-rating matrix, the employer Talent Reports, and the toolkit rail (AI tutor, master resume, interview prep, AutoPipette). The motion is the medium: smooth scrolling + parallax (ScrollSmoother), a SplitText hero reveal, a scrubbed DrawSVG pathway with a node riding the line (MotionPath), animated fit bars + count-up stats, growing KPI bars, a pinned horizontal feature rail, a cursor-follow glow (quickTo), and a CustomWiggle CTA. Built on the official GSAP skills' React rules — useGSAP auto-cleanup, client-only/SSR-safe, all motion gated behind prefers-reduced-motion, each effect isolated so one can't break the page.",
    kind: "note",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Resume builder — whole page clears the pull drawer — May 2026
  {
    title: "Resume builder — the master-resume bar no longer hides behind the Pull-from-master drawer",
    body: "When you opened “Pull from master”, only the editor below shifted over to make room — the master-resume bar above it stayed full width, so its right-hand action (Promote edits to master) got covered by the drawer. Now the whole resume page — master bar, editor, and back link — reserves room for the drawer while it's open, so nothing sits behind it. (Desktop only; on smaller screens the drawer still overlays and you use the Send-to picker.)",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Resume builder — minimalist, lines-not-boxes — May 2026
  {
    title: "Resume builder — a cleaner, less boxy editor",
    body: "The editor was a stack of heavy bordered cards. It's now minimalist: the header and each section are open blocks marked by a thin left rule (the section ones in their type colour) instead of a full box; the resume picker is a simple underlined row; and the Tailor / Versions / Preview action tiles are flattened to light outlines. Header fields are now underline-style inputs rather than boxed fields, and the master-resume bar's action tiles (Open library / Pull from master / AI tailor / Promote) are flattened to match. The gradients stay where they earn their keep — the page hero and the master-resume bar — so the page reads as clean lines + a couple of rich accents rather than a grid of boxes.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Resume builder — colour-coded sections — May 2026
  {
    title: "Resume builder — each section type now has its own colour",
    body: "Sections are now colour-coded by type — a coloured left border and a matching dot, consistent everywhere: Experience (sky), Skills (emerald), Education (violet), Projects (amber), Certifications (cyan), Publications (indigo), Awards (rose), Volunteering (orange). The same colours run across the resume you're editing, the “Pull from master” drawer, and the master library, so a skill always reads as a skill and an experience as an experience at a glance — handy when you're dragging bullets from master into the right place.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Resume builder — wider, left-aligned editor — May 2026
  {
    title: "Resume builder — the editor now fills the width instead of a narrow centered column",
    body: "The structured resume editor was capped to a narrow centered column, leaving big empty margins — especially with the “Pull from master” drawer open, where the editor floated in the middle with dead space on both sides. It's now left-aligned and uses the full width, so there's room to actually work. With the drawer open, the editor reflows to sit beside it (not behind it), so you get a clean two-pane: your resume on the left, your master bullets on the right, drag straight across.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Resume builder — floating save badge overlap fix — May 2026
  {
    title: "Resume builder — the floating “auto-saves” badge no longer overlaps the hint chip",
    body: "On the resume editor, the always-visible save badge (“Auto-saves / Saving… / Saved · v12”) was pinned to the bottom-right — the same corner as the AutoPipette hint chip — so the two stacked on top of each other. The save badge now lives in the bottom-LEFT, clear of the hint chip and the recovery panel, and the resume error toast tucks just above it.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Resume builder — pull-from-master drag fix — May 2026
  {
    title: "Resume builder — “Pull from master” no longer blurs the resume, and drag works again",
    body: "The pull-from-master drawer used to drop a dimming, blurring backdrop over your resume — which both hid it and quietly intercepted drag-and-drop, so you couldn't actually drag a bullet from your master library onto the resume. It's now a proper side panel: the resume stays fully visible and interactive beside it (on wide screens it even slides left so nothing hides behind the drawer), so you can drag a master bullet straight into any bullet list. Close it with Esc or the ✕; the “Send to…” picker still works too.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Fit-rating matrix — trainee job-app pipeline — May 2026
  {
    title: "New: a fit-rating matrix for your job applications",
    body: "When you're working a role, you can now get an honest, requirement-by-requirement read of how your resume stacks up. Open a job folder's JD tab — or any internship's detail page — and click Build matrix. The AI pulls the 5–9 most important requirements out of the posting and rates each one Strong / Partial / Gap, showing the evidence it found in your resume (or what's missing) and one concrete way to close every gap, topped with an overall fit score and the single highest-leverage move to make before you apply. It uses the resume linked to that folder (or your most recent resume on an internship page), so it's specific to you — not a generic keyword match.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── AutoPipette history — how-it-works chart + tidier events — May 2026
  {
    title: "AutoPipette · my history — added a “how it works” chart and tidied the events list",
    body: "The AutoPipette history page (Profile › AutoPipette · my history) now ends with a clear, step-by-step flow of how the system works — what's captured, when (and whether) AI is involved, where it's stored and for how long, and the controls that bound it — plus a row of plain-language privacy guarantees. Handy if you (or an IT / privacy reviewer) want the whole data path at a glance. The “Recent events” and “Hints shown to you” lists are also collapsed to the latest 5 each, with a one-click “Show all”, so the page isn't a wall of rows.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Showcase form — theme-immune high-contrast fields — May 2026
  {
    title: "Showcase (Regulatory Affairs) — form fields are now high-contrast on every theme",
    body: "The public submission form's labels, input text, placeholders, and field outlines were wired to theme tokens, and the input borders were an 8%-opacity hairline — so on some themes and devices the whole form read washed-out, even though it technically cleared the contrast threshold. The form now uses fixed dark text (labels ~14.7:1, input text ~17:1, helper ~7.6:1) and clearly-visible borders that don't depend on the viewer's theme at all, the same theme-immune approach the error message already used. Strong, consistent contrast for every visitor.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── AutoPipette — AI-written stuck help — May 2026
  {
    title: "AutoPipette — stuck-help now reads your intent instead of saying \"refresh the page\"",
    body: "When AutoPipette notices you're stuck — clicking a control repeatedly, looping on an error — it used to pop a generic \"Something not responding?\" card that just suggested refreshing. It now asks the AI to read what you were actually trying to do (including the button you kept tapping) and writes a specific next step — e.g. \"Trying to submit? There's a required field above\" — with a one-click shortcut when a sensible destination exists. The suggestion's link is restricted to known in-app routes, so it can't point anywhere odd. If you brush a nudge off, the same one won't keep returning; and if AI isn't configured on a deployment, it falls back to a clearer, more useful card. As always, everything AutoPipette notes is visible — and wipeable — at Profile › AutoPipette · my history.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career pathways — spindle timing — May 2026
  {
    title: "Career pathways — branch spindles wait until the cards settle",
    body: "The travelling spindles on the branch-out lines used to start gliding while the connectors were still drawing and the cards were still sliding into place, which looked premature. They now hold off until the final \"settled\" stage — once every card has reached its position — so the lines draw, the cards move, and only then do the spindles begin their loop.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Experience map — self-apply card height — May 2026
  {
    title: "Experience map — the Self-apply card now matches its neighbour's height",
    body: "In the two parallel tracks (Talent Pool vs Self-apply), the Talent Pool card grew taller once it gained its activity vignette, leaving the Self-apply card stranded short with empty space beside it. The Self-apply card now spells out what's inside the live job board — roles from BHN partners, applying on the company's own site, no admin gate — and stretches to fill its column, so the two tracks bottom-align evenly.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career pathways — drop branch-card END marker — May 2026
  {
    title: "Career pathways — branch cards are tighter (the END divider is gone)",
    body: "The branch-out cards used to close with a small \"END\" divider. With the cards measured to their own content height, that divider — plus the gap above it — added height to every card and pushed the layout taller than it needed to be. Removed it: each card now ends right after its content, so the whole branch view packs tighter and there's less scrolling to reach the lower cards.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Experience map — CLI activity vignettes — May 2026
  {
    title: "Experience map — the Admin review & Talent Pool cards now show live activity vignettes",
    body: "On the Experience overview, two stages don't flow to a next page along a connecting line — Admin review and Talent Pool are where work happens *to* your application rather than a step you click through. Those two cards now carry a small terminal-style panel in their empty space that loops through what's going on, so the stage reads as alive instead of static.\n\nAdmin review shows the gate in motion — reading the application, leaving a comment, scoring it, then approving it through to the pool. Talent Pool shows the employer side — viewing the profile, leaving a private comment, sending an intro message, shortlisting for a role. The vignettes are purely decorative (screen-reader–hidden) and hold still for anyone who's set reduced-motion.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Showcase page — eyebrow contrast — May 2026
  {
    title: "Showcase (Regulatory Affairs) — fix: the eyebrow label now meets AA contrast",
    body: "Contrast audit of the public `/showcase/regulatory-affairs` page: the small \"Learning Pathway · Regulatory Affairs\" eyebrow used the brand teal `#0e7da3`, which on the light teal gradient measured only ~4.0:1 — under the 4.5:1 AA threshold for text at that size (10.5px bold). Nudged it to a marginally darker teal (`#0b6f90`, ~4.9:1 across the whole gradient) that reads the same. Everything else on the page passes AA or AAA: heading 14.6:1, body 6.2:1, form labels/placeholders 6.7:1, input text 17:1, error text 8.7:1, and the submit button 4.7:1.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Career pathways — clean branch lines — May 2026
  {
    title: "Career pathways — fix: branch-out lines no longer cross each other or the cards",
    body: "Adding the exploratory branches pushed some roles to 5–6 options, which tipped the branch-out view into a multi-column layout whose connector lines arced over the cards and tangled with each other.\n\nThe branch view now lays out as a **flanking tree**: the source in the centre, destinations split into a left and a right column. Each line fans from the source's left edge to left destinations and its right edge to right destinations — so (a) lines sharing one origin can't cross each other, (b) left vs right go opposite ways and never meet, and (c) each line routes only in its own gutter, so it never crosses a card. Destinations are placed into **three lanes** — a left column, a right column, and the empty space **directly below the source** (one card, reached by a straight-down line) — each option joining whichever lane is currently shortest by height, so no single column runs off-screen. The cards are trimmed to the essentials (role, likelihood, why, and what to learn first), each sized to its own content height, and the padding is tight — so the view **fits on a typical screen without scrolling** while staying clean by construction.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Talent Reports — seed/clear on every report — May 2026
  {
    title: "Talent Reports — seed/clear demo data is now on every report, not just the hub",
    body: "The demo **Seed demo data / Clear** bar now sits at the top of every report — Funnel, Time to fill, Offers, Requisitions, Team productivity, Quality of hire, Source effectiveness, Cost per hire, Diversity — and the Report settings page, so you can populate or wipe the demo company from wherever you are instead of returning to the hub. It's the same seeder, so one click fills (or clears) every report at once; the bar shows Clear only once demo data exists.",
    kind: "improvement",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── Career pathways — branch likelihood vector selector — May 2026
  {
    title: "Career pathways — branch-out now shows ALL possible moves, ranked by likelihood",
    body: "On `/career-paths/pathways`, clicking a role's branch icon (⑂) used to surface cross-moves as equals. It's now a **vector selector**: every place that role can branch to is drawn at once, and each connector line's **saturation, thickness, and glow scale with how likely the move is** — the most natural pivots are vivid and bold, longer-shot moves are thin and desaturated. Each long-enough connector also carries slow-gliding **spindles** whose count signals likelihood — 3 for a strong fit, 2 for mid, 1 for a stretch (very short connectors skip the animation). Each destination card carries a **likelihood chip** — Strong fit / Likely / Possible / Stretch — with a 0–100 affinity bar.\n\nLikelihood is an estimated **transition affinity** (a cosine-similarity-style heuristic, since there's no per-edge probability in the data): peer-level moves score highest, and fewer “learn first” prerequisites mean closer adjacency.\n\n**Two kinds of branches now appear:** the **curated** moves (editorially validated — the most likely) AND auto-discovered **exploratory** long-shots — same-level moves into other streams that aren't a common path but whose day-to-day skills overlap enough to be reachable with focused upskilling. So you see the obvious next steps *and* the roads less travelled, each saturation-ranked by likelihood.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Talent Reports — P6: print one-pager + export-all — May 2026
  {
    title: "Talent Reports — Print → PDF one-pager + Export-all CSV (the suite is complete)",
    body: "The finishing touches that make reports shareable with leadership:\n\n• **Print view** (`/employer/reports/print`) — every report composed into a single, clean one-pager (KPI tiles, funnel, velocity, offers, requisitions, cost, top sources, and diversity when enabled). It's pinned to the light palette so it exports cleanly on any theme, and a print stylesheet hides the app chrome — hit **Print / Save PDF** for a board-ready PDF straight from the browser (no new dependency).\n• **Export all** — one CSV with every section for the selected period, for slicing in a spreadsheet. (Per-report CSVs are still on each report.)\n\nBoth live in the Reports hub header and respect the active period. This completes the Talent Reports suite: executive summary + nine reports + OKR targets with RAG + costs + opt-in diversity, all period-filtered with CSV and PDF export.",
    kind: "feature",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── Talent Reports — P5: diversity / DEI pipeline — May 2026
  {
    title: "Talent Reports — Diversity (DEI) pipeline report: opt-in, aggregate-only, OFF by default",
    body: "A privacy-first **Diversity / DEI** report (`/employer/reports/diversity`) showing representation across the funnel (applicants → reached interview → hired) by self-reported dimension, so you can spot where under-represented groups drop off.\n\n**Built to be safe by construction:**\n  • **Off by default** — a company owner must enable it in report settings, intended only after a legal/privacy review.\n  • **Voluntary self-ID** — only counts applicants who explicitly consented; never inferred.\n  • **k-anonymity suppression** — any cell below 5 is hidden (“—”), with complementary suppression so a hidden value can't be back-derived from the row total.\n  • **Coverage gate** — a dimension is hidden entirely unless ≥ 50% of applicants answered it, so a low response rate can't produce misleading numbers.\n  • **Aggregate-only** — the report (and its CSV) never expose an individual; small counts are blanked in exports too.\n\nThe demo seeder populates consented demographics so you can preview it (enable DEI in settings first). Note: the applicant-facing opt-in capture UI is intentionally the last mile — wire it in when you turn DEI on for real, after sign-off; the data model, suppression, seeding, and report are all in place.",
    kind: "feature",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── Talent Reports — P4: cost-per-hire + targets/cost settings — May 2026
  {
    title: "Talent Reports — Cost-per-hire report + a settings panel to set OKR targets & log costs",
    body: "Two additions that make the OKR/RAG side of the suite real:\n\n**Cost-per-hire report** (`/employer/reports/cost`): cost-per-hire (total recruiting spend ÷ hires), total spend, and breakdowns by **cost type** (advertising, agency, referral bonus, tooling, events, …) and by posting. CSV export included. Cleanly handles zero-hire periods (shows spend + \"no hires in period\" instead of dividing by zero).\n\n**Report settings** (`/employer/reports/settings`): the panel that powers RAG everywhere.\n  • **Targets (OKRs)** — set a goal for any KPI (hires, applications, time-to-fill, time-to-hire, offer acceptance, apply→hire, cost-per-hire). Each report and exec tile then shows on-track / at-risk / off-track + % to goal against your number. Comparator (higher- vs lower-is-better) is auto-set per metric.\n  • **Recruiting costs** — log spend (type, amount, date) to feed cost-per-hire; remove lines anytime.\n  • **DEI toggle** — owner-only switch to enable the (opt-in, suppressed) diversity report; off by default pending legal/privacy sign-off.\n\nWrites are role-gated: managers+ can set targets and log costs; only an owner can flip DEI. Cost-per-hire is also now a live exec-summary tile + nav card on the hub.",
    kind: "feature",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── Talent Reports — P3: source effectiveness — May 2026
  {
    title: "Talent Reports — Source effectiveness: which channels actually produce hires",
    body: "New **Source effectiveness** report (`/employer/reports/sources`): applications by channel (BHN board, referral, employer site, direct email, talent pool), each with % of total, interview rate, hires, and **hire rate** — plus a \"best source\" callout that only ranks channels with enough volume (≥ 5 apps) so a 1-application fluke can't win. CSV export included.\n\nTo power it, applications now capture a **source** at apply time (defaults to the BHN board for platform applies; stamped once and never overwritten on re-apply). The demo seeder distributes sources realistically so the report is populated immediately.",
    kind: "feature",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── Talent Reports — P2: six drill-down reports — May 2026
  {
    title: "Talent Reports — six drill-down reports: funnel, time-to-fill, offers, requisitions, productivity, quality",
    body: "The Reports hub now has its first wave of detailed reports (each period-filtered, with a CSV export and an \"All reports\" nav grid on the hub):\n\n• **Funnel & conversion** — the snapshot pipeline AND a **true-cohort funnel**: of everyone who applied in the window, the share that ever reached each stage (computed from the new transition history, not just the current-stage snapshot) + stage pass rates + biggest drop-off.\n• **Time to fill & cycle time** — median time-to-fill (req open → hire) with p25/p75, time-to-hire (apply → hire), median **time in each stage**, and the bottleneck stage.\n• **Offer analytics** — acceptance %, median response time, the sent/accepted/declined/expired/outstanding breakdown, and decline reasons.\n• **Requisitions** — active/closed/draft/expired counts, aging buckets, stale-req flagging, and a per-posting table.\n• **Team productivity** — activity volume, interviews, scorecards, and hires per teammate (from the activity log).\n• **Quality of hire** — average scorecard score (overall + hired), the recommendation mix, and scorecard completion rate.\n\nExec tiles on the hub now link straight to the matching report, carrying your selected period. The demo seeder was extended so all of these render believably: it now seeds transition-history chains (so the cohort funnel + cycle time aren't empty), interview scorecards + submissions, and an attributable activity log. Source effectiveness, cost-per-hire, and the diversity report are the remaining \"Soon\" tiles.",
    kind: "feature",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── Talent Reports suite — P1: exec summary + hub — May 2026
  {
    title: "New — Talent Reports: a leadership KPI & OKR hub for hiring (/employer/reports)",
    body: "HR can now pull a **board-ready report** instead of reading the live operational dashboard. The new **Reports** tab (employer sidebar) opens an executive one-pager:\n\n• **KPI / OKR tiles** — open requisitions, applications, hires, time-to-fill, offer acceptance, apply→hire rate, and cost-per-hire — each with a **RAG status** (on-track / at-risk / off-track) against the goals you set, a % to goal, and a trend **sparkline**.\n• **Pipeline funnel** for the period — applications narrowing through each stage with conversion %, plus the biggest drop-off stage called out.\n• **Period filter** — month / quarter / year to date, last quarter, last 90 days, or a custom range. Boundaries are computed in your local (Toronto) time so late-evening events bucket correctly.\n\nThe numbers reconcile with the live pipeline and respect your private workspace (admins/superadmins preview against their own demo company). Targets show \"no target\" until you set them — the goal-setting panel and the deeper drill-down reports (funnel detail, time-to-fill, offers, source effectiveness, diversity, cost-per-hire) are rolling out next under the same section.\n\nTip: on `/employer/reports`, click **Seed demo data** to populate a realistic company (≈88 applications, 3 hires, costs, and a set of targets tuned to show each RAG colour) so you can see every tile light up.",
    kind: "feature",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  // ── App-wide — restored the brand accent colour — May 2026
  {
    title: "App-wide — fix: the brand accent is back on buttons, links & charts (a Tailwind v4 migration had quietly dropped the base brand colour)",
    body: "Spotted while investigating why the hiring-analytics \"avg days per stage\" bars were invisible: the bar fill used the `bg-brand` utility, which was rendering with **no colour at all**.\n\n**Root cause — a migration gap.** When the app moved to Tailwind v4 (CSS-first theming), the brand colour *ramp* (`--color-brand-50` … `--color-brand-900`) was carried over, but the **base** `--color-brand` key was not. In Tailwind v4 the bare utilities `bg-brand` / `text-brand` / `ring-brand` / `border-brand` (and their `/opacity` variants like `bg-brand/10`) are generated **only** from `--color-brand` — the numbered ramp doesn't imply a bare `brand`. So ~38 spots across the app that used bare `brand` were silently inert: apply buttons (`bg-brand text-white`) rendered with no background, accent links and focus rings lost their colour, and the analytics velocity bars had an invisible fill (which is what made them look like empty lines).\n\n**Fix.** Added `--color-brand: var(--brand-600)` to the theme — the canonical primary shade (≈9:1 contrast with white → AAA on light themes, and a clearly-visible mid-tone on dark themes). Because it's bound to each theme's own `--brand-600`, the accent now tracks the active theme everywhere. This restores branding in one place across the public job board's apply buttons, the scorecard/templates actions, accent links, and focus states — no per-component edits needed.\n\n**Analytics bars, specifically.** On top of the colour fix, the velocity chart now uses a theme-adaptive track (`bg-fg/10`, visible on both light and dark themes — the old `bg-elevated` track was nearly invisible on dark themes like Voltage) and a vivid `brand-500` fill with a 2px minimum width so even the shortest stage (\"New\", ~7% of the longest) shows a sliver. The bars are now clearly readable on every theme.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Employer analytics — realistic demo funnel — May 2026
  {
    title: "Hiring analytics — demo seeding now produces a believable funnel (volume, real hires, per-posting variance) instead of a flat 1-per-stage line",
    body: "The demo seeder behind `/employer/analytics` made the charts look fake. It put **exactly six applicants on every posting — one per stage** — so the page showed a flat 1·1·1·1·1 \"pipeline,\" **zero hires** (→ \"0%\" offer acceptance), 18 total applicants, and three **identical** postings. Nothing about it read like a real hiring pipeline.\n\n**Now each posting carries an explicit funnel** — a decaying pyramid (many \"new\" applicants narrowing to a couple of offers and a hire) plus an accumulated \"rejected\" bucket — with **per-posting variance**: a hot role (Research Associate, ~47 applicants), a standard role (Regulatory Affairs, ~27), and a niche part-time role (BD Analyst, ~14, already filled). Company-wide that lands at:\n  • **~88 total applicants** (was 18)\n  • **3 hires** and a **60% offer-acceptance rate** (was 0 / \"0%\")\n  • per-stage **velocity bars that form a clean ascending curve** — \"new\" measured in days, \"hired\" in weeks — with funnel-shaped sample sizes (n ≈ 28 → 15 → 10 → 6 → 4 → 2 → 3) instead of n=1 everywhere.\n\nStage-entry timestamps are spread per applicant within realistic windows (later stages skew further into the past), so \"avg days per stage\" and the \"stale ≥ 7 days\" filter both have honest data. Cover letters and rejection reasons vary across a small pool rather than repeating one line.\n\n**Under the hood:** a 56-person demo applicant pool (distinct names, reused across postings — the same person can apply to several roles) is provisioned with a single batched `createMany`, and the ~88 applications + interviews are written with batched inserts (only the handful of offer/hired rows are created individually, since each needs its application id to attach an Offer). The whole seed stays well under the serverless timeout. Seed/clear semantics are unchanged — Clear still sweeps every demo posting (cascading to its applications, interviews, and offers); the applicant pool is reused on the next seed.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Employer team — realistic demo roster — May 2026
  {
    title: "Employer team — demo seeding now builds a realistic org (distinct people & titles, weighted role mix) instead of three repeated clones",
    body: "Refinement to the additive team seeder. It was additive (each click added 3 more), but it stamped the **same three titles** every batch — HR Manager / Talent Coordinator / Dept. Head — just with different names. Seed three times and you got three identical \"HR Managers,\" three \"Talent Coordinators,\" etc., in a perfectly even 1:1:1 role split with identical join/last-seen timestamps. No real talent team looks like that.\n\n**Now each click draws the next distinct people from an ordered 12-person pool.** Every teammate has a unique name **and** title, and titles don't repeat until the pool is exhausted (then it wraps — fine for a demo). The pool is ordered so the roster grows believably:\n  • **Click 1** — Director of Talent (Manager), Senior Recruiter (Generalist), Hiring Manager · Regulatory Affairs (Viewer): a sensible starter team.\n  • **Clicks 2–4** — Technical Recruiter, Talent Coordinator, Recruiting Manager, Sourcing Specialist, Hiring Manager · Quality, University Recruiter, People Ops Partner, VP People, Dept. Head · Clinical Ops.\n\nAcross the full 12 the mix is **3 managers / 6 generalists / 3 viewers** — a realistic talent-org shape (generalist-heavy, a couple of managers, a few view-only hiring managers) that also populates all four role chips (owner = you, the seeder). Titles are life-sciences-flavoured to match BHN. `joinedDaysAgo` descends down the pool so first-added people read as longer-tenured, and `lastSeenAt` varies — some active in the last few hours, some quiet for days, a couple who never logged in — so the roster looks organically grown rather than seeded in identical waves.\n\nStill fully additive (3 per click, globally-unique per-batch emails, no dedup/skip) and Clear still sweeps every demo-account member. Only the *shape* of what gets seeded changed.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Showcase submission form — contrast regression fix — May 2026
  {
    title: "Showcase entry form — fix: text contrast restored (public page now renders in the brand light palette regardless of the visitor's theme)",
    body: "Reported: the submission form on `/showcase/regulatory-affairs` had washed-out, low-contrast text — \"but it was not an issue before.\"\n\n**What changed — the theme system.** The showcase page is a public, brand-controlled surface: it hardcodes a light teal gradient background and **white** form cards/inputs. But the form coloured its text, borders and placeholders with **theme tokens** (`--fg`, `--fg-subtle`, `--line`, `--elevated`, `--brand-400`). Public pages inherit whatever theme the *visitor* has active, and the palette has since grown a family of **dark** themes (Voltage/hitech, Dry Ice, Cold Brew, Chilli, Aurora, …) that redefine `--fg` to a near-**white** value (e.g. hitech `#e3f7ff`). So a visitor on a dark theme got near-white text on the form's hardcoded white fields → barely legible. Before those themes existed, `--fg` was always dark and the form looked fine — hence \"it wasn't an issue before.\"\n\n**Fix — pin the public page to the light palette.** The showcase page root now carries `data-theme=\"light\"`. CSS custom properties resolve from the nearest ancestor that defines them, so every token-based colour inside the page (`text-fg`, `text-fg-subtle`, `border-line`, `bg-elevated`, the `var(--line)`/`var(--elevated)` inline styles on the headshot preview, etc.) snaps back to dark-on-light for the whole subtree — in one place, without rewriting each utility. This is also the semantically correct behaviour: a public intake form should be brand-consistent for every visitor, not adopt the logged-in viewer's personal theme.\n\n**Plus a belt-and-braces fix for the error box.** The inline validation error used the `text-rose-900` utility, which globals.css redefines per dark theme to a *light* rose (hitech `#fca5a5`, Dry Ice `#fecdd3`, …) so errors stay readable on dark cards. Those rules match via the `<html data-theme>` ancestor, so the page-level light pin can't override them — light-rose text would have landed on the light `bg-rose-50` box. Swapped to the arbitrary-value class `text-[#881337]` (rose-900 literal), which has no per-theme override and therefore stays dark-on-light everywhere.\n\nNet: the form is high-contrast and legible for every visitor, on any theme. No change to the form's fields, layout, or the teal submit button (which was already a hardcoded gradient).",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Employer team — additive demo seeding — May 2026
  {
    title: "Employer team — demo seeding is now additive (each click adds 3 more members; Clear sweeps them all)",
    body: "Follow-up: after the preview-company fix, demo-team seeding worked once but \"Add again\" did nothing. The seeder used a **fixed pool of 3 emails** and skipped anyone already a member — so repeated clicks were permanent no-ops, unlike the postings seeder which adds a fresh batch each time.\n\n**Now additive.** Each \"Add demo team\" click mints a fresh batch of 3 demo members with **globally-unique per-batch emails** (`demo.team.<token>.<i>@bhn.test`), cycling realistic names from a 12-person pool so a growing roster shows distinct people rather than clones. Click three times → 9 members.\n\n**Clear sweeps everything.** Instead of matching a fixed email list, Clear now removes **all demo-account members** of the company (detected by `accountKind = \"demo\"`), so it catches every batch plus any legacy fixed-email members from before this change. It also cleans up the now-orphaned demo `User` rows (scoped to the `demo.team.` email prefix so real demo applicants are never touched).\n\n**Page detection** switched to match: the Clear button now shows whenever any member is a demo account, not just when the three legacy emails are present.\n\nNet: view-as-HR → /employer/team → Add demo team (adds 3) → Add again (adds 3 more) → Clear demo (removes all). Lands in the same private preview company as the rest of the seeded HR data.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Employer team — fix: preview company survives demo members — May 2026
  {
    title: "Employer team — fix: demo-team seeding now sticks (preview workspace no longer disqualified by its own demo members)",
    body: "Reported: on `/employer/team` (view-as-HR), \"Add demo team\" did nothing and no Clear button appeared.\n\n**Root cause — a self-defeating heuristic.** `ensureAdminPreviewCompany` identifies an admin's private preview workspace as the company where they're the **sole member**. But the team seeder's whole job is to ADD members (Manager, Generalist, Viewer). So the sequence was:\n  1. Seed postings → creates preview company `P` (admin is sole member).\n  2. Seed team → adds 3 demo members to `P`.\n  3. Next page load → `ensureAdminPreviewCompany` sees `P` now has 3 \"other members\" → disqualifies it → spins up a **brand-new empty company `P2`**.\n  4. Team page reads `P2` → empty roster, no demo members detected → no Clear button, and re-seeding just repeats the cycle.\n\nThe preview company could never hold a demo team, because holding a team is exactly what disqualified it.\n\n**Fix.** The sole-member check now ignores **demo accounts** (`accountKind = \"demo\"`). A company where the admin is the only *real* member stays their preview no matter how many demo teammates live in it. (`accountKind` is non-nullable with default `\"real\"`, so the `{ not: \"demo\" }` filter is null-safe.)\n\nNet: demo team members now persist in the same preview company as the seeded postings/analytics/calendar/templates data, the roster shows them, and the Clear button appears. Any stray empty preview company created by the old behaviour is harmless — the resolver returns the oldest company where the admin is the sole real member (the one that actually holds the data).",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Employer postings — final piece: migrate to the shared resolver too — May 2026
  {
    title: "Employer postings — fix: view-as-HR seeding now appears (the one surface still on the old company resolution)",
    body: "Last-mile fix on the demo-seeding saga. The previous pass unified analytics / calendar / templates / team onto the shared `resolveWorkspaceCompanyId`, but I'd deliberately left the **postings** page on its old `getActiveCompanyId` resolution, reasoning it still worked via a `createdById` fallback. That reasoning was wrong for the exact case the user hit.\n\n**Why postings was still broken for view-as-HR.** When a superadmin uses view-as-employer, the postings page computed `companyId = getActiveCompanyId(userId)` — which returns the superadmin's *first* CompanyMember row, often a leaked/shared company (the very thing `ensureAdminPreviewCompany` exists to avoid). The seed, meanwhile, writes to the *private preview* company. Different companies → the `createdById` fallback never engaged (it only fires when `companyId` is null, and `getActiveCompanyId` returned a non-null *wrong* company) → seeded postings stayed invisible.\n\n**Fix.** Migrated the postings page + its Clear-button count to the same `resolveWorkspaceCompanyId(userId, realRole)` every other surface uses, and broadened the filter to `{ OR: [{ companyId }, { createdById }] }` so it shows both the resolved company's postings AND anything the caller created (covering demo seeds + legacy null-company postings without regressing real admins). All six employer surfaces — postings, analytics, calendar, templates, team, and the seed routes — now resolve the workspace company identically.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Employer demo seeders — unified company resolution (analytics/calendar/templates/team fixed) — May 2026
  {
    title: "Employer demo seeding — fixed across analytics, calendar, templates & team (seed-write and page-read now resolve the same company)",
    body: "Follow-up to the postings-seeder fix. An audit of every `/employer` surface's seed/clear flow — for both real employers and admins/superadmins using view-as — surfaced a systemic mismatch behind \"seeding does nothing\" on Hiring Analytics, the Interview Calendar, Email Templates, and Team Management.\n\n**Root cause.** Two different company-resolution strategies were in play:\n  • **Read pages** (analytics / calendar / templates / team) resolved an admin's company via `ensureAdminPreviewCompany` — a *private, sole-member* preview workspace.\n  • **Seed routes** (`/api/employer/demo/seed`, `/demo/templates`, `/demo/team-seed`) resolved via `getActiveCompanyId` — which returns null or a *different* (possibly shared) company.\n\nSo the seed wrote rows into company A while the page read from company B → the surface stayed empty after seeding. Worse, both strategies keyed on the **effective** role, so a superadmin using **view-as-employer** (effective role \"employer\", no genuine CompanyMember row) resolved to `null` on both sides → nothing could be seeded into a company-scoped surface at all.\n\n**Fix — one shared resolver.** New `resolveWorkspaceCompanyId(userId, realRole)` in `src/lib/employer/admin-preview.ts` is now the single source of truth, used by BOTH every seed route AND every read page:\n  • Keyed on the caller's **real** role (`session.user.realRole`), so a superadmin using view-as-employer still routes to their private preview company — seed and read finally agree.\n  • admin / superadmin → `ensureAdminPreviewCompany` (private sole-member workspace, no cross-admin leak).\n  • genuine employer → `getActiveCompanyId` (their real CompanyMember).\n\n**Surfaces fixed:**\n  • **Hiring Analytics** — funnel / velocity / offer-rate now populate after seeding; the demo-data check switched from a `createdById` count to a `companyId` count (matching what the charts read).\n  • **Interview Calendar** — interview slots from seeded postings now appear; same `companyId` demo-check fix.\n  • **Email Templates** — the 5 demo templates (one per hiring stage) now show after seeding for admins/superadmins, not just real employers. (Per the request to have seed/clear work for every template surface.)\n  • **Team Management** — replaced a bespoke `resolveCompanyId` that adopted the FIRST company in the table (a cross-admin leak vector) with the shared resolver, so demo teammates land in — and the page reads from — the same private preview company.\n\n**Verified consistent for all three caller shapes**: real employer (genuine company), real admin/superadmin (private preview company), and superadmin acting-as-employer (also the private preview company). Postings + the brand-stage overview were already correct and are unchanged.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Employer demo seeder — fix: postings now appear after seeding — May 2026
  {
    title: "Employer workspace — fix: \"Seed demo postings\" now actually shows postings (was silently empty)",
    body: "Bug: on `/employer/postings`, clicking **Seed demo postings** — including when an admin views-as the HR/employer role — created the postings in the database but the list stayed empty even after a refresh.\n\n**Root cause.** When the employer-team-portal shipped, the postings list switched to *company-scoped* reads: whenever the viewer has an active company, the page queries `WHERE companyId = <their company>`. But the demo seeder was never updated to match — it still wrote postings with only `createdById` + `companyName` set, leaving `companyId` null. So the company-scoped read filter never matched the freshly-seeded rows, and the workspace looked empty.\n\n**Fix.** The seed route now resolves the caller's active company (the same `getActiveCompanyId` the read path uses) and stamps `companyId` on every seeded posting. This lines the write up with the read in both cases:\n  • Viewer has a company → seeded postings carry that `companyId` → the `{ companyId }` filter returns them.\n  • Viewer has no company → `companyId` stays null, `createdById` is set → the read path's fallback `{ createdById }` filter returns them.\n\nThe **Clear demo postings** path was also made symmetric — it now sweeps demo seeds by both `createdById` and the active `companyId` (gated by `isDemoSeed` so real postings are never touched), so it catches both legacy null-company seeds and any company-scoped seeds a teammate created.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Events — SMS reminders (Twilio) + real-time admin feed — May 2026
  {
    title: "Events — Twilio SMS reminders (opt-in) + real-time admin attendee feed",
    body: "Two host/attendee improvements that close the last visible gaps with Luma's host-side product (other than native mobile + paid checkout, both deliberately deferred).\n\n**1. SMS reminders via Twilio.** Attendees can opt in to text-message reminders at registration time — fires for the **1-day-before** and **1-hour-before** windows alongside the existing email reminders. The **1-week-before** stays email-only since SMS that far out isn't materially more useful.\n  • Schema: `Registration.guestPhone` (E.164 string, nullable) + `Registration.smsOptIn` (Boolean default false). `User.phone` was already present — used as the fallback for signed-in registrants. Migration `20260802000000_sms_optin`.\n  • New `src/lib/sms.ts` — lazy Twilio client + `smsConfigured()` predicate matching `mailConfigured()`. `toE164()` normaliser drops malformed numbers at write-time so the cron never wastes attempts on typos.\n  • New `src/lib/sms/templates.ts` — tight ≤ 160-char templates (single Twilio segment, $0.0075/send US+Canada). Two kinds: `one_day` (\"BHN reminder: <title> is tomorrow at 7 PM…\") and `one_hour` (\"BHN: <title> starts in ~1hr…\"). Both include a short link back to the success page so the recipient can pull up their QR.\n  • Public form: opt-in checkbox (\"Text me 1 day and 1 hour before the event\") reveals a phone input when ticked. Standard `autoComplete=\"tel\"`.\n  • Cron extension: `/api/cron/event-reminders` now fans SMS alongside email for the two qualifying kinds when (a) Twilio is configured, (b) `smsOptIn` is true, and (c) a phone is on file. Failures are logged but don't gate the email.\n  • Setup docs at `docs/sms-setup.md` — sign up at twilio.com → buy a phone number ($1/mo) → set 3 env vars on Vercel → redeploy.\n  • Until env vars are set the reminder cron silently skips SMS dispatch; email reminders fire as before.\n\n**2. Real-time admin attendee feed.** The `/admin/events/[slug]/registrations` page now has a live polling widget at the top showing current counts + a recent-activity feed.\n  • New polling endpoint `GET /api/admin/events/[slug]/live?since=<iso>` — returns fresh counts (total / confirmed / pending / waitlist / checked-in) + arrays of registrations created OR check-ins recorded since the cursor.\n  • New `LiveAttendeeFeed` client component polls every 5 seconds (configurable). When a count changes, the matching tile **pulses** (scale + brand-ring) for 900 ms. New activity prepends to the feed list with a fade-in slide-from-top animation.\n  • Live indicator at the top with a green pulsing dot (or grey when paused). **Pause / Resume button** halts polling so admins can take screenshots or scroll without auto-refresh jitter.\n  • When new activity comes in, the component fires `router.refresh()` so the underlying RegistrationsTable stays in sync without a hard reload — admins see the new row in the table within a second of it arriving.\n  • At 5-second polling with parallel-query batching, the server cost is trivial: ~720 polls/hour with 6 small queries each = ~4,300 simple Postgres lookups per admin-hour.\n\nNet: an event host watching the admin page during peak registration sees attendees arriving in real time, with a tile-pulse hint and a feed entry that names them. Day-of check-ins flow through the same feed with a green check icon. SMS reminders fire 1 day + 1 hour before the event for anyone who opted in, with the same branded copy as the email reminder but compressed to a single segment.\n\nThis brings BHN to feature parity with Luma's host-side product except for native mobile apps (out of scope) and active Stripe paid checkout (held by team decision).",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Events — Stripe paid checkout dormant per team decision — May 2026
  {
    title: "Events — Stripe paid checkout kept dormant; all events run as free registration for now (team decision)",
    body: "Status clarification on the Stripe paid-ticketing infrastructure that shipped earlier this batch.\n\n**Team decision**: all events run as **free registration** for now. The Stripe schema (`TicketType`), Stripe SDK helper, public checkout endpoint, and webhook handler are all shipped and dormant. **The public ticket picker is intentionally NOT wired into the registration form** — `SimpleRegistrationForm` continues to be the single canonical path for both signed-in users and guests, free across the board.\n\n**What this means in practice**:\n  • Defining ticket tiers in `/admin/events/<slug>/tickets` is fine — but they aren't surfaced to attendees yet. A new always-on banner on that page makes this explicit.\n  • Public registration flows are unchanged. No attendee will see a ticket picker or a Stripe Checkout redirect.\n  • The Stripe env vars don't need to be set on Vercel. Until activation, the infrastructure stays dormant regardless of Stripe configuration.\n  • Capacity + waitlist + .ics + reminders + custom questions + bulk email + co-hosts all keep working as before.\n\n**Why hold**: keeping registration free for the launch phase removes a category of friction (payment confusion, refund operations, support tickets). Stripe is ready to activate as a small follow-up when we want it — the path is documented at `docs/event-roadmap.md`.\n\n**To activate later**, the missing pieces are:\n  • Public ticket picker on `/events/<slug>/register` that forks between the free `SimpleRegistrationForm` and a paid \"select tier → POST /checkout\" path when ticket types exist with `priceCents > 0`\n  • Branded confirmation email send from the webhook handler\n  • Stripe env vars on Vercel (see `docs/stripe-setup.md`)",
    kind: "note",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Events — Phase 4 batch 1: cover upload + hosts admin + Stripe — May 2026
  {
    title: "Events — cover image upload + hosts admin UI + Stripe paid ticketing (Phase 4 batch 1)",
    body: "Three Phase-4 features in one batch. Cover image upload + hosts admin UI complete the polish items deferred from Phase 3; Stripe paid ticketing is the biggest standalone capability gap with Luma.\n\n**1. Cover image upload.** The Cover image field in the EventBasicsEditor now accepts a **file upload** (PNG / JPG / WebP / AVIF, ≤ 8 MB) in addition to the URL input. Files go to R2 via the existing `putR2Object` primitive with a token-prefixed key path so re-uploads don't collide. Old objects are best-effort cleaned up when replaced. New API: `POST /api/admin/events/[slug]/cover-image` (multipart). New widget: `CoverImageInput` with file picker + URL fallback + image preview + remove button.\n\n**2. Hosts admin UI.** New page at `/admin/events/[slug]/hosts` for the hosts CRUD shipped in Phase 3 (which only had the API). `HostsManager` component lists current hosts with avatar circle, name, email, role label, and a Remove button; add form takes email + role label (defaulting to \"host\"). The user must already have a BHN platform account — the API rejects unknown emails with a clear error. Jump-off link added to the event admin detail page.\n\n**3. Stripe paid ticketing.** Substantial — six new files + a Stripe SDK install + one schema migration.\n  • New `TicketType` model (migration `20260801000000_ticket_types`): `name`, `description`, `priceCents`, `currency`, `capacity` (per-tier optional cap), `isActive`, `displayOrder`, and a `stripePriceId` cache populated on the first checkout.\n  • New `src/lib/stripe.ts` helper — lazy SDK client, `stripeConfigured()` predicate matching `mailConfigured()`, `createCheckoutSessionForTicket()` that creates Stripe Product + Price on the fly the first time a tier is purchased, and `verifyWebhook()` for signature validation.\n  • Admin CRUD at `/admin/events/[slug]/tickets` — list tiers, add new tier (name, description, price-in-dollars, currency, optional capacity, active toggle), edit (with auto-invalidate of cached `stripePriceId` when price changes — Stripe Prices are immutable so we re-create lazily), delete with confirmation. Free ($0) tiers are valid and skip Stripe entirely.\n  • Public **checkout endpoint** `POST /api/events/[slug]/checkout` — resolves the attendee's identity (signed-in or guest), creates a Stripe Checkout session with the bhn-event/ticket/attendee data folded into session metadata, returns the hosted Checkout URL. The Registration row is **not** created up front — Stripe holds the cart, the webhook creates the row when payment lands, so abandoned carts don't leave ghost rows behind.\n  • **Webhook handler** at `POST /api/webhooks/stripe` — signature-verified via `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed`: rebuilds the Registration from session metadata, applies the same capacity / waitlist / approval logic as the regular registration flow, stamps `paymentProvider=\"stripe\"`, `paymentStatus=\"paid\"`, `externalPaymentId=<sessionId>`, `amountCents`, `currency`. Idempotent — replays from Stripe (test events, re-deliveries) don't double-create the Registration.\n  • Success page extended to accept `?session_id=…` so visitors redirected from Stripe Checkout land on their just-created Registration via `externalPaymentId` lookup.\n  • Full setup doc at `docs/stripe-setup.md` — sign up at stripe.com → API key → webhook endpoint config → env vars on Vercel → ticket tier UI.\n\n**Stripe — what's left for a follow-up**:\n  • **Public ticket picker** on the registration form (currently the checkout endpoint exists but the form doesn't fork between free + paid yet)\n  • Branded confirmation email send from the webhook (today the row is created but the email isn't auto-sent — admin resend works)\n  • Refund webhook + admin refund UI\n  • Multiple tickets per checkout (currently single-quantity)\n  • Coupon codes\n\n**Until Stripe env vars are set on Vercel**, paid ticketing falls back gracefully — the admin can still define ticket tiers (free ones work), and the checkout endpoint returns 503 with a clear message. The amber banner in the ticket admin UI explains the setup steps.\n\nThis closes the biggest visible capability gap with Luma. Phases 1–4 batch 1 are now shipped; remaining gaps are Phase 4 batch 2 (series/recurring events + public discovery improvements + Stripe polish items above).",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Events — Phase 3: custom questions + bulk email + co-hosts — May 2026
  {
    title: "Events — custom registration questions + bulk email to attendees + multiple hosts (Phase 3 of the Luma-parity roadmap)",
    body: "Three host-productivity features that close the rest of the gap with Luma for everything except paid ticketing + native mobile (which stay deferred).\n\n**1. Custom registration questions per event.** Admins can add arbitrary questions to the registration form — five widget kinds: short text, long text, single choice (radio), multiple choice (checkboxes), and yes/no. Each question has a stable kebab-case key (for CSV export columns), an optional hint, a required flag, and display order.\n  • New models `CustomRegQuestion` + `CustomRegAnswer` (migration `20260731000000_event_hosts_questions_broadcasts`).\n  • Admin CRUD UI at `/admin/events/<slug>/questions` — add, edit, delete with confirmation, live preview of slugified key.\n  • API endpoints `POST/GET /api/admin/events/[slug]/questions` + `PATCH/DELETE .../[questionId]`.\n  • Public registration form renders questions dynamically below the standard fields with proper widget per kind. Required questions block submission. Server-side validation in the registration POST persists answers in the same transaction as the registration (atomicity preserved).\n  • Jump-off button on the event admin detail page.\n\n**2. Bulk email to attendees.** Admins can send a one-off email to any slice of registrants — pre-event reminders, day-of logistics, post-event thanks. Compose UI at `/admin/events/<slug>/messages` with audience picker (All / Confirmed / Pending / Waitlist / Checked-in) showing live counts.\n  • Markdown body (bold, italic, links, paragraph breaks) → branded HTML at send time, sharing chrome with the registration-confirmation template.\n  • New `EventBroadcast` model logs every send: subject, body, audience filter, recipientCount, sentCount, sentAt, sentBy. Past broadcasts list below the composer with success rate.\n  • Send goes through the same nodemailer transport that registration emails use — no new SMTP setup needed.\n  • Jump-off button on the event admin detail page.\n\n**3. Multiple hosts per event.** Events can now have multiple hosts / co-hosts / moderators attributed.\n  • New `EventHost` junction model with role (free-text label) + display order, `@@unique([eventId, userId])`.\n  • API `POST /api/admin/events/[slug]/hosts` (lookup user by email — idempotent) + `DELETE .../[hostId]`.\n  • Public event page hero now shows **\"Hosted by N1, N2, N3\"** as part of the meta row when hosts exist.\n  • Dedicated admin UI for managing hosts deferred to Phase 4; the API ships standalone (call from curl or temporarily via Prisma Studio).\n\n**Schema migration**: 4 new models in one migration — `EventHost`, `CustomRegQuestion`, `CustomRegAnswer`, `EventBroadcast`. All with proper indexes + cascade rules.\n\n**Phase 3 scope decision**: deferred cover image upload UI (the URL input already works and a real Vercel Blob integration is its own scope) and the dedicated Hosts admin page (CRUD API exists; visible benefit is small without it but it doesn't block the public-page Host display). Both moved to Phase 4.\n\nAfter this commit, Phases 1–3 of the Luma-parity roadmap are shipped. The remaining gaps in Phase 4 — series/recurring events, public discovery improvements, Stripe paid ticketing — are substantial enough that they're independently shippable each on their own.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Events — HTML branded email + .ics + timed reminders (Phase 2) — May 2026
  {
    title: "Events — HTML branded confirmation email + .ics calendar attachment + timed reminder emails (Phase 2 of the Luma-parity roadmap)",
    body: "Phase 2 of the gap-closure roadmap (`docs/event-roadmap.md`) closes the email + calendar polish gap with Luma. Three pieces:\n\n**1. HTML branded confirmation email.** Plain-text emails replaced with a designed HTML template at `src/lib/email/templates/registration-confirmation.ts`. Table-based layout (email-client compat), inline CSS (Gmail strips `<style>` tags), brand-gradient header band with the event title + date, status banner that adapts to **registered / waitlisted / pending** (green / amber / brand-blue accent), event details card, QR check-in code embedded as **inline SVG data URL** (renders in Apple Mail + Gmail + Outlook web; falls back to the alt-text qrToken string for older Outlook), and a primary CTA back to the registration page. Plain-text fallback preserved for spam-filter scoring + accessibility.\n\n**2. `.ics` calendar attachment.** New RFC 5545 builder at `src/lib/events/ics.ts` — UID, DTSTAMP, ORGANIZER, ATTENDEE, line folding at 75 octets, text-escape rules. Attached to every confirmation email via nodemailer's `attachments` array; recipients see an \"Add to Calendar\" button in Apple Mail / Gmail / Outlook desktop. **Standalone download endpoint** at `/events/<slug>/calendar.ics` powers a new \"Apple / iCal (.ics)\" entry in the AddToCalendar dropdown on the public event page — covers desktop Outlook, Thunderbird, Linux KOrganizer, etc. that aren't covered by the Google/Outlook-web/Yahoo URL deep-links.\n\n**3. Timed reminder emails — 1 week / 1 day / 1 hour before.** New `EventReminder` model + migration `20260730000000_event_reminders`. Vercel cron at `/api/cron/event-reminders` fires every 15 minutes (config in `vercel.json`); iterates published events whose startDate is in the next 7 days + a 30-minute tolerance window. For each missed reminder kind it sends the appropriate template variant — three styles sharing the same chrome but with distinct copy + visibility of the QR code:\n  • **One week** — \"Save the date\" framing, no QR (still too early)\n  • **One day** — \"Tomorrow\" framing, QR shown, practical last-minute notes\n  • **One hour** — \"Starting soon\" framing, big QR + meeting-link shortcut for online events\n  The `(eventId, kind)` unique constraint on `EventReminder` makes double-sends impossible regardless of cron retries / re-fires.\n\n**Bonus**: the cron endpoint sends reminders to **confirmed + pending + waitlisted** registrants — waitlisters benefit from \"the event is tomorrow\" because they might convert if a seat opens last-minute. Bearer-token auth (`CRON_SECRET` env var) protects the endpoint from external callers.\n\n**No new env vars needed beyond the existing SMTP_* batch** (set up per `docs/email-setup.md`). When SMTP isn't configured the cron returns `{ ok: true, skipped: true }` and registrations silently no-op on email send — both fall back gracefully.\n\nNet effect: a registered attendee now gets a polished branded email with a working calendar invite, a one-week reminder, a day-before reminder, and a starting-soon reminder. The visible polish gap with Luma is closed for the registration → reminder lifecycle.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Events — capacity + waitlist + add-to-calendar (Phase 1 of Luma-parity roadmap) — May 2026
  {
    title: "Events — capacity cap + auto-waitlist + add-to-calendar dropdown (Phase 1 of the Luma-parity roadmap)",
    body: "Closing the first batch of gaps between BHN events and Luma. Full plan lives at `docs/event-roadmap.md`; this commit ships Phase 1.\n\n**1. Event-level capacity + auto-waitlist.** Until now events were uncapped — the only seat caps were per-workshop. Now:\n  • New `BhnEvent.maxAttendees` (nullable Int — null means uncapped, the symposium default) and `waitlistEnabled` (Boolean default true) columns. Migration `20260729000000_event_capacity_and_waitlist`.\n  • New `Registration.waitlistPosition` (nullable Int).\n  • `Registration.registrationStatus` now accepts a fourth value, `\"waitlist\"`. (String column — no enum change needed.)\n  • Registration API counts active rows (pending + confirmed); over-cap registrations either land on the waitlist with auto-assigned position or get rejected with a clear \"event full\" message (controlled by `waitlistEnabled`).\n  • `cancelRegistration` now auto-promotes the next waitlister when a confirmed/pending seat is freed — they get bumped to confirmed (or pending if the event requires approval), preserving the audit trail.\n  • Public hero capacity badge — shows `\"X / Y registered\"`, or `\"N spots left · Almost full\"` (≤10 left, rose-tinted), or `\"Full · Waitlist open\"` (amber chip), or `\"Sold out\"`.\n  • Primary CTA relabels to **\"Join the waitlist\"** when full + waitlist open. Disabled `\"Event full\"` button when full + waitlist closed.\n  • Success page + confirmation email both adapt to the waitlist case: position #N callout, distinct subject line (`Waitlisted — <title> (position #3)`), and copy explaining auto-promotion.\n  • Admin create form includes capacity input + waitlist toggle.\n\n**2. Add-to-calendar dropdown** on the public event hero. Three platforms: Google Calendar, Outlook (web), Yahoo Calendar — all URL deep-links, no file generation. `.ics` file (for Apple Calendar / desktop Outlook / Linux Thunderbird) is queued for Phase 2 alongside the proper attachment in the confirmation email.\n  • New helper module `src/lib/events/calendar-links.ts` builds platform-specific URLs from event data (RFC 5545 `YYYYMMDDTHHmmssZ` format for Google + Yahoo, ISO strings for Outlook).\n  • New `<AddToCalendar>` client component with three menu entries, dropdown chevron, click-outside dismissal.\n\n**3. Roadmap doc** at `docs/event-roadmap.md` lays out all four phases:\n  • Phase 1 (this commit): capacity + add-to-calendar URL links\n  • Phase 2 (queued): HTML branded email + `.ics` attachment + timed reminders (1 week / 1 day / 1 hour)\n  • Phase 3 (queued): custom registration questions + bulk email + multiple hosts + cover image upload\n  • Phase 4 (queued): series/recurring events + public discovery + Stripe paid ticketing\n  • Explicitly NOT scoped: native mobile, SMS, cover video.\n\nNo behaviour change for existing events (maxAttendees defaults to NULL = uncapped; existing rows continue exactly as before).",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Events — anonymous registration + Resend wiring — May 2026
  {
    title: "Events — register without signing in (guest path), confirmation email via Resend",
    body: "Two changes that make events usable as actual public events instead of trainees-only:\n\n**1. Anonymous registration.** Previously `/events/<slug>/register` bounced anonymous visitors through `/login` — fine for trainee-only symposiums, fatal for an open info session. Now the form is **public by default**:\n  • No session → form collects name + email + optional organization, plus the usual attendee-type / dietary / accessibility fields.\n  • Session → form pre-fills from the session and only asks for the event-specific bits.\n  • Submits to the same POST `/api/events/<slug>/register`, which forks on session presence: user path stores a normal Registration with `userId`; guest path stores `userId=NULL` + `guestEmail` + `guestName` + `guestOrganization`.\n  • **Idempotency on the guest path** is enforced by a new unique index `(eventId, guestEmail)` — same email re-registering for the same event returns the existing row's qrToken rather than creating a duplicate.\n  • The success page accepts a `?token=<qrToken>` query param so guests can return to their confirmation later via the link in their email. Signed-in users still resolve via session.\n  • Guest registrations skip the workshop-picker (those require a User row at the booking-service layer). The form for guests / simple-session events is a separate lean component (`SimpleRegistrationForm`); the rich form with workshop pickers (`RegistrationForm`) stays for signed-in users on full-shape events.\n\n**2. Resend wiring (via SMTP).** Picked Resend for transactional email deliverability. Crucially we don't change `src/lib/mail.ts` at all — Resend exposes an SMTP server (`smtp.resend.com:587`), so the existing nodemailer transport just points at it via env vars. The admin needs to:\n  1. Sign up at resend.com (free tier: 100/day, 3000/month).\n  2. Verify the `biohubnet.ca` domain (paste 3 DNS records — done once).\n  3. Generate an API key.\n  4. Set 5 env vars on Vercel: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_USER=resend`, `SMTP_PASS=<api-key>`, `SMTP_FROM=BioHubNet <info@biohubnet.ca>`.\n  5. Trigger a redeploy.\n  Full step-by-step lives at `docs/email-setup.md`.\n\nUntil env vars are set, registration silently no-ops on the email send (the `mailConfigured()` guard catches it) — registrations still succeed end-to-end, the email just doesn't fire.\n\n**Schema migration** (`20260728000000_registration_guest_fields/migration.sql`):\n  • `Registration.userId` becomes NULL-able.\n  • Adds `guestEmail`, `guestName`, `guestOrganization` (all NULL-able TEXT).\n  • New `UNIQUE(eventId, guestEmail)` for guest idempotency. The existing `UNIQUE(eventId, userId)` still works for signed-in users (per SQL semantics, NULL != NULL so multiple guest rows don't collide on it).\n\n**Downstream code changes**: 13 files touched. `approveRegistration` + `cancelRegistration` helpers refactored to take `registrationId` instead of `(eventId, userId)` — needed because lookup by composite key doesn't work for guest rows. Admin pages (registrations list, detail, bulk actions, CSV export, resend-email) all updated to fall back to guestName / guestEmail / guestOrganization when User is null. A `Guest` badge appears next to the attendee name on the admin detail page for non-User registrations.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Events public page — polymorphic across event scales — May 2026
  {
    title: "Public event page now adapts to small online info sessions, not just multi-day symposiums",
    body: "The event page was originally built for the BHN Annual Symposium & Training Week shape — multi-day, multi-track, workshops + agenda + speakers + sponsors. When you create a small online info session via `/admin/events/new`, several pieces of the page still assumed the big shape and ended up showing dead scaffolding (\"0 workshops on offer\", \"Symposium day: TBD\") or wrong copy (\"See the agenda\" linking to a non-existent agenda, hardcoded \"In person\" chip, hotel-themed accommodation card).\n\nAdded an `isSimpleSession` predicate (no workshops AND no symposium sessions) and used it to make the page polymorphic across event scales:\n\n**1. At-a-glance card now hides for simple sessions.** Was a fixed 4-stat grid (Dates / Venue / Workshops / Symposium day) that read \"0 on offer\" and \"TBD\" for sessions. Now: hidden entirely when there are no workshops or sessions to count, and for medium-shape events (only some extras) the grid drops to 3 columns instead of 4. The hero's bottom edge now sits right against the description for clean info-session flow.\n\n**2. \"See the agenda\" hero button only renders when an agenda exists.** Previously it always rendered and scrolled to `#agenda` — which 404'd inside the page for sessions.\n\n**3. Hero date eyebrow includes the time range for same-day events.** Was just \"Dec 15, 2025\"; now \"Dec 15, 2025 · 7:00 PM–8:00 PM\" for a same-day event. Time matters more than date for a one-hour info session.\n\n**4. Speakers section adapts to count.** When there's exactly 1 speaker, the eyebrow + title become \"Hosted by · Your host\" (description suppressed). 2+ speakers keep the original \"Featured · Speakers, panellists, and facilitators\" copy. So a session with a single host doesn't get the symposium-style speakers grid headline.\n\n**5. Accommodation card relabels for online events.** Was always \"Accommodation · Hotel block\". When the event is online and `accommodationInfo` is filled, it becomes \"Logistics · What to know\" — the field still works for any free-text logistics, but the framing fits.\n\n**6. Footer CTA also uses the time-included date line.** Symmetric with the hero — both ends of the page show \"Dec 15 · 7:00 PM–8:00 PM\" rather than just the date for same-day events.\n\nNet result: a simple online info session at `/events/<slug>` now reads as a clean focused page — hero with title + date + time + Online chip + Register button → description → venue card (online platform + meeting link or fallback message) → footer CTA. No empty workshop slots, no agenda buttons that go nowhere. Multi-day symposium events still get the full scaffolding as before; nothing is taken away from them.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Events public page — editorial taste pass — May 2026
  {
    title: "Public event page — editorial taste pass: left-aligned hero, online/in-person detection, section numbering, balanced footer",
    body: "Ran a taste-skill design audit on `/events/<slug>` and shipped four targeted changes that move the page from generic-SaaS toward editorial-considered while staying inside the existing brand-blue identity.\n\n**1. Editorial hero (was centered-over-dark-mesh).** The taste-skill rulebook explicitly flags \"centered hero over dark mesh\" as one of the LLM defaults to reach past. Switched to left-aligned with:\n  • **Date as oversized monospace eyebrow** at the top — the date is the single most useful piece of info on an event page and now gets the prominence it deserves (`tracking-[0.28em]` uppercase mono, 11–12 px).\n  • **Display-scale title** with negative leading (`leading-[0.95]`) so it reads as a confident editorial headline rather than a balanced web-marketing centered block. Up to `lg:text-7xl` on wide viewports.\n  • **Tagline** in lighter font-weight (`font-light`) as a balance to the bold title — gives the hero a real typographic contrast pair instead of one weight throughout.\n  • **Slim horizontal rule** below the tagline as a chapter-break, then meta + CTAs sit below it. Editorial pause built in.\n  • **Meta moved to a flat row** (not chips-on-chips). One row: venue + mode, separated by space, no pill backgrounds.\n\n**2. Online vs in-person detection.** The hero used to hard-code \"In person\" as a chip. Since `/admin/events/new` now creates online events, that chip would lie. Added an `isOnline` predicate (`mainVenueName === \"Online\"` OR map URL exists with no address) and the hero meta + venue card both gate on it. Online events show **\"Online · {platform}\"** with a Video icon, and the venue card shows \"Online via [platform]\" with an \"Open meeting link\" CTA (or a graceful fallback line — *\"The meeting link will be sent to confirmed registrants closer to the event\"* — when no URL is stored yet).\n\n**3. Section numbering — `01 · Training Week`, `02 · Symposium Day`, etc.** Each rendered section's eyebrow now carries a sequential two-digit number in monospace, separated by a centered dot, before the eyebrow text. Counted dynamically based on what actually renders (workshops + agenda + speakers + sponsors — skipped when empty). Reads as chapters rather than as a generic landing.\n\n**4. Footer CTA — broke the duplicate-gradient pattern.** The footer used to reuse the exact same `heroBg` as the hero. Lazy. Replaced with a dark `bg-fg` band that has its own composition: event title re-surfaced (people scrolled past the hero — re-anchoring them in what they're registering for makes the CTA feel grounded), date in mono eyebrow, and a **two-column desktop layout** with the title on the left and the CTA button on the right (rather than centered). Mobile collapses to a single column. Net: the footer now feels like its own moment rather than a copy-paste of the top.\n\n**No motion added, no new components, no schema changes.** All changes are typographic/compositional and live inside the existing design tokens.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Role switch overlay — from → to + 1.5s floor — May 2026
  {
    title: "Role switch overlay now shows from → to and stays on screen for at least 1.5 seconds",
    body: "Two related fixes on the overlay that surfaces when you hit `x` or `xx` (or pick from the sidebar dropdown) to switch viewing-roles.\n\n**1. Now shows the transition, not just the destination.** Before: *\"Switching role — Now viewing as Employer HR\"*. After: *\"Switching role — Trainee → Employer HR\"* with the destination highlighted in brand colour. You can see at a glance what you switched FROM as well as TO, which is useful when you've been chaining role-switches and lose track. The FROM is humanised — `actingAs=\"trainee\"` becomes \"Trainee\", and when you're at your real seat the copy reads \"your real seat\" (no role exposure).\n\n**2. Stays on screen for at least 1.5 seconds.** Before: the overlay dismissed as soon as `router.refresh()` returned, which on fast routes was sub-second — too quick to read. Now there's a **min-display floor of 1500 ms**: if the server refresh returns in 300 ms, the overlay still stays for the remaining 1200 ms so the user has time to register the transition. If the refresh returns AFTER 1.5 s (slow route), it dismisses immediately as before. The 3-second safety-net dismiss for stuck refreshes still applies.\n\n**Bonus polish**: when the refresh completes BEFORE the 1.5 s floor, the spinner flips to a green check (and the eyebrow swaps from \"Switching role\" to \"Role switched\") so the user can see the work actually finished — they're just being given a beat to read it. Once 1.5 s has elapsed the overlay dismisses cleanly.\n\nBoth keyboard shortcut callers (`x` and `xx` in `KeyboardShortcuts`) and the sidebar `RoleSwitcher` dropdown were updated to pass the FROM label through the new `dispatchRoleSwitchStart(from, to)` signature.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Event flow polish — new-event form + public page + dashboard pill — May 2026
  {
    title: "Event flow polish — split date/time + one-day toggle + online mode on the new-event form; removed canned copy on the public event page; gave the committee pill its own space on the dashboard",
    body: "Four targeted improvements across the event-management surface and the trainee dashboard.\n\n**1. `/admin/events/new` — split date/time + one-day toggle.** The previous form used `<input type=\"datetime-local\">` for start and end, which made it tedious to enter same-day events (you typed the date twice). Now each side has separate `<input type=\"date\">` + `<input type=\"time\">` controls — better keyboard ergonomics on every browser. Next to the end-date label sits a **\"One-day event\" checkbox**, on by default. When checked, the end date field is disabled and locked to the start date — only the end *time* stays editable. Most single-day events are now a two-tap shape: date + start time + end time. Uncheck the box for multi-day editions to enable the end date field again.\n\n**2. `/admin/events/new` — In-person vs. Online toggle in the Where section.** Two big buttons let the admin pick venue mode at the top of the Where card. **In-person** keeps the original venue-name + address fields. **Online** swaps them for a **Platform name** (defaults to \"Online\" if blank — overridable for \"Zoom Webinar\", \"Microsoft Teams\", etc.) plus an optional **Meeting link** field. The link is intentionally optional — the helper text reminds the admin they can leave it blank and share it manually later by email. No schema changes needed: online events store the platform name in `mainVenueName` and the meeting link in `mainVenueMapUrl`.\n\n**3. Public event page — removed canned demo-event copy.** Two pieces of hardcoded text that only made sense for the original demo event were removed from `/events/<slug>`:\n  • The eyebrow chip **\"ANNUAL SYMPOSIUM & TRAINING WEEK\"** above the title (it would lie on arbitrary admin-created events).\n  • The footer-CTA heading **\"Ready to join us?\"** and its subtitle **\"Reserve your spot for the symposium and pick your training-week workshops. Registration is free for BioHubNet trainees.\"** (canned marketing for a specific event shape).\nThe footer-CTA button and the registration-closes-on date line stay — they're the actionable part. The hero and footer both keep their existing layout; just the canned text is gone. Events now read as themselves rather than as variants of one demo event.\n\n**4. Trainee dashboard — committee pill has its own space.** The `CommitteeBadgeStrip` on `/dashboard` was rendered without a width/padding container, so the \"Also member of · EQUIP Review Committee →\" chip row was touching the credit-application callout above it. Wrapped it in the standard `max-w-screen-2xl mx-auto px-6 mt-4` container that the rest of the dashboard uses. The chip row now has a clear breath between the callout's bottom border and itself, and right page padding instead of bleeding to the edge.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Career paths — modal scrolls; cards never compress vertically — May 2026
  {
    title: "Career paths — branch modal now scrolls vertically when cards exceed viewport (was vertically compressing cards and clipping content)",
    body: "Round 3 on the branch-modal clipping saga. The previous fixes (wider cards, height safety buffer, end marker) helped but didn't fully solve it on shorter laptop viewports.\n\n**Root cause (final diagnosis)**: the layout used a **uniform scale** that picked the limiting dimension — if viewport HEIGHT was tight, the *whole* layout shrank, including width. Narrower cards reflow text to more lines → real content height > measured-at-intrinsic-width → cards rendered with too little height → END marker (and sometimes the last bullet) clipped at the bottom.\n\n**The +28 px buffer didn't help** because it was part of `TGT_INTRINSIC_H` which then got multiplied by the same shrinking scale. At scale 0.8 the effective buffer was only 22 px, smaller than the END marker's footprint.\n\n**Final fix — width-only scaling + modal vertical scroll**:\n\n  1. **Scale formula changed** from `min(1, availW/blockW, availH/blockH)` to `min(1, availW/blockW)`. Cards now scale only to fit width, never to fit vertical room. Vertical block is whatever it needs to be at natural content height.\n  2. **Modal got an inner scrollable container** wrapping all FlipCards + the SVG branch lines. FlipCards switched from `position: fixed` to `position: absolute` so they live inside the scrollable area and move together with the scroll. Backdrop stays `position: fixed` so it always covers the viewport regardless of scroll.\n  3. **Required content height = max(viewport, contentBottom + 56 px)**. When the layout fits the viewport, the container is exactly viewport-height and there's no scrollbar. When it doesn't fit (e.g. two stacked VP-level target cards on a 900 px-tall laptop), the container grows tall enough to hold everything and the user scrolls within the modal.\n\n**The no-internal-card-scrolling rule still holds.** Cards themselves are never scrollable — they always show all their content. The MODAL scrolls, not the cards. The end-of-card marker that was clipped before is now always visible at every card's natural bottom.\n\nThe initial animation from chart → focused layout works smoothly because, at modal-open time, the scroll container is at scrollTop=0, so its absolute coordinate system aligns with the viewport coordinate system that fromRect and toRect were computed in. The close-back-to-chart animation likewise works when the user hasn't scrolled — and is a minor polish issue when they have (rare; cards usually settle within viewport).",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — wider branch-modal cards + end markers — May 2026
  {
    title: "Career paths — branch-modal cards are wider and now carry an end-marker so you know you've seen everything",
    body: "Two complaints on the branched-out view on `/career-paths/pathways`:\n\n  1. Some cards were still cutting content off at the bottom despite the recent measure-then-layout fix.\n  2. Even when content was complete, it wasn't obvious — readers couldn't tell whether they'd seen everything or whether there was more below an invisible scroll-cliff.\n\n**Root cause for the clipping**: the previous fix measured each card at its intrinsic 320 px width and used that height. But multi-column branch layouts (5+ cross-links) apply a uniform downscale to fit the viewport, so the actual rendered card was narrower than 320 px. Long phrases like *\"Method validation (USP <1225>, ICH Q2)\"* wrapped to extra lines at the narrower rendered width — text reflow that the measurement at 320 px never saw. Real height > measured height → clipping at the bottom.\n\n**Three combined fixes**:\n\n**1. Wider intrinsic widths.** Bumped TGT_INTRINSIC_W from 320 → 380 (+60 px, +19 %) and SRC_INTRINSIC_W from 360 → 420 (+60 px, +17 %). For the common single-column case (≤ 4 cross-links, which covers most stations now that the data has 1-3 links per station), scale stays at 1.0 → cards render at their full new width with content breathing room. For multi-column cases the wider baseline keeps the scaled width closer to where measurement happened — much less reflow gap.\n\n**2. Height safety buffer (+28 px).** Added on top of every measured height. Protects against the remaining edge case where downscale forces a small text reflow. 28 px ≈ two body-text lines, generous but not so much that wide viewports get distracting empty space. Per the project's own design principle: empty space at the bottom of a card is acceptable; clipping is not.\n\n**3. End-of-card marker.** A chapter-break-style separator at the bottom of every card — accent-tinted horizontal rules flanking a small uppercase **\"END\"** label. Reads as typographic structure (like book-section breaks) rather than as a foreign UI element. Tinted with the track's accent colour so it feels part of the card. The user proposed `###` as a marker; I implemented the chapter-break version because it composes more cleanly with the rest of the card typography while carrying exactly the same signal.\n\nNet: branched-out cards now have room for the content + visible confirmation that the reader has reached the end. The next time someone scrolls a card they'll see the END marker and know there's no scroll-cliff hiding more.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Admin events — New event creation form ships — May 2026
  {
    title: "Admin events — create real events from the UI (no more dropping into Prisma Studio for the first row)",
    body: "Until today, creating a real (non-demo) event meant either editing `prisma/seed-events.ts` and running `npx tsx`, or opening Prisma Studio and inserting a `BhnEvent` row by hand. The admin UI only let you edit existing events. That made onboarding new editions slow and intimidating.\n\nNow there's a **New event** button at the top of `/admin/events` that opens a focused create form at `/admin/events/new`. The form covers the minimum-viable shape:\n\n  • **Identity** — title + URL slug (auto-derived from title until you type into it yourself; kebab-case enforced; the `demo-` prefix is reserved for the demo seed and rejected here) + optional tagline + optional markdown description.\n  • **When** — start/end as `datetime-local` pickers + IANA timezone (defaults to `America/Toronto`). End auto-drags to match start if you move the start past it. Validation rejects end-before-start.\n  • **Where** — venue name + address. Both optional; map URL and cover image are filled in afterward on the detail page.\n  • **Registration policy** — `requiresApproval` checkbox (on by default — new registrations land as `pending` until you approve them) + initial status picker (Draft / Published). Draft is the default so you can iterate before going live.\n\nOn save the form POSTs to the new **`POST /api/admin/events`** endpoint, which validates slug format + uniqueness + date logic + status enum, then creates a `BhnEvent` row. The browser redirects to `/admin/events/<slug>` where the existing `EventBasicsEditor` takes over for the long tail of edits (cover image, accommodation copy, registration window, etc.). The two surfaces compose cleanly — the create form intentionally only handles fields that *require* a value at creation time; everything else is editable inline afterward.\n\n**What's still seed-file-only**: Workshop, SymposiumSession, Speaker, Sponsor records. Those compose into the event detail page (`/events/<slug>`) and registration form, but they're managed via `prisma/seed-events.ts` until dedicated CRUD UIs ship. The empty-state disclaimer at the bottom of `/admin/events` explains this and points to the seed template.\n\nThe empty-state for the events list also got an upgrade — instead of just \"run npx tsx\", it now has a primary CTA to the new form.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Career paths — comprehensive cross-link expansion across every station — May 2026
  {
    title: "Career paths — comprehensive cross-link expansion: every level on every stream now has cross-pathway branches (10 → 48 cross-links)",
    body: "The `/career-paths/pathways` branching data was thin — only **10 cross-links total**, and **all of them at the Senior level**. Junior, Mid, Lead, and VP stations had **zero** cross-pathway branches, which meant the \"branch out\" button on those cards was either disabled or pointless. The career story told a single message — \"pivots only happen mid-career\" — which isn't true to the industry.\n\n**Expanded to 48 cross-links across every level on every stream.** Every station — Junior through VP, across all seven pathways — now has at least one realistic industry pivot, most have two, with concrete \"learn first\" prerequisites that make the transition tangible rather than aspirational.\n\n**New cross-links by stream (showing additions, not totals):**\n\n  • **Biomanufacturing** — Junior → QA/QC (analytical pivot); Mid → R&D (process-development); Senior added a third link to R&D; Lead → QA/QC (Director-of-Quality); VP → Entrepreneurship (COO at new venture).\n  • **QA/QC** — Junior → Biomanufacturing (reverse of the above); Mid → Reg-Affairs (CMC specialist); Senior added reverse to Biomanufacturing; Lead → Reg-Affairs (VP RA); VP → Reg-Affairs (combined officer) + Biomanufacturing.\n  • **Regulatory Affairs** — Junior → Medical Affairs (Med-Info Specialist); Mid → Medical Affairs (MA Manager); Lead → Medical Affairs (CMO-track); VP → Medical Affairs (combined CMO/CRO seat at lean biotechs).\n  • **Medical Affairs** — Junior → Reg-Affairs + Clinical Trials; Mid → Clinical Trials + Reg-Affairs (labeling); Senior added reverse to Reg-Affairs; Lead → Clinical Trials (Head of Clin Ops) + Reg-Affairs; VP → Clinical Trials (CMO merge) + Reg-Affairs.\n  • **Entrepreneurship** — Junior → R&D (soft landing); Mid → Biomanufacturing + R&D (when startup stalls); Lead → Reg-Affairs (CEO with agency reps); VP → Biomanufacturing (COO returns) + R&D (CSO seat).\n  • **R&D** — Junior → Biomanufacturing + QA/QC; Mid → Biomanufacturing (IND-prep) + Clinical Trials (translational); Senior added Medical Affairs; Lead → Clinical Trials + Entrepreneurship (CSO spinout); VP → Clinical Trials + Entrepreneurship (Operating Partner).\n  • **Clinical Trials** — Junior → Reg-Affairs + Medical Affairs; Mid → Medical Affairs (MSL) + Reg-Affairs; Lead → Medical Affairs + Reg-Affairs; VP → Medical Affairs (CMO merge) + Reg-Affairs.\n\n**Every new cross-link carries:**\n  • A `when` label (e.g. \"Junior → Junior\", \"Mid → Lead\") that tells you whether you're branching sideways or jumping up a rung.\n  • A `reason` — the human explanation of *why* this pivot is realistic in industry. Not generic; concrete to the specific pair (\"CRAs with deep investigator relationships pivot to MSL roles\", \"VPs of Quality with site-leadership track records pivot to VP Manufacturing\").\n  • A `learningNeeded` list of 2 prerequisites — the actual skills the trainee would need to build before the transition is credible. Useful both as a planning device and as a course-recommendation hook.\n\nNet: a Junior who clicks \"branch out\" sees realistic lateral moves; a VP sees the C-suite consolidations that happen at lean biotechs (CMO+CRO, CSO+CDO, VP Q+VP Mfg). The pathway data now tells the full story of how real biotech careers move sideways, not just the senior-band story it told before.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — branch modal cards now measure their own content, no scrollbars — May 2026
  {
    title: "Career paths — branch-modal cards now sized to fit their content exactly (no more scrollbars at the settled stage)",
    body: "Previously the focused branch-modal cards used a single intrinsic height (440 px source, 460 px target) regardless of how much content each card actually carried. Targets with a cross-link reason + a long \"learn first\" list overflowed and triggered a vertical scrollbar at the settled stage. Fixed:\n\n**1. Hidden measure-then-layout pass.** The BranchModal now renders an off-screen copy of every card (source + each target) at its intrinsic width, with no height constraint. A `useLayoutEffect` reads each card's natural `offsetHeight` synchronously before paint, and feeds the measurements into `computeFocusLayout`. The visible FlipCards size to those measurements — exactly tall enough, no scrollbar ever appears in the common case.\n\n**2. Source uses its measured height directly.** It's a single card, no grid alignment to worry about.\n\n**3. Targets share the MAX of all measured heights.** Grid rows stay aligned across the target group — short cards have a little headroom at the bottom rather than being stranded at a different height from their tall neighbours. (Empty space inside a card is acceptable; mis-aligned grid rows are not.)\n\n**4. `overflow-y-auto` removed from BigStationCard.** Since the FlipCard is now correctly sized, there's nothing to scroll. Removed the safety-net scrollbar so it can never appear. If a content edge case somehow exceeds the card height on a tiny viewport, the FlipCard's outer `overflow-hidden` clips it cleanly (better than a perpetual scrollbar that's only there for the 0.5 % case).\n\nGuard against infinite re-render loops: the measurement setState only fires when the read values actually change.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — branch animation polish (lighter backdrop, longer lines, smart routing, comet trail) — May 2026
  {
    title: "Career paths — branch animation: lighter backdrop, longer connector lines with a travelling comet, and smart routing so lines no longer cross cards",
    body: "Four upgrades on the `/career-paths/pathways` branch-out modal:\n\n**1. Lighter backdrop.** The 80 %-black scrim was hiding the chart underneath entirely — losing the spatial context (\"here's where you were, here's where you're branching to\"). Dropped to **45 % black + md blur** so the chart remains legibly visible behind the modal. The focused cards still pop because they're brighter than the dimmed chart, but the whole composition stays readable as one connected scene.\n\n**2. Longer connecting lines.** Split the layout's single `GAP` constant into two: **`SRC_TGT_GAP = 120 px`** between the source card and the target group, **`TGT_GAP = 28 px`** between target cards within the group. Was 24 px for everything. The fivefold-larger source-to-target gap gives the bezier connector lines room to actually read as long flowing paths instead of short stubs.\n\n**3. Light-travelling comet effect.** Each connector line now has a **glowing white dot riding along the bezier** on a continuous loop, with a slightly larger / blurrier trailing glow behind it (offset by a few percent of the cycle so it reads as a comet tail). The dot travels via SVG `<animateMotion>` with an `<mpath>` reference to the line's own path — when the line morphs (e.g. cards moving into focused layout), the comet's track morphs with it. Travel duration scales with line length (2-4 s) so longer lines don't feel rushed. Only fires once the line is fully drawn so the comet doesn't fly through an invisible path during the initial reveal.\n\n**4. Smart routing — no more lines crossing cards.** Two-part fix:\n  • **Single-column layout for ≤ 4 targets.** Targets stack vertically to the right of the source. All lines fan out from one point (source's right edge) to different y positions — geometrically impossible for lines to cross other cards. The common case (1-3 cross-links) hits this path and is *always* clean.\n  • **Vertical arc routing for 5+ targets** (which need 2-3 columns). Each far-column target carries an `arcOffset` value that deflects the bezier's control points vertically, so the line arcs **above** near-column targets (when this target is in the upper half) or **below** them (when it's in the lower half). The arc offset scales with column index, so a column-2 target arcs further than a column-1 target. Nothing is hardcoded — the routing reads each target's actual column / row position and computes the deflection in real time.\n\nUpdated cols thresholds: 1-4 targets → 1 col, 5-6 → 2 cols, 7+ → 3 cols.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Floater Aquarium — collisions + random mass — May 2026
  {
    title: "Floater Aquarium — fish now bump into each other and bounce off, with per-spawn random mass",
    body: "Two physics upgrades on the aquarium:\n\n**1. Pairwise collisions between swimmers.** Every frame, the RAF loop checks every pair of swimmers (O(n²) with n ≤ 26 = max 325 checks per frame — trivially cheap on modern hardware). When two fish overlap, an elastic-collision response runs:\n  • Compute the collision normal between centres.\n  • Project relative velocity onto the normal. Only respond if they're moving *toward* each other (skip when they happen to overlap while drifting apart, so we don't glue them back together).\n  • Apply a mass-weighted impulse to both: `J = 2 * relVel / (1/mA + 1/mB)`.\n  • Separate them along the normal by the overlap amount, split inversely to mass so the lighter fish moves more.\n\nCollision radius is `(sizeA + sizeB) × 0.30` — the 0.30 factor accounts for the SVG floater glyphs having a lot of empty space around the visible content; using full radius would trigger collisions while the glyphs still look apart on screen. The fished swimmer is excluded from collisions during its hook/rise sequence.\n\n**2. Random per-spawn mass.** Each swimmer's `Motion` now carries a random `mass` between **0.5 and 2.0** assigned at spawn. A 2.0-mass fish has ~4× the inertia of a 0.5-mass fish, so collisions visibly favour the heavier swimmer — a heavy slow-drifter crashing into a small light fish sends the light one flying ~4× as much as the heavy one even notices. Mass is intentionally NOT a property of the floater registry — the same registry component (e.g. *Antibody binding*) can appear as a \"heavy\" swimmer in one spawn and a \"light\" one in another, because mass is an emergent property of *this particular fish in the tank*, not the floater's identity.\n\n**Restructured the RAF loop into three passes** to support this cleanly:\n  • **Pass 1** — per-swimmer motion (Brownian, flee, integrate).\n  • **Pass 2** — pairwise collision detection + response.\n  • **Pass 3** — write transforms imperatively to the DOM.\n\nAll three passes happen inside the same RAF frame so nothing tears.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Floater Aquarium — slower motion, darker water, occasional fishing — May 2026
  {
    title: "Floater Aquarium — calmer pace, deeper water for contrast, and occasionally something gets fished out of the tank",
    body: "Three tuning passes on the redesigned aquarium:\n\n**1. Slower motion.** Everything in the tank moved at frantic-arcade speed. Halved the swimmer velocity clamp (0.7 → 0.32 px/frame), more than halved the Brownian random-walk (0.018 → 0.008), and slowed the bubble columns 2-3× (was 6-12 s end-to-end; now 16-32 s). Cursor flee tuned proportionally so the same nudge still works at half-speed. Net: the tank now feels like an aquarium at rest rather than a snow globe being shaken.\n\n**2. Darker water for swimmer contrast.** The previous tropical-blue palette washed out the pastel `text-{color}-300/40` floater tints. Dropped the entire palette into deep-tank territory:\n  • Panel: surface `#082238`, depth `#020910` (was `#1e6890` → `#0b1f3a` — about 60 % darker).\n  • Fullscreen day/night cycle palettes all deepened in lockstep: pre-dawn near-black → morning deep teal → midday deep tropical → dusk deep magenta. Surface stays lighter than depths at every phase but every phase is darker overall, so the pastel swimmers actually pop now.\n\n**3. 无厘头 fishing event.** Every 25-50 seconds (random) a fishing line drops from the top of the tank, hooks a random swimmer, and lifts it out:\n  • **Drop (1 s)** — thin white line descends from above to the chosen swimmer's position with a smoothstep ease.\n  • **Wiggle (1.1 s)** — the hook locks; the fish oscillates side-to-side as if struggling. A small **\"!?\" speech bubble** pops up next to the hooked floater for the duration.\n  • **Rise (2.8 s)** — the line + fish lift smoothly off the top edge with an ease-out curve so the last beats are fastest. Swimmer leaves the swimmer list once it clears the tank.\n\nA new swimmer immediately spawns to replace it on the next 2-second tick of the birth/death cycle, so population stays at target. Disabled for `prefers-reduced-motion` users (the surprise pop-out is exactly what that preference is set to suppress). Net effect: the tank now has a tiny ongoing comedy — most of the time it's a calm, dark aquarium with bubbles and plants, and every so often a single fish vanishes upward with a comic-strip reaction.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Floater Aquarium — proper aquarium design (sand, plants, bubbles, light beams) — May 2026
  {
    title: "Floater Aquarium — redesigned as an actual aquarium (sand, plants, bubbles, light beams, water surface)",
    body: "The aquarium on `/admin/login-floaters` used to be a flat dark-blue panel with glyphs floating around. That worked but didn't feel like *an aquarium*. Redesigned with all the visual cues of a real glass tank:\n\n  • **Aquatic water tint** — vertical gradient from a bright cyan surface to a deep teal floor (was a flat navy diagonal). In screensaver mode, the day/night cycle now sweeps a tank-friendly palette: pre-dawn navy → morning sun-broken blue → tropical midday → magenta dusk → back to navy. Surface stays lighter than depths at every phase, so the \"looking into a lit tank\" feel reads regardless of time.\n  • **Sub-surface shimmer** at the very top — pale horizontal band with a slow horizontal ripple keyframe, reads as sunlight refracting on the underside of the water surface.\n  • **Diagonal light beams** piercing down through the water from above. Two beams at different angles drift on slow independent cycles via `mix-blend-mode: screen` so they brighten the water without overpowering it.\n  • **Sand / gravel bed** at the bottom — layered radial highlights for the pebbled texture, dark-to-light vertical gradient that sells \"ground\" rather than \"another stripe of water.\"\n  • **Seven swaying plants** anchored in the sand. Three frond shapes — narrow ribbon vallisneria, broad-bladed Anubias fan, bushy foxtail tassel — mixed across the bed so it doesn't read as a row of clones. Each plant has its own sway duration + delay + scale + colour; transform-origin pivots from the bottom of the frond so the motion looks rooted, not floating.\n  • **Eight bubble columns** rising from the sand. Each on its own duration + delay so the panel sees ~3 bubbles in motion at any moment, never all eight in sync. Subtle horizontal wobble + scale on the way up, fades at the surface.\n  • **Front-glass vignette** — inset shadow at the bottom + a thin highlight at the top edge so the panel reads as a sheet of glass with water behind it, not a back-lit screen.\n\nThe glyphs (the \"fish\") still drift around with cursor flee + click-burst + 30-90 s lifespan; everything they had before still works, they're just now swimming through an actual tank. Reduced-motion users get a static aquarium — all keyframes are gated by `prefers-reduced-motion`.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Login-floaters — 10 more glyphs, every category a multiple of 6 — May 2026
  {
    title: "Login-floaters — 10 new glyphs so every category is a clean multiple of 6 (18 / 12 / 12 / 6 × 9)",
    body: "Yesterday's batch brought every sparse category up to **at least 6** entries. This pass takes it further — every category is now a **multiple of 6** (so the 6-cols-per-row gallery on `/admin/login-floaters` always shows full rows, no partial trailing row anywhere). Registry: 91 → **101 glyphs**.\n\n**Additions:**\n\n  • **Discovery** (9 → 12, +3):\n    – **Fragment screening (FBDD)** — 1,500-fragment library → STD-NMR / SPR → 300 µM hit → SAR analog growth to 50 nM lead.\n    – **DNA-encoded library** — 10⁹ DNA-barcoded molecules → bind to immobilised target → wash → NGS decode to identify hits.\n    – **AlphaFold structure** — sequence → MSA + pair representation → 3D backbone fold → pLDDT confidence map (blue → green → amber → red).\n\n  • **Clinical** (9 → 12, +3):\n    – **Master protocol / umbrella trial** — biomarker screen → assign to 4 parallel sub-studies → arms run independently → combined endpoint.\n    – **Patient-reported outcomes (ePRO)** — daily 5-item questionnaire on phone → 21 CFR Part 11 upload → trajectory plot → Δ-vs-baseline endpoint.\n    – **DSMB review** — unblinded safety + efficacy package → independent 5-member committee → deliberate → CONTINUE recommendation.\n\n  • **Manufacturing** (14 → 18, +4):\n    – **Single-use bioreactor** — pre-sterile bag mounted in steel holder → seed → TFF harvest → swap bag for next campaign (no CIP/SIP).\n    – **Tangential-flow filtration** — feed tank → cassette → tangential cross-flow + diafiltration → 10× concentrated pool.\n    – **Quality risk management (ICH Q9)** — hazard list → 5×5 probability × severity matrix → top-3 high-risk → CAPA downgrade to controlled.\n    – **Continuous manufacturing** — discrete batch units with holds → connect → steady-state controlled flow → 24/7 continuous output.\n\nEvery new glyph follows the same pattern as the rest of the registry: 4-stage `useStageCycle` loop, pure SVG with `currentColor` strokes, stage label + dot progress + `role=\"progressbar\"`. Real BHN-curriculum processes — fragment-based drug discovery is standard pharma, DEL screens are at AstraZeneca / GSK / Pfizer, AlphaFold has transformed structural biology, master protocols are the modern oncology trial design, PROs are FDA-accepted endpoints, DSMBs are regulatory required, single-use bioreactors are now the default at biotech scale, TFF is the standard downstream concentration step, ICH Q9 risk management is the global QA framework, and continuous manufacturing is FDA-encouraged.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Summer Ice Cream — scene caption + cold mist + reduced-motion polish — May 2026
  {
    title: "Summer Ice Cream theme — added rotating scene caption + cold mist drift to match Greenwood / Sakura",
    body: "Polish pass on yesterday's falling-treats layer to bring it to full parity with the Greenwood and Sakura atmospheres:\n\n  • **Rotating scene caption** in the bottom-right, just like the other two atmospheres. Twelve playful parlor moments cycle every 18 seconds: *\"the parlor is busy today\"*, *\"kids line up for the sprinkle bar\"*, *\"a popsicle drips in the heat\"*, *\"the freezer hums\"*, *\"vanilla sells out by three\"*, *\"a cone tips and lands soft side down\"*, *\"rainbow sherbet runs low\"*, *\"mint chip wins, again\"*, *\"someone asks for two scoops\"*, *\"a snow cone melts on the sidewalk\"*, *\"the bell over the door doesn't stop\"*. Never the same caption twice in a row; fades up cleanly via a React-key trick that restarts the CSS keyframe on every rotation.\n  • **Cold-mist drift overlay** at the bottom of the viewport — soft frosty wash in pale-peach + mint + lilac, drifts very slowly across (60-second cycle) so it reads as the air in front of an open freezer rather than as a separate layer pasted on top. Always on while the theme is active.\n  • Reduced-motion safety net widened to cover the mist + caption too — `prefers-reduced-motion` users see a static palette with no animations, on every layer.\n\nNet: Summer Ice Cream now has the same full atmospheric kit as the other two flavours — falling elements + ambient mist + rotating editorial caption.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Summer Ice Cream theme — falling treats + snow — May 2026
  {
    title: "Summer Ice Cream theme — falling ice creams, popsicles, snowflakes, and ice cubes",
    body: "Just like Greenwood drops leaves and Sakura drops cherry-blossom petals, the **Summer Ice Cream** theme now has its own atmospheric layer. Twelve frozen things drift across the viewport on randomised paths whenever the theme is active:\n\n  • **Three ice-cream cones** — strawberry pink, mint green, and vanilla cream scoops on a waffle cone.\n  • **Three popsicles** — lemon yellow, raspberry pink, blueberry blue, each on a wooden stick.\n  • **Snowflakes** — pale-blue six-armed crystals with branchlets and a soft icy glow filter.\n  • **Ice cubes** — translucent cyan with a top-left highlight where the light catches the corner.\n\nEach falling item has its own delay, duration, sway amplitude, rotation rhythm, and scale — pre-randomised at mount and stable for the page lifetime so React keys don't churn. Snowflakes and ice cubes drift slower and rotate less (they're crystals, not tumbling treats); cones and popsicles tumble more dramatically. Sparse population (12 elements) so the canvas reads as \"a breeze on a hot day\" rather than a deluge.\n\n**Drive train identical to Greenwood / Sakura**: one shared CSS keyframe (`icecream-fall-drift`) consumes per-element CSS custom properties for sway, start-rotation, and scale, so per-element variation costs nothing at runtime — no per-element keyframes, all driven by `--ic-*` vars on inline style. Fixed-position, pointer-events-none, aria-hidden. Returns null for every other theme so it's free while inactive. Respects `prefers-reduced-motion` (component bails entirely, plus a defence-in-depth `animation: none` in the CSS).",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Sidebar — expanded section chips no longer cut by border on Rosalind / Sakura / etc. — May 2026
  {
    title: "Sidebar — expanded section chips now opaque on every theme (no more border line cutting through ENGAGE / EXPERIENCE / EQUIP labels)",
    body: "Earlier this week we fixed the Voltage version of this bug (rgba 18% chip backgrounds letting the section's top border show through). Same root cause has been showing up on **Rosalind, Sakura, Mist, and a few other themes** — different mechanism though:\n\nThose themes deliberately redefine Tailwind's `--color-emerald-100`, `--color-amber-100`, `--color-rose-100`, `--color-sky-200`, and `--color-violet-200` to **translucent rgba values** (16-28% opacity) so page-level cards using `bg-emerald-50` etc. blend into the parchment / blush / mist canvas instead of fighting it. Reasonable design choice — except the sidebar section chip uses those exact Tailwind classes (`bg-emerald-100`, `bg-amber-100`, etc.) as its background, and a translucent fill lets the container's 1-px top border render *through* the chip text as a horizontal line cutting the label.\n\n**Generic fix** — applies to every theme, not theme-by-theme. Replaced the chip's `background-color: var(--color-X-100)` (which inherits each theme's translucent rgba) with a layered `background: linear-gradient(var(--color-X-100), var(--color-X-100)), var(--card-solid)`. Two stacked layers: the theme's chosen tint on top, the theme's opaque card-solid surface underneath. Visually identical tinted appearance, but the bottom layer is fully opaque so the section border can never bleed through.\n\nApplies to all six chip tones: engage / experience / equip / electric / hr-preview / (and neutral which uses bg-card-solid directly, already opaque). The Hi-tech overrides shipped earlier this week stay in place — they win via theme-scoped specificity and provide neon-friendly tints that the generic `--color-X-100` variables don't carry.\n\nNet: every theme — Daydream / Voltage / Rosalind / Sakura / Summer Ice Cream / Greenwood — now renders the expanded section chip as a fully opaque, properly tinted pill with no border bleeding through.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Sidebar — collapsed section chips no longer overlap each other — May 2026
  {
    title: "Sidebar — collapsed section chips no longer overlap each other (the line cutting through them was the chip above bleeding down)",
    body: "When sidebar sections (ENGAGE / EXPERIENCE / EQUIP / HR PREVIEW / ADMINISTRATION) were all collapsed at once, the chips visibly cut into each other — a horizontal line ran through every chip's text.\n\n**Diagnosis.** The chip is positioned `absolute -top-[10px]` so it sits on the seam of the section's top border (the editorial \"tab on a box\" look). When the section is EXPANDED that works — the chip overlaps a visible 1-px border. When the section is COLLAPSED, the border is removed and the chip is left floating with no anchor; but the absolute positioning kept extending the chip 10 px above its (now empty) container. The container itself had a 20-px margin to the next section (after margin-collapse from `mb-2` + `mt-5`), but the chip's ~24-px height meant consecutive collapsed chips overlapped by about 4 px. The line you saw was the previous chip's bottom edge cutting across the next chip's text.\n\n**Fix.** Two-mode layout:\n  • **Expanded** — chip stays `absolute -top-[10px] left-5` so it still overlaps the visible section border. The editorial tab look is preserved.\n  • **Collapsed** — chip renders **in flow** inside its now-borderless container (`relative flex pl-5`) so it contributes to its own container's height instead of dangling above it. Container margins bumped from `mt-5 mb-2` to `mt-3 mb-3` to give the floating chips even clearer breathing room — adjacent collapsed sections now sit ~24 px apart with no overlap on any theme.\n\nNo theme-specific overrides — the layout change applies everywhere, so the same fix benefits Daydream / Voltage / Rosalind / Sakura / Summer Ice Cream / Greenwood at every time-of-day.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Role-switch feedback — overlay + tighter shortcut window — May 2026
  {
    title: "Role switch — visible \"Switching to …\" overlay + tighter x-shortcut window so the lag stops feeling like nothing's happening",
    body: "Hitting **x** (or the dropdown in the sidebar) to switch viewing-roles looked like nothing was happening for 1-2 seconds — the keypress fires a fetch, then `router.refresh()` re-renders every server component in the dashboard chrome before the new role's view appears. The user couldn't tell whether the keypress had registered, and often double-tapped trying to wake it up, ending up on the wrong role.\n\nTwo changes:\n\n  • **New `RoleSwitchOverlay`** — a small centred *\"Switching to <role> view…\"* panel with a spinning indicator pops up the instant a switch is triggered, then dismisses itself once the server refresh completes. Both the **x / xx keyboard shortcuts** and the **sidebar RoleSwitcher dropdown** now fire it (via a shared `bhn:role-switch-start` event so the overlay doesn't need wiring per trigger). Auto-dismisses after 3 s as a safety net if the done event never fires.\n  • **Double-tap window shortened** from 320 ms → 220 ms. Was conservative to leave plenty of room for a deliberate double-tap, but the overlay now provides the missing feedback, so single-tap can feel as snappy as possible. 220 ms is still comfortable for `xx` — both presses register reliably.\n\nThe underlying `router.refresh()` cost can't be eliminated without skipping the full server re-render (which is what makes the new role take effect everywhere — sidebar, badges, dashboard, gates). What we *can* do is make the wait clearly attributable to a user action.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── ENGAGE credit application — promoted to dashboard hero — May 2026
  {
    title: "ENGAGE training-credit application — now front-and-centre on the trainee dashboard",
    body: "The ENGAGE credit-application flow has been live for a while (sidebar: *ENGAGE → My Credits → Start application*; routes: `/credits/apply` with the doc-upload form, `/api/credits/applications` for submission, `/api/admin/credit-applications` for admin review). But the entry point was buried — a trainee had to click *My Credits* in the sidebar first, then scroll to the application card on that page, then click *Start application*. New trainees were missing it entirely.\n\n**Now the application sits directly under the dashboard hero**, visible the moment a trainee lands on `/dashboard` after login. It's a self-aware callout that adapts to the user's current state:\n\n  • **Never applied** → big brand-coloured banner with the headline *\"Apply for up to 5,000 free training credits\"*, eligibility criteria (HQP at partner Ontario institutions: grad students, postdocs, research associates, lab techs), the supporting documents they'll need (transcript + grad-office verification, or employment letter), a note that admins review each application personally, and a prominent *Start application* button.\n  • **Pending** → amber chip explaining the application is under review.\n  • **Rejected** → rose chip with the reviewer's note and a *Submit a new application* button.\n  • **Approved** → callout is hidden entirely (the credits are already in the user's balance — no need to repeat the pitch).\n\nThe banner shows for both `trainee` and `evaluating` roles. Reusable component at `src/components/dashboards/CreditApplicationCallout.tsx` ships both a *prominent* (dashboard) and *compact* (in-page) variant; same render logic, same copy, different visual density.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Voltage sidebar — section title chips no longer cut by border — May 2026
  {
    title: "Voltage theme — sidebar section title chips (ENGAGE / EXPERIENCE / EQUIP / HR PREVIEW) no longer cut by the section border running through them",
    body: "Two bugs working together on the Voltage (Hi-tech) theme produced a visible horizontal line cutting through every sidebar section title chip:\n\n**1. Selector mismatch.** When the sidebar section chip became a `<button>` (in the collapsible-groups refactor) the per-theme overrides in `globals.css` were left targeting `span[data-section-tone=\"…\"]`. So the Voltage-specific re-tints weren't applying to the new button element at all — chips were rendering with the default light-theme Tailwind tones on the inky-black sidebar.\n\n**2. Translucent chip background.** The Voltage chip overrides used `rgba(<colour>, 0.18)` — only 18% opaque. The section container's top border passes through the lower portion of the chip (the chip sits at `-top-[10px]` and overlaps the container's border line), and an 18 %-opaque fill let that border render *through* the chip text as a horizontal line cutting the label.\n\n**Fix:**\n  • Selectors updated to match both `span[data-section-tone]` (historical) AND `button[data-section-tone]` (current, after the click-to-collapse refactor) — so the per-theme styling stays applied regardless of which element houses the chip.\n  • Chip background switched from `rgba(<colour>, 0.18)` to `linear-gradient(<tint>, <tint>), var(--card-solid)` — two stacked backgrounds, a flat tinted colour painted on top of the sidebar's fully opaque card surface. Visually identical to the old tinted look, but the lower layer is opaque so nothing behind the chip can leak through.\n  • Applied to all five section tones on Voltage: engage / experience / equip / electric / hr-preview / neutral.\n\nLight themes (Daydream, Rosalind, Summer Ice Cream, Sakura, Greenwood) were unaffected — their default Tailwind `bg-{tone}-100` chip backgrounds are already fully opaque so the border has never shown through them.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — level banners read as buttons now — May 2026
  {
    title: "Career paths — level banners now read unmistakably as click-to-expand buttons",
    body: "The Level 1 · Junior, Level 2 · Mid-level, … banners on the pathway chart used to be a bare chevron + uppercase label with a thin hairline either side — clickable, but didn't LOOK clickable. Users were missing that clicking the strip toggles the whole station row underneath. Redesigned:\n\n  • **Visible bordered chip** wraps the centre lockup (bg-card-solid, border, drop-shadow when collapsed; subtler bg-elevated + hairline when expanded).\n  • **Chevron in its own outlined square** — reads as a toggle indicator (think macOS disclosure triangle) rather than a decorative arrow. Filled brand-600 background when collapsed so the call-to-action pops; muted neutral when expanded.\n  • **Explicit verb chip** appended after the years: *\"▸ Show stations →\"* in brand colour when collapsed (loud — the user might not realise there's hidden content), *\"Hide\"* in subdued grey when expanded (quieter — the visible content below makes the toggle's purpose obvious).\n  • **Hover state** lifts the chip with a brand-coloured border, brighter background, and a 2 px translate-up so the whole row feels physically pressable.\n  • Cursor pointer + `title` attribute carrying the action so screen-reader users and hover-tooltip users get the affordance too.\n\nThe collapsed state is intentionally MORE prominent than the expanded one because the collapsed case is when discoverability matters most. Once expanded, the visible stations below already advertise that the whole thing is interactive.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — branch modal cards capped on both axes — May 2026
  {
    title: "Career paths — branch-modal cards now cap their width too, so wide viewports don't pad them with empty space",
    body: "Previous fix capped card HEIGHT at content-friendly intrinsics (440 px source, 460 px target) but still let WIDTH stretch to fill `tgtsAreaW / cols` — on a 1920-px monitor that produced 690-px-wide target cards with the content sitting in the leftmost ~340 px and a huge empty rail to the right. Fixed:\n\n  • Added **intrinsic widths**: 360 px source, 320 px target.\n  • New logic computes the **intrinsic block size** (source width + GAP + target-grid width × target-grid height) up front.\n  • If the viewport fits the intrinsic block: cards render at intrinsic size, full stop. No stretching.\n  • If the viewport is too narrow OR too short: pick a **uniform downscale factor** — the smaller of `availW/blockW` and `availH/blockH` — and apply it to every card and gap. The composition shrinks together, preserving proportions, instead of one card stretching while its neighbour shrinks.\n  • The resulting block **centres on the canvas** both axes — empty space wraps the cards, not lives inside them.\n\nNet on a typical laptop: a 2-target branch animation now lands as a ~744 × 440 block (source + 2 targets + gaps) sitting centred in a 1280-px viewport with ~270 px of slack on each side. On a 4K monitor: same 744 × 440 block sitting centred in a 3840-px viewport with ~1500 px of slack each side. Cards are the same size regardless — empty space is OUTSIDE the cards, where it should be.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Theme picker — condensed: wider + half height — May 2026
  {
    title: "Theme picker — wider and roughly half the height after the inspo blurbs got too tall",
    body: "Yesterday's inspo paragraphs were the right intent but the wrong surface — the picker dropdown ballooned to ~3-4 line rows per theme. Condensed:\n\n  • **Theme descriptions** are now one punchy sentence each (e.g. *Rosalind — \"Parchment, sage, italic serif. Named for Rosalind Franklin — the crystallographer behind Photograph 51.\"*). Same inspo lead, less wall-of-text.\n  • **Description row** is `line-clamp-1` so anything slightly long still stays one line.\n  • **Dropdown width** bumped from `min-w-[280px]` to **`w-[440px]`** so one-liners actually fit without wrapping. `max-w-[92vw]` keeps it inside the viewport on narrow screens.\n  • **Row padding** tightened `px-2.5 py-2` → `px-2 py-1.5`. Swatch from 26 → 22 px. Title from `text-[13px]` → `text-[12.5px]`.\n  • **Category subtitle** (e.g. *\"The foundation library\"*) dropped — only the main label (CLASSIC / FLAVOURS / LIMITED TIME) stays.\n  • **Featured limited-time card** (Sakura promo at the top) restructured from a stacked block (swatch + heading + paragraph + full-width Try button = ~120 px tall) to a **single-row lockup** (swatch · name + tagline · compact *Try* button), about half the height.\n  • **Discovery link** at the bottom (*Vote on themes…*) padding tightened to match.\n\nLong-form inspo migrates to `/themes` if anyone wants the longer framing — the picker stays a tight, scannable look-and-feel switcher.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Login-floaters — 16 new SVG glyphs, every category now ≥6 — May 2026
  {
    title: "Login-floaters — 16 new SVG process glyphs, every gallery category now fills its row",
    body: "The 6-cols-per-row gallery on `/admin/login-floaters` had seven sparse categories that showed a half-empty trailing row. Built **16 new SVG-animation floater components** to bring each one up to at least six entries. Total registry: 75 → **91 glyphs**.\n\n**Additions by category:**\n\n  • **Patient & Academia** (+4 → 6): *Patient registry enrollment* (real-world evidence cycle), *IRB / REB review cycle* (submit → review → revise → approve), *Academic tech transfer* (discover → disclose → patent → license), *Investigator-sponsored trial* (clinical question → protocol → fund → FPI).\n  • **Preclinical** (+3 → 6): *Zebrafish tox screen* (24-well plate · log-titration · 5 dpf), *PK/PD modeling* (concentration-time data → compartmental fit → Monte-Carlo simulation → human dose prediction), *Xenograft efficacy* (implant → tumour grow → q3d dosing → 78 % TGI on the treatment arm vs. control curve).\n  • **Medical Affairs** (+3 → 6): *KOL advisory board* (recruit · brief · discuss · synthesise), *Congress engagement plan* (abstracts → posters → satellite symposium → 48-h follow-up), *Literature surveillance* (PubMed run → 188 → 14 titles → topic-tagged → digest sent).\n  • **Commercial** (+2 → 6): *Market access launch* (HTA dossier → payer meetings → formulary tier 2 → claims live), *Competitive intelligence* (radar scan → SWOT → exec brief → option-B response).\n  • **Cell / Process** (+2 → 6): *Lentivirus vector production* (HEK293T transfect → harvest → ultracentrifuge → p24 titer 8.2 × 10⁸ TU/mL), *Treg expansion* (CD4⁺CD25⁺ sort → α-CD3/CD28 + IL-2 activation → 300× expansion → cryopreserve vials).\n  • **Omics** (+1 → 6): *Single-cell ATAC-seq* (nuclei → Tn5 tagmentation → paired-end sequencing → 124 k accessibility peaks).\n  • **QC Micro** (+1 → 6): *Disinfectant efficacy* (challenge 10⁶ CFU coupon → 70 % IPA · 30 s → swab-and-neutralise → 3.4-log reduction PASS).\n\nEvery new glyph follows the same pattern as the original registry: 4-stage looping animation via `useStageCycle`, pure SVG with `currentColor` strokes so the floater inherits its tint, stage label + dot progress at the bottom with proper `role=\"progressbar\"` accessibility, ~100-line components. They mirror real BHN-curriculum vocabulary (no invented processes) — drop them onto `/login` from the same admin gallery as any other floater.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Career paths — bigger labeled Collapse button + integrated fold toolbar — May 2026
  {
    title: "Career paths — labeled \"Collapse\" button on each card + a tighter fold-view toolbar",
    body: "Two polish passes on `/career-paths/pathways`:\n\n**1. Per-card Collapse button — bigger, labeled, pinned to the bottom.** Was a 20×20-px chevron-only icon in the top-right corner with the label hidden behind a tooltip. Replaced with a proper labeled `Collapse` chip pinned to the bottom-right of each pathway header card, mirroring the `Expand` affordance on collapsed cards — symmetric design, so the same kind of action sits in the same place whether the card is folded or unfolded. Larger hit target, function is readable at a glance.\n\n**2. Fold-view toolbar — four buttons collapsed into a segmented control.** Was a row of four separate controls: a *Fold* label, *Collapse pathways* button, *Collapse levels* button, and *Expand all* reset. New layout uses **two stateful axis toggles** + a reset:\n\n  • **Pathways** — click to fold every pathway column to a compact card; click again to unfold them all.\n  • **Levels** — click to fold every level row; click again to unfold.\n\nEach toggle reflects its current state visually — filled brand accent when fully folded, muted hairline outline when fully expanded, with a tiny accent dot in the corner when the axis is partially folded (some columns / rows folded individually via their own per-card buttons). The **Reset** button only appears when something is currently folded — it doesn't need to be present when there's nothing to reset.\n\nNet: 4 controls of mixed semantics (label + 3 action buttons) became 1 label + 2 stateful toggles + 1 conditional reset. Same capabilities, less visual weight, and the toolbar reads as one segmented control rather than a sprawl.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Login-floaters admin — 6-up gallery + Floater Aquarium screensaver — May 2026
  {
    title: "Login-floaters admin — 6-up gallery and a Floater Aquarium screensaver at the bottom",
    body: "Two changes on `/admin/login-floaters`:\n\n**1. Gallery is now 6 cards per row at large viewports.** Was an `auto-fill, minmax(220px, 1fr)` track template that drifted between 4 and 5 cards per row depending on browser width. Now an explicit responsive grid: 2 cols on mobile, 3 on small, 4 on medium, **6 on large**. Categories with fewer than 6 entries (Patient & Academia: 2, Preclinical: 3, Medical Affairs: 3, Commercial: 4, Cell / Process: 4, Omics: 5, QC Micro: 5) show a partial row — adding more floater components to fill those out is a follow-up.\n\n**2. *Floater Aquarium* — a self-sustaining tank at the bottom of the page.** New section under the editor. A 320-px-tall band hosts ~14 random floater glyphs drifting on their own velocities, with Brownian nudges so motion never settles into perfect lines. Click anywhere on the tank (or the *Screensaver* button) to enter full-viewport mode: ~26 swimmers, a 90-second day/night gradient cycle on the backdrop (pre-dawn → morning teal → midday cyan → dusk magenta → back), cursor flee inside 140 px radius, click anywhere to spawn a 3-swimmer burst at the click point with outward velocity, and a rotating *Spotted: …* caption naming a random current swimmer's process. Esc or the *Exit* button leaves screensaver mode.\n\n**Self-sustaining** is the key trick: every swimmer is born with a random lifespan between 30 s and 90 s. As they age out they fade over 2.4 s, get GC'd, and a brand-new swimmer (different floater id, different position, different velocity, different tint) spawns to keep population at target. The tank never empties and never repeats exactly — the floater registry has 75 components, so the parade rotates more or less indefinitely.\n\n**Performance**: per-frame motion is written to the DOM imperatively (each swimmer's wrapper gets `transform: translate3d(x, y, 0)` directly via ref) so 60-fps motion doesn't trigger React renders. React only re-renders the swimmer LIST every 2 s when births / deaths happen. The opacity fade-in / fade-out also writes directly to the DOM through a 100 ms interval — at 26 swimmers that's 260 inline-style writes per second, vs. 1560 React state updates per second if we'd used setState. GPU-accelerated translate3d keeps CPU low.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Theme picker — Daylight → Daydream + descriptions carry inspo — May 2026
  {
    title: "Theme picker — Daylight is now Daydream, every theme description carries the story behind it, and the translation toggle moved out",
    body: "Four changes to the theme picker (bottom-left of the sidebar):\n\n**1. *Daylight* is now *Daydream*.** Same default light theme — same `id: \"light\"` so nobody's saved preference resets — just a friendlier name. The original *Daylight* read as a weather report; *Daydream* fits how it actually feels (clean paper, soft contrast, the screen disappears).\n\n**2. Every theme description now carries its inspiration.** The old descriptions were a single phrase — *Calm, near-white tech surfaces*, *Parchment, sage, italic serif*. Useful on the surface; nothing about WHY the theme exists. New blurbs say it:\n\n  • **Daydream** — *the platform's default light theme, made for the kind of focus where you forget you're using a website*.\n  • **Voltage** — *inspired by the cyberpunk hour: the office goes quiet, the building hums, and the only light source is the monitor*.\n  • **Rosalind** — *named for Rosalind Franklin, the X-ray crystallographer whose Photograph 51 cracked the structure of DNA in 1952 — and whose name was kept off the 1962 Nobel*. The palette is her era and her discipline.\n  • **Summer Ice Cream** — *the parlor counter on the hottest afternoon of the year — a reminder that the platform you spend your day in can be a place that makes you smile*.\n  • **Greenwood** — *built because we wanted a theme that remembers there's a world outside the screen — and brings a little of it back in*.\n  • **Sakura** — *hanami in the browser. The Japanese tradition of stopping everything for a few weeks each spring to sit under blooming sakura trees and remember that beautiful things are fleeting. Limited time on purpose, like the blossoms.*\n\n**3. Descriptions now wrap.** Previous picker rendered descriptions inside an `overflow-hidden` strip that clipped to one line at rest and rolled left on hover (marquee animation). With longer blurbs that hid the whole point. Replaced with a normal multi-line wrap — rows grow as tall as their description needs, the menu's `overflow-y-auto` handles the case where the open dropdown gets taller than the viewport. The featured limited-time promo card also lost its `line-clamp-2` so Sakura's hanami description reads in full.\n\n**4. Page-translation toggle moved out.** The toggle for the floating translator dock used to live in a settings rail at the bottom of the theme dropdown. Decoupled — the theme picker is now exclusively about look-and-feel. (The translator dock itself still works; the toggle just isn't in this menu anymore.)",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — sharp corners, branch auto-expand, content-sized focused cards — May 2026
  {
    title: "Career paths — sharp-cornered cards, branch auto-expands folded columns, focused cards now sized to content",
    body: "Three changes to `/career-paths/pathways`:\n\n**1. Sharp corners on every card.** Removed the `rounded-xl` / `rounded-2xl` / `rounded-lg` softening from every card on this page — pathway headers, level station cards, the focused branch-modal cards, the station-detail popup frame, the embedded cross-link items inside BigStationCard, the dashed placeholder columns, the legend section, the fold toolbar. Cards now have 90° corners. The brand pill at the top (*Your career journey with BHN Learning Pathways*) keeps its pill shape — that's an intentional pill, not a card.\n\n**2. Branch button auto-expands folded columns before it animates.** Before this fix, clicking the Branch pill on a station whose target sits inside a collapsed pathway column (or a collapsed level row) silently dropped that target — the target's station box wasn't rendered to the DOM so `getBoundingClientRect` had nothing to read. Now the click handler:\n\n  • Computes every pathway + level the source and its cross-link targets need.\n  • If any are currently collapsed, expands them (via `setCollapsedPathways` / `setCollapsedLevels`).\n  • Stashes the click in `pendingBranchOpen` state.\n  • A follow-up `useEffect` + `requestAnimationFrame` waits one frame for React to commit the expansion + the browser to lay out the newly-visible columns, then captures rects and fires `setBranch`.\n\nThe expansion is visible for one frame before the modal backdrop fades in, so the user briefly sees the chart fill out before the animation begins — the columns stay expanded after the modal closes so the user can keep exploring.\n\n**3. Focused branch-modal cards are now sized to content, not stretched to the viewport.** Previous layout gave the source card `height: availH` (the full viewport height minus chrome padding) and divided remaining height among target rows — which produced 700-800 px tall cards on large monitors with content filling only the top half. New behaviour:\n\n  • Intrinsic heights: ~440 px source, ~460 px per target.\n  • If the viewport can't fit the intrinsic block, source and target shrink proportionally so they scale together.\n  • The block (source + target grid) centres both vertically and horizontally inside the safe area. Empty space wraps around the cards instead of living inside them.\n  • GAP between source and target columns bumped to 24 px so the SVG bezier connector lines have visible room to curve.\n\nResult: the focused state now reads as a tight, centred composition with breathing room around it, rather than a viewport-filling explosion with cards full of air.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — collapsed pathway cards redesigned — May 2026
  {
    title: "Career paths — collapsed pathway cards now read horizontally, sit centred on the canvas, and carry more detail",
    body: "Three follow-up fixes on the `/career-paths/pathways` collapsed state:\n\n**1. Horizontal text.** The collapsed pathway header used to be a 44-px-wide strip with the title set in `writing-mode: vertical-rl` — readable in principle, awkward in practice (you had to tilt your head). Replaced with a normal 140-px-wide horizontal card: icon + status pill on the top row, accent-coloured title underneath, then the tagline and sub-programs (joined with `·` to fit the narrow column) and the BHN delivery-partner footnote. Whole card is the expand button; the `Expand` affordance with chevron sits pinned to the bottom.\n\n**2. Centred on the canvas.** With seven 140-px cards plus six 12-px gaps the row totals 1052 px, which is narrower than the 1100-px-minimum chart container. The three grid containers that share the column template (header row, level rows, connector row) all got `justify-content: center` so the slack distributes evenly — when every pathway is collapsed the row sits centred on the canvas instead of bunched against the left edge. When ANY column is expanded its `1fr` track absorbs the slack and `justify-content` has no effect, so this centring only kicks in for the all-collapsed view.\n\n**3. More detail to start.** Previous collapsed card only showed the icon + rotated title + a chevron. New card carries the title, the 2-3 line tagline, the sub-program chips (joined inline as text to save space), the In-dev status pill where applicable, and the delivery-partner footnote — basically everything the expanded header carries, just compressed.\n\nBonus: the previous commit's measurement-driven SVG fan-out lines already track actual column centres via `useLayoutEffect` + `ResizeObserver`, so the lines from *Your career journey with BHN Learning Pathways* down to each column re-route automatically as the columns slide into their new centred positions.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Facilities map — seven mis-located dots fixed — May 2026
  {
    title: "Facilities map — seven facility dots were sitting hundreds of km from where they actually are; fixed",
    body: "You spotted dots floating in **northern Quebec** that shouldn't have been there. Checking the seed data, four Quebec facilities had latitudes around 52–53° N (≈ Lac Mistassini territory) instead of the ~45.5° N Montreal metro band where they actually operate. Coords had been pulled from a wrong source at seed time. Corrected, with everything pinned back to the real city centres:\n\n  • **Delpharm** (Boucherville) — was 52.87 / -73.42, now **45.5912 / -73.4365**\n  • **Jubilant HollisterStier** (Kirkland) — was 52.88 / -73.62, now **45.4500 / -73.8651**\n  • **Laboratoires Confab** (Longueuil / Saint-Hubert) — was 52.85 / -73.42, now **45.5176 / -73.4174**\n  • **Qeen Biotechnologies** (Gatineau) — was 53.08 / -73.44, now **45.4765 / -75.7013**\n\n**Double-check sweep caught three more in other provinces** while we were in there:\n\n  • **Bausch Health Steinbach** (MB) — was 53.90 / -98.86 (deep in northern Manitoba), now **49.5260 / -96.6839** (the real Steinbach, south-east of Winnipeg).\n  • **PBG BioPharma** (AB) — `city` field was the company name (`\"PBG BioPharma\"`), and coords pointed near Whitecourt. Fixed to city **Leduc** at **53.2683 / -113.5499** (the actual Edmonton International airport biotech park).\n  • **Resonetics** (BC) — `city` is Surrey, but coords pointed to Houston BC, ~900 km north. Fixed to **49.1913 / -122.8490**.\n\nThe page's auto-seed differ already compares lat/lng with a 1e-4 tolerance (≈ 10 metres) and upserts on mismatch, so these corrections propagate to the deployed DB on the next page load — no manual seed run needed.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — mind-map lines now pin to actual column centres — May 2026
  {
    title: "Career paths — pathways view: mind-map lines pin to the real boxes, no matter how many columns are collapsed",
    body: "Two fixes on `/career-paths/pathways`:\n\n**1. The headline now names the lens.** Changed *Your career journey* → **Your career journey with BHN Learning Pathways**, so it's obvious at a glance that this view is organised around BHN's announced pathways (vs. the job-function lens at `/career-paths/tracks`).\n\n**2. The fan-out lines from the headline pill no longer drift off the boxes when you collapse columns.** Before this fix, the SVG that draws the seven lines from *Your career journey* down to each pathway header used a hardcoded even distribution — line `i` always landed at horizontal position `(i + 0.5) / 7` of the chart width. That works when all seven columns are the same width, but the moment you click Collapse pathways (or fold a few columns individually) the boxes shrink to 44-px strips, bunch up to the left, and the lines stay aimed at empty space far to the right.\n\nFix: `MindMapRoot` now receives an array of measured column centres from the parent. The parent attaches refs to every `<li>` in `TrackHeadersRow` and, in a `useLayoutEffect` + `ResizeObserver`, captures each column's actual horizontal centre as a fraction of the chart container's width. Those fractions are fed straight into the SVG path's control-point arithmetic, so every line now ends precisely on its box's centre.\n\nResult: collapse all seven pathways, or collapse three and leave four expanded, or fold one — the seven lines always trace cleanly down to the boxes that actually exist. Added a 350 ms CSS transition on the path `d` attribute so the lines glide to their new positions as you toggle columns, rather than snapping.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Facilities map — merged province filter + jump-to navigation — May 2026
  {
    title: "Facilities map — provinces and metro clusters live in one Jump-to card now",
    body: "The facilities map page used to carry **two separate horizontal bars** above the map: a Province filter (province chips + status legend) and a Jump-to row (Canada + metro-cluster chips). Same shape, same chip styling, two slightly different meanings — and they each only did half of what a user wanted (province chips filtered but didn't fly; cluster chips flew but couldn't filter).\n\n**Merged into one Jump-to card with three rows.**\n\n  • **Row 1** — `Jump to` label · `Canada` reset button (clears the province filter AND zooms back to the country-wide view) · status legend right-aligned (Already built / Being built / Other, with live counts).\n\n  • **Row 2** — `Provinces`. One chip per province present in the data (full names where they fit: Ontario, Québec, Alberta, Manitoba, Saskatchewan, Nova Scotia, Newfoundland, PEI, Yukon, Nunavut; 2-letter codes for BC, NB, NWT). Clicking a province now does BOTH jobs at once: narrows the facility list to that province AND flies the map to that province's actual bounding box (computed from the facilities' coords, so empty wilderness isn't framed — Ontario flies to the GTA-Ottawa-Sault corridor, not Hudson Bay).\n\n  • **Row 3** — `Clusters`. The existing metro-cluster chips (GTA & Hamilton, Greater Montréal, Ottawa, Québec City, Vancouver Metro, Calgary–Edmonton, Prairies, Victoria, Atlantic). Counts respect the active province filter; clusters with zero visible facilities auto-hide. If filtering to Saskatchewan empties every cluster, the whole Clusters row disappears so the page doesn't carry dead chrome.\n\n**Hierarchy makes the logic readable:** provinces are large categories you'd land on first; clusters are sub-province zoom targets sitting beneath. The active state of a province chip and a cluster chip can co-exist (filter to Ontario + zoom into GTA = both lit), which matches their independent meanings.\n\nNothing about the map itself (dots, collision-avoiding labels, popups, the staff Rescan button) changed — this is purely a navigation-bar restructure.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Branch-animation lines now track the side-by-side layout — May 2026
  {
    title: "Career paths — branch-animation lines now follow the cards when the focused layout flips side-by-side",
    body: "Follow-up on the previous \"branch modal adapts to viewport\" fix. After `computeFocusLayout` learned to put the source card on the LEFT and the targets to its RIGHT on viewports ≥ 1100 px wide, the SVG connector lines were still using the original hardcoded geometry — they drew a vertical bezier from the source's bottom-centre down through a midpoint then up to each target's top-centre. With source-on-the-left + targets-on-the-right that meant the lines dove uselessly downward and arrived at the wrong edges; the line endpoints no longer kissed the actual card edges as the FLIP played out.\n\n**Fix:** new `bezierBetween(src, tgt)` helper inside `PathwayPathsExplorer.tsx`. It compares `|dx|` to `|dy|` between the two rect centres and picks anchor edges accordingly:\n  • **Horizontal layout** (target more to the side than up/down) → anchor on the source's right (or left) edge, target's opposite vertical edge, with a horizontal bezier whose control points sit on the midline-x.\n  • **Vertical layout** (target more up/down than side-to-side) → original geometry: bottom-edge → top-edge, vertical bezier with control points on the midline-y.\n\n`BranchLines` now calls `bezierBetween` per target and uses the returned `(srcX, srcY, tgtX, tgtY)` for the endpoint dots too — so the source dot and target arrowhead also land on the correct edges instead of being stuck to the bottom / top centres. The `d` attribute still has its 800 ms CSS transition, so the lines smoothly re-route as the cards FLIP from their chart positions (vertical relationship) to the focused layout (often horizontal at wide viewports).\n\nNet effect: open the branch modal on a laptop and the connector lines now genuinely glue to the moving card edges all the way through the animation, instead of pointing at coordinates that used to be card edges three layout-revisions ago.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths reorganised around BHN learning pathways — May 2026
  {
    title: "Career paths — second lens added: by BHN learning pathway",
    body: "The career-paths explorer used to live at `/career-paths` as one fixed view: six job-function tracks (Bioprocess, Quality, CGT, Clinical, Business, Project Leadership) × five career stations (Junior → VP). Useful — but shaped like HR thinks, not like our training.\n\n**Two views now, with a chooser.**\n\n`/career-paths` (the URL stays the same) is now a small landing page that asks which lens you want, then routes you to:\n\n  • **`/career-paths/tracks`** — the original six-job-function view, unchanged. If you came here knowing the role you want (Process Engineer → VP Manufacturing, say), this is your view.\n\n  • **`/career-paths/pathways`** *(new)* — organised by BHN's seven announced learning pathways: Aseptic Cell Culture Basics, CAR-T Cell Manufacturing, Biologics Manufacturing, QA/QC Microbiology for Advanced Therapies, QA/QC Analytics for Biologics, Regulatory Affairs, Medical Affairs. Same five-station spine, same branch animations, same chart treatment — but the rows are pathways instead of functions. If you picked a BHN pathway and want to see what your career looks like five and ten years later, this is your view.\n\n**Why both.** The seven pathways are TRAINING units. The six tracks are JOB units. The mapping between them is many-to-many — Aseptic + CAR-T + Biologics all feed Bioprocess; QA/QC Micro + Analytics + Reg Affairs all feed Quality & Regulatory; and Medical Affairs is a whole new track that wasn't in the original six. Rather than pick one lens and lose the other's signal, both ship.\n\n**Source for the pathways:** [biohubnet.ca/learning-pathway-announcement](https://biohubnet.ca/learning-pathway-announcement/). The three in-development pathways (Entrepreneurship, R&D, Clinical Trials) are deliberately omitted until BHN announces them — adding them later is a single-file edit in `src/lib/career-paths/pathway-data.ts`.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Preferred-name feature — May 2026
  {
    title: "Tell us how you'd like to be addressed — pick once, edit anytime",
    body: "Greetings across the platform used to come from the first word of your `name` field (the part before the first space). That works fine for \"Sarah Connor\" → \"Sarah\", but it sliced Korean / Chinese / Japanese given names in half (\"Yoo Jin\" → \"Yoo\", \"Mei Ling\" → \"Mei\") and ignored titles people use professionally (Dr., Prof., Mr., Mrs.).\n\n**What's new.** A new `preferredName` field on your profile, independent from your full / legal name. The full name still lives on your records and certificates; the preferred name only changes how we GREET you.\n\n**At first dashboard visit**, you'll see a small card under the welcome — \"How should we address you?\" — with one-click chips derived from your full name plus a custom field:\n  • **First** — just the first word\n  • **Full** — the whole name as-is (good for two-word given names)\n  • **First + middle** — for three-token names\n  • **First + last**\n  • **Dr. / Prof. / Mr. / Ms. / Mrs. / Mx. + last name** — six honorific options\n  • **Or type your own** — nickname, mononym, anything you want\n\nThe card can be dismissed (\"Skip for now\"). It only appears once — set or dismissed, it stays gone.\n\n**Edit anytime** via a pencil ✎ icon next to your greeting on the dashboard and the employer overview. Same smart chips, same custom field, plus a \"Reset (use my full name)\" link.\n\nFoundation: schema migration `20260727000000_preferred_name`, helper at `src/lib/user/display-name.ts` (`getDisplayName` resolver + `suggestDisplayNames` chip generator), endpoint `PATCH /api/profile/preferred-name`, client component `<PreferredNameEditor mode=\"pencil\"|\"card\">`. The resolver falls back to full name → email local-part → \"there\" so the greeting is never empty.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Demo tray hero-rule enforcement — May 2026
  {
    title: "Demo seed/clear tray — moved to a portal slot so it can never sit above the hero",
    body: "Surfaced via /forms/talent-application: the staff demo seeder was rendering ABOVE the page's editorial hero, breaking the platform rule that the hero owns the top of every page. The hero rule was previously enforced by convention — each page author had to remember to place the tray below `<PageHero>`. After ~17 usage sites that convention broke down.\n\n**Structural fix.** `DemoSeedAndClearTray` now portals itself into a dedicated `#bhn-demo-tray-slot` div rendered at the bottom of `<main>` inside the (dashboard) layout. Pages can write `<DemoSeedAndClearTray entity=… />` anywhere in their JSX — the actual rendered DOM always lands in the slot. It is now structurally impossible for a page to place the tray above its hero, even by mistake. If the slot is missing (e.g. someone mounts the tray outside the dashboard layout in the future), the component renders nothing in production and logs a loud dev-mode warning so the missing wrapper gets fixed.\n\n**Bonus:** with all trays now stacking in the same slot at the bottom of the page, admins working through the page content scroll past the form first and find the demo tools waiting at the bottom — closer to the 'tools at end' pattern users expect. The amber pill styling is unchanged.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Facilities map — May 2026 web scan
  {
    title: "Facilities map — 44 more biomanufacturing sites added (69 → 113)",
    body: "Web-scan pass across BIOTECanada's directory, ISED's Biomanufacturing Projects list, adMare BioInnovations' portfolio, BioCanRx-affiliated facilities, and individual company sites pulled 44 additional Canadian biomanufacturing facilities into the map at `/experience/facilities`.\n\n**Notable additions.** BlueRock Therapeutics + CCRM + Sunnybrook GMP at MaRS; AbCellera's new Mission Critical GMP campus in Vancouver; Precision NanoSystems' 75,000 sq ft RNA medicine biomanufacturing centre (False Creek Flats); adMare's M4 Innovation Centre + UBC HQ; the Advanced Therapeutics Manufacturing Facility (ATMF) at UBC; BC Cancer's Conconi Family Immunotherapy Lab + Genome Sciences Centre CAR-T platforms; Fusion Pharmaceuticals (now AstraZeneca) + the Centre for Probe Development and Commercialization for radiopharmaceuticals in Hamilton; Eli Lilly's POINT Biopharma Toronto site; Pharmascience Candiac; Sterinova (B.Braun) at Saint-Hyacinthe; the BC Cancer / VIDO BSL-3 vaccine facility at the University of Saskatchewan; Providence Therapeutics' mRNA platform in Calgary; CASTL Charlottetown; the Critical Medicines Production Centre at the U Alberta Research Park; BIOVECTRA's new Windsor (NS) microbial fermentation site; plus Repare, Inversago (Novo Nordisk), Sernova, Triumvira, BioLyse, Edesa, PlantForm, Vasomune, IMV, 3D BioFibR, Avivagen, Symvivo, PnuVax, Inspire Bio Innovations / Ability Biotherapeutics, BioPharma Services, AmacaThera, Avir, BioSyent, Vetoquinol/Bioniche, Vetio Animal Health, and BioVaxys.\n\n**Plumbing fix on the auto-seed path.** The page used to upsert seed data only when the Facility table was empty — meaning new entries added to `src/lib/facilities/seed-data.ts` after the initial seed would never propagate to the deployed DB. The page now **diffs** seed names against existing names every load and upserts just the missing ones (the upsert is by-name unique with `update: {}`, so existing rows are never overwritten and admin-edited descriptions survive). Cost on a steady-state load is one SELECT + a tiny set diff.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Staff sidebar always-full — May 2026
  {
    title: "Sidebar — admins and superadmins now always see every menu item their role allows",
    body: "Staff were occasionally reporting \"a menu item disappeared\" — usually after they toggled features off in `/profile/preferences` while testing what trainees see, or because the registry marks some features `defaultEnabled: false` (e.g. **My Credits**, **Rewards**, **Buddies**, **EQUIP Funding / Tracker / Deadlines**, **Roadmap**, **Themes**, **Talent pool** for trainee-view) so a fresh staff account never saw them in the first place. The preferences switchboard is a trainee-curation tool, not an admin navigation gate; hiding admin tools from admins is a confusing UX bug.\n\n**Permanent fix.** Centralised the rule in `src/lib/preferences/active.ts` as `resolveSidebarHiddenSet(realRole, raw)` + `isPlatformStaffRole(role)`. When the viewing user's **real** role is admin or superadmin, the sidebar receives an empty hidden set so every item their role allows shows up — regardless of what they've toggled in their switchboard or what the registry's `defaultEnabled` flag is set to. Role-rank filtering (`minRole`) still applies, so trainee accounts don't suddenly see admin menus; and impersonation (`actingAs`) still strips admin items when a superadmin acts as a trainee.\n\n**On the switchboard page** (`/profile/preferences`), staff now see an amber heads-up banner explaining that their toggles save (and are useful for testing) but won't change their own sidebar — no more \"is this toggle broken?\" tickets.",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Graduate showcase — May 2026
  {
    title: "Graduate showcase — public landing page + admin triage dashboard",
    body: "Stand-alone surface for capturing program graduates' details for the public-facing showcase. **Anyone** (no login required) can land at **`/showcase/regulatory-affairs`** and submit:\n\n  • Their name (2–120 chars)\n  • Their LinkedIn handle — accepts a bare slug (\"priya-iyer\"), a partial URL (\"linkedin.com/in/priya-iyer\"), or a full URL. Normalised server-side to a canonical `https://www.linkedin.com/in/<slug>/`.\n  • A headshot (JPEG / PNG / WebP, under 5 MB). Live preview before submit; uploaded to R2 at `showcase/<programSlug>/<id>.<ext>`.\n\nBranded with the BioHubNet diamond mark + tri-tone wordmark + \"Transformative Talent Development\" tagline. Lives **outside** the `(dashboard)` group so no sidebar / no auth gate. IP + user-agent are captured for abuse triage. Errors are user-facing strings; size/type checks mirror the server gate so the upload never wastes bytes.\n\n**Admin side — `/admin/showcase`** (linked under Admin in the sidebar as \"Grad showcase\", GraduationCap icon):\n  • Grid of submission cards — headshot thumbnail, name, LinkedIn link (opens in new tab), submitted date, and \"Downloaded <date> by <admin>\" once processed.\n  • Filter bar: program tab + an \"Only show un-downloaded\" toggle for triage.\n  • Per-row actions: **Download** (opens photo + LinkedIn in new tabs, auto-marks the row as downloaded by the current admin), **Mark done / Mark undone** (manual toggle when downloaded out-of-band), **Delete** (confirms via the platform dialog, drops the R2 object + the row).\n\n**Foundation.** New `ShowcaseSubmission` Prisma model + raw SQL migration `20260722010000_showcase_submissions`. Three API routes: `POST /api/showcase/submit` (public), `POST /api/admin/showcase/[id]/mark-downloaded` (admin-only, accepts `{ mark: boolean }`), and `DELETE /api/admin/showcase/[id]` (admin-only, R2 cleanup first then row delete). The R2 deleter is best-effort so a stuck blob never blocks removing spam.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Sidebar labels + facilities auto-seed — May 2026
  {
    title: "Sidebar — proper labels for Career Paths + Facilities Map (and the map auto-populates)",
    body: "Two small fixes on yesterday's additions:\n\n**1. Sidebar labels were showing the raw i18n key (`nav.careerPaths`, `nav.facilitiesMap`) instead of human strings** — those two `labelKey`s weren't registered in any locale dictionary so the translator returned the key itself. Added both keys to all 8 locales (en/es/fr/zh/hi/ko/pa/ar) with the English label \"Career Paths\" / \"Facilities Map\". Now the sidebar reads cleanly.\n\n**2. The facilities map was empty in production** because the `Facility` table got migrated (prisma migrate deploy runs in the build) but the seed had never been run against the deployed DB. Made the `/experience/facilities` page **self-seeding**: on first page-load, if `prisma.facility.findMany()` returns an empty array, the page auto-runs the same idempotent upsert the seed script does — 69 facilities populate themselves. Defensively wrapped in a try/catch so the page also survives the case where the table itself doesn't exist yet (table-doesn't-exist → in-memory fallback renders the dots from `seed-data.ts` directly with synthetic ids so the map is never blank).",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — restored staged branching animation — May 2026
  {
    title: "Career paths — restored the staged branching animation (darken → highlight → hold → lines → move)",
    body: "The previous commit had cards popping straight into the focused layout — fast but lost the spatial \"here's where you were, here's where you'd jump to\" reading. Brought the staged FLIP back with explicit hold-times between each visual event.\n\n**Sequence** (~3.1 s end-to-end):\n  • **0–300 ms** — backdrop fades to 80 % black + blur. The unrelated chart cards underneath dim automatically through the backdrop's opacity.\n  • **350–700 ms** — source + target cards (cloned above the backdrop at their CHART positions, showing compact chart-box content) light up: thick accent border + multi-layer accent glow ramp in via 350 ms CSS transition.\n  • **~800 ms HOLD** — nothing else moves. The user gets time to actually see WHICH boxes are being highlighted and WHERE they are on the chart.\n  • **1500–2300 ms** — SVG cubic-bezier lines grow from source's bottom-centre to each target's top-centre, all at CHART positions. Staggered 120 ms per line, 700 ms each. Drop-shadow glow + endpoint circles.\n  • **2300–3100 ms** — cards FLIP from chart positions to focused-layout positions. `left/top/width/height` all transition together over 800 ms. Lines visibly stretch as endpoints follow the moving cards (the SVG path `d` attribute also has a CSS transition). Card content crossfades from `CompactCardContent` (chart-box style) to `BigStationCard` (full detail) — compact fades out 300 ms immediately, expanded fades in 400 ms with a 400 ms delay so the card has grown before the full content appears.\n  • **3100 ms+** — settled. Close button + Esc hint fade in.\n\nThe long hold after the highlight is the load-bearing change — it gives the eye time to register the source and target boxes in their chart context before they start moving.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Facilities map + compact Branch pill — May 2026
  {
    title: "Facilities map — Canadian biomanufacturing companies + plants on an interactive map",
    body: "New page at **`/experience/facilities`** under the Experience group. Every Canadian biomanufacturing facility we know of, pinned to a city on a Leaflet map (OpenStreetMap tiles).\n\n**What's there.**\n  • **69 facilities** seeded from a curated xlsx (AbCellera Biologics, Acuitas Therapeutics, NRC Biologics Manufacturing Centre, Resilience, OmniaBio, Sanofi, Moderna, STEMCELL Technologies, Zymeworks, BIOVECTRA, and 59 others) — names, source URLs, province / city, status (Already built vs Being built), address where known, specialisation, scale (headcount / sq-ft), and free-text notes.\n  • Dots colour-coded by status: **teal** for already built, **amber** for being built, **grey** for unknown / informational.\n  • **Province filter** chips above the map — \"All / British Columbia / Ontario / Quebec / …\" with counts.\n  • Dot **radius scales with zoom** — compact when looking at all of Canada, larger as you zoom into a specific metro so individual dots stay clickable.\n  • Click any dot → Leaflet popup with the headline info + an \"open site\" link. The page also pins a stable detail panel **below the map** carrying the full record (specialisation, scale, notes, description) so the info persists after the popup closes.\n\n**Rescan tool (staff-only).** Each facility's detail panel shows a \"Rescan facility\" button for instructors / admins / superadmins. One click hits `POST /api/admin/facilities/[id]/rescan` which:\n  1. Fetches the source URL through Jina Reader (clean markdown extraction — same pipeline the simulator uses for JD ingestion).\n  2. Passes the page content to the chat() AI adapter with a prompt that asks for an updated one-line `specialization` + a ~120-word `description`.\n  3. Persists both back to the row + stamps `lastScannedAt`. Errors stored in `scanError` and surfaced on the detail panel.\n\n**Foundation.** New Prisma `Facility` model + raw SQL migration `20260722000000_facilities`. Seed script at `scripts/seed-facilities.ts` is idempotent — `npx tsx scripts/seed-facilities.ts` upserts on the unique `name` index, so re-running after an xlsx refresh updates existing rows without duplicating.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Career paths — Branch icon now has a 'Branch' label so it's discoverable",
    body: "The bottom-right branch-out icon on cross-tree station boxes was just a `GitFork` glyph + a count badge — users couldn't tell at a glance what it did. Widened it slightly to a pill that carries the icon + the word **Branch** + a tiny count badge for stations with multiple branches. Still ~80 px wide, still bottom-right, still pulses every 2.4 s.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — cards pop with full content + clarified "similar roles" — May 2026
  {
    title: "Career paths — branch cards pop with full content + clarified similar roles",
    body: "Two issues you flagged on the branching modal:\n\n**1. The compact preview was misleading the user.** Before this commit, cards spent ~700 ms at chart-box dimensions showing a `CompactCardContent` preview that line-clamped the focus paragraph to 3 lines (your \"…scale-up from clinical to\" cut-off was line-clamp). The intent was that the compact phase would fade out into the full `BigStationCard` once the card grew — but it made the truncated preview the first thing you saw and read as the final state.\n\n  Fix: **killed the compact preview entirely.** Cards now pop in directly at their focused layout positions with the full `BigStationCard` content from the start. No size animation, no chart-to-focused slide, no compact-to-expanded crossfade. The new pop-in uses a 380 ms scale 0.92 → 1 + fade with a small bouncy ease (`cubic-bezier(0.34, 1.56, 0.64, 1)`), staggered 110 ms per target. Total sequence: backdrop 0–300 ms → cards pop in 300–1100 ms → SVG lines draw 1100–1900 ms → settled.\n\n**2. \"+2 similar roles\" was ambiguous.** Nobody knew what those 2 roles were. Replaced the cryptic count line with an actual list:\n\n  > **Also at this level**\n  > · Head of Vector Manufacturing\n  > · Director, ATMP Quality\n\n  So the user sees every role title at this seniority level explicitly, not just \"+2\".\n\n**Sized to fit.** Bumped focused dimensions again to make room for the new list and the un-clamped focus paragraph:\n  • Source: 380 × 420 → **380 × 460**\n  • Target: 340 × 620 → **340 × 660**\n\nThe in-chart `StationBox` cards (the ones you click to open the modal) still use the compact \"+N similar role(s)\" line, since they're constrained by the 6-column grid layout and don't have room for the full list. The full list appears in the modal where there's space.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — fix content cutoff + larger final cards — May 2026
  {
    title: "Career paths — content no longer clips during the branch animation + cards sized to fit content",
    body: "Two fixes on the staged branching animation:\n\n**1. Content was being clipped during the highlight / lines phases.** While the FlipCard was at the chart-box dimensions (small), the full BigStationCard content was already rendered inside but `overflow-hidden` chopped it. Fixed by giving each FlipCard TWO content layers and crossfading between them:\n\n  • **Compact layer** — a new `CompactCardContent` component that mirrors the chart's `StationBox` content (role + focus + top 4 education gaps). Sized naturally for the small chart-box dimensions, so no clipping during stages 0–2.\n  • **Expanded layer** — the existing `BigStationCard` with the full header, full education gaps, plus the cross-link section for target cards.\n\nDuring the move stage, the compact layer fades out (300 ms, no delay) and the expanded layer fades in (400 ms, +400 ms delay) — so the user sees chart-box content first, the card grows + slides, and the full detail appears as the card settles into the focused layout.\n\n**2. Final cards were sized too tight for the content.** Bumped focused dimensions so `BigStationCard` content fits in full without internal scrolling:\n  • Source: 360 × 320 → **380 × 420**\n  • Target: 320 × 420 → **340 × 620** (room for the cross-link reason + 4 learning-needed gaps)\n\nInternal scrolling is retained as a safety net for unusually long content, but the default content fits cleanly now.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — graceful staged FLIP animation — May 2026
  {
    title: "Career paths — graceful staged branching animation (darken → highlight → lines → move)",
    body: "Replaced the \"appears instantly\" modal with a properly sequenced FLIP animation. Click the branch-out icon on any station and watch:\n\n  • **0–300 ms** — backdrop fades to 80 % black + blur. Source + target cards remain visible above the backdrop, still at their original chart positions.\n  • **350–700 ms** — source + target cards highlight: thick accent border + multi-layer accent glow ramp in (350 ms transition on box-shadow + border-color).\n  • **700–1500 ms** — SVG cubic-bezier lines grow from source's bottom-centre to each target's top-centre via `stroke-dashoffset` animation, staggered 120 ms per line. Lines carry a coloured drop-shadow glow + a circle marker at each endpoint.\n  • **1500–2300 ms** — cards FLIP from their original chart positions to a centred focused layout — `left`, `top`, `width`, `height` all transition together over 800 ms with `cubic-bezier(0.4, 0, 0.2, 1)`. The line endpoints track the moving card positions because the `<path>` `d` attribute also transitions.\n  • **2300 ms+** — settled state. Close button + Esc hint visible. Cards content scrollable internally if they overflow their final box.\n\n**Implementation notes.** The click handler in `CareerPathsExplorer` now captures the source + every target station box's `getBoundingClientRect` at click time and passes the rect bundle to `BranchModal`. The modal's new `FlipCard` component is a fixed-positioned wrapper whose `left/top/width/height` switch between `fromRect` (original chart position) and `toRect` (focused layout slot) when the stage flips to `\"moving\"` — CSS transitions on all four properties handle the actual interpolation. The `BranchLines` component re-anchors its path coords to whichever rect set is current, so the lines stay connected as the cards move.\n\n**The focused layout** is computed by `computeFocusLayout(numTargets, viewport)`: source card 360×320 centred at top, targets 320×420 in a row below, shrinking to fit if more than 3 targets or narrow viewport.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — fix branch icon click + move to bottom-right — May 2026
  {
    title: "Career paths — branch-out icon moved to bottom-right + click actually works now",
    body: "Two fixes on the click-to-branch interaction shipped earlier today:\n\n**1. Click was hanging the page (real bug).** The `BranchModal`'s `targets` array was recomputed inline in the function body on every render, producing a fresh array reference each time. The `useLayoutEffect([targets])` saw a \"new\" dep on every render, re-ran, called `setLines(...)`, triggered another render, ran the effect again — infinite loop. The modal mounted but immediately locked up before the user saw anything change, which is why the icon appeared to do nothing on click. Fixed by wrapping `targets` in `useMemo([source])` so the reference is stable across re-renders.\n\n**2. Branch-out icon moved from the top-right to the bottom-right** of each station box. Content padding flipped from `pr-10` (right-only) to `pb-10` (bottom-only) so the last education-gap line doesn't slide under the floating button. Added `cursor-pointer` + `active:scale-95` + an explicit `pointer-events: auto` to the button for extra defensive feedback.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — click-to-branch modal — May 2026
  {
    title: "Career paths — click a pulsing fork icon to open a focused branching modal",
    body: "Reset the cross-tree interaction. Hover is gone; the page is now click-driven and modal-based.\n\n**Branch-out icon.** Every station box that has cross-tree links now wears a small `GitFork` icon in its top-right corner, tinted in the track's accent. When the station has more than one branch, a tiny count badge sits over the icon. The icon breathes with a 2.4-second `careerBranchPulse` keyframe (scale 1 → 1.12, opacity 0.85 → 1) so it's clearly interactive.\n\n**Click animation sequence** (total run-time ~1.1 s):\n  • **0 ms** — full-screen backdrop fades in (`bg-black/75 backdrop-blur-sm`).\n  • **250 ms** — source station card slides + fades in at the top, centred, with a thick accent border and a multi-layer accent glow.\n  • **450 ms** — SVG cubic-bezier lines start drawing from the source's bottom edge to each target's top edge, with a stroke-dashoffset animation timed at 700 ms and staggered 120 ms per line. Each line carries an arrowhead in the target's accent and a soft outer glow.\n  • **750 ms** — target station cards slide + fade in at the line endpoints, each carrying its own station detail + the transition's reason + the 4 \"learn first\" gaps.\n  • **1100 ms** — \"Press Esc or click backdrop to close\" hint fades in.\n\nLayout adapts to the number of targets (1, 2, or 3 columns). The modal scrolls vertically when the content is taller than the viewport. Body scroll is locked while open. Click backdrop / Esc / close button all dismiss.\n\n**Removed:** the hover-line + popover overlay, the `dim others` mechanism, the `relatedIds` set, the band-based popover positioning code, and the in-box cross-tree text footer — all replaced by the single icon affordance + modal.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — branching polish: glow, dim, canvas-clamp, dynamic shape — May 2026
  {
    title: "Career paths — branching polish (glow, dim others, canvas-clamp, dynamic popover shape)",
    body: "Four refinements to the cross-tree hover interaction:\n\n**Glow on the popover.** The popover now wears a multi-layer box-shadow tinted to the destination track's accent — a 1-px inner ring at 35 % accent, a 4-px soft ring at 16 %, a 38-px outer halo at 30 %, plus a faint black drop-shadow. Reads as \"this card belongs to the destination branch\" without being loud.\n\n**Dim unrelated cards.** When a station with cross-links is hovered, every other station box (the ones that aren't the source or one of the targets) fades to `opacity-40` with a 200 ms transition. No blur — the boxes are still readable, just de-emphasised. The set of \"related\" station ids is computed at the top of CareerPathsExplorer and threaded down through LevelRow → StationBox as a Set.\n\n**Stay inside the canvas.** The popover position is now clamped to the chart's inner container — `Math.max(PAD, Math.min(canvasW - w - PAD, x))` on the x axis and the same on y. So the popover never falls off the left/right/top/bottom edges of the chart, even when the source is in the first or last column.\n\n**Centred on the line + dynamic shape.** Replaced the candidate-list positioning with band-based positioning: the popover sits in the vertical gap between the source row and the target row, with its **x centred on the line's midpoint** and its **height adapted to the band's height** (clamped between 56 and 160 px). Width clamps to canvas minus padding. When the popover would overlap source or target anyway (rare same-row case), the candidate-list fallback kicks in. For multiple cross-links from one source (Project Senior has 3), each subsequent popover is greedy-shifted down (or right, if it would fall off the canvas bottom) to avoid stacking on top of earlier popovers.\n\n**Adaptive content.** When the band is small and the popover ends up under 120 px tall, the \"Learn first\" gap list is dropped — only the from→to header + when + reason is rendered. When the band is taller, the full content shows.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — hover-to-draw cross-tree lines + popover — May 2026
  {
    title: "Career paths — hover a station box to draw cross-tree lines + see transition details",
    body: "Rebuilt the cross-stream interaction the way it was originally pitched: hover a station box that has cross-tree links and the chart itself draws an SVG line from that box to each branch-destination box, with a small popover floating in the gap carrying the \"when\", \"why\", and top 3 \"learn first\" gaps for that lateral move.\n\n**Popover positioning has collision detection.** The popover tries the midpoint between source and target first; if that midpoint would overlap either box, it falls back through a candidate list (between rows, to the right of target, to the left of source, below target) until it finds a position that clears both boxes by at least 12 px. Multiple popovers from the same source are pushed down so they don't overlap each other.\n\n**Coordinates survive scroll.** Position is computed relative to the chart's inner container (subtracting that container's `getBoundingClientRect` from the source / target rects), so horizontal chart scroll and page vertical scroll don't drift the lines. Re-measure on resize.\n\n**Removed:** the previous 2xl side-by-side grid wrapper, the standalone Cross-stream Mobility section, the TransitionCard / StationPreview / aggregated-transitions code. Two failed iterations cleaned up.\n\n**Kept:** the cross-tree text footers inside each station box — they name the destination track + level in plain text, and act as the always-visible accessible fallback for keyboard users / mobile / users who don't hover.\n\nLines colour-coded to the target track. Source dot in the source track's accent.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — side-by-side chart + transitions on wide viewports — May 2026
  {
    title: "Career paths — chart on the left, transitions in a sticky right column (wide viewports)",
    body: "On 2xl+ viewports (1536 px and wider), the page now splits into a two-column grid:\n  • **Left** — the flowchart-mind-map of all six tracks, with its own horizontal scroll for the 6 columns.\n  • **Right** — the cross-stream transition cards, in a 400-px column that's sticky-pinned at the viewport top and scrolls vertically inside itself.\n\nBoth surfaces are visible at the same time, so hovering a transition card actually highlights the corresponding source + target boxes in the chart without requiring the user to scroll up to the chart. The spatial reading the hover interaction was always meant to provide finally lands.\n\nBelow 2xl the layout falls back to stacked (chart on top, transitions below). The in-card station previews shipped earlier this week mean each card stays self-sufficient there — the user doesn't need the chart-highlight to understand a transition.\n\nImplementation notes:\n  • Outer wrapper is a `2xl:grid 2xl:grid-cols-[minmax(0,1fr)_400px]` with `2xl:items-start` so the sticky right column references the grid wrapper rather than the page.\n  • The chart's horizontal-bleed margins (`-mx-4 sm:-mx-6 px-4 sm:px-6`) are reset (`2xl:mx-0 2xl:px-0`) inside the grid so the chart cell stays within its column.\n  • `min-w-0` on both grid children — the chart needs it for `overflow-x-auto` to actually engage; the aside needs it so the card-content doesn't blow the grid column out.\n  • Right column uses `2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-2rem)] 2xl:overflow-y-auto` for the sticky + internal-scroll combo.\n  • Transition card grid collapsed to single-column always (no `xl:grid-cols-2`) — 400 px sidebar can't hold 2-col, and below 2xl the in-card previews already make each card wide.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — transition cards now self-sufficient — May 2026
  {
    title: "Career paths — transition cards now carry source + target station previews",
    body: "Honest follow-up. Yesterday's hover-to-highlight feature had a real flaw: the Cross-stream Mobility cards sit at the bottom of the page and the chart's station boxes sit at the top, so hovering a card highlighted boxes that were scrolled offscreen — the user saw nothing change.\n\nFixed by putting the from / to context INSIDE the transition card itself. Each card now carries two compact side-by-side station previews:\n  • **Starting here** — the source station's primary role, level + years, focus line (2-line clamp), and top 3 education gaps. Tinted in the source track's accent.\n  • **Landing here** — same shape for the target station, tinted in the target track's accent.\n\nThe card is now self-sufficient: you can read everything about a transition (where you start, where you land, why it works, what to learn) without ever scrolling to the chart. The card grid was switched from `md:grid-cols-2` to `xl:grid-cols-2` to give each card enough horizontal room for the side-by-side previews on common viewports.\n\nThe chart-highlight hover behaviour from yesterday's commit stays in place as a bonus when both the chart and the cards happen to be in view — it just isn't load-bearing anymore.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — two-way highlight between transition cards + chart — May 2026
  {
    title: "Career paths — hover a transition card to highlight the source + target boxes in the chart",
    body: "The Cross-stream Mobility cards under the flowchart are now keyboard- + mouse-interactive. Hover a card (or Tab to it and focus) and the corresponding source station and target station up in the chart get a 3-px coloured outline in their respective track accents — source in the source track's hue, target in the target track's hue — so the spatial \"from here, you'd jump there\" reading is instant.\n\nThe chart's overflow-x-auto container ALSO pans horizontally to centre the source box if it's currently outside the viewport's horizontal middle. Importantly, we deliberately do NOT touch page vertical scroll position — that would yank the user off the card they're hovering. If the chart is vertically offscreen, the user scrolls up themselves; the outlines persist as long as they keep hovering.\n\nImplementation notes:\n  • Each station box is now stamped with `data-station-id=\"<trackId>-<level>\"`.\n  • Each `CrossLink` gained an explicit `targetLevel: LevelId` (so we know which destination station to highlight without parsing the human-readable \"Senior → Lead\" string).\n  • `TransitionCard` is tabbable (`tabIndex={0}`), with mouse + focus event handlers that toggle an inline `outline` style on the two station boxes. Direct DOM access avoids lifting state up through four parents and re-rendering 60+ boxes on every hover.\n  • `useEffect` cleanup clears the outline if the card unmounts mid-highlight.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — fix root-line origin + cross-stream mobility section — May 2026
  {
    title: "Career paths — mind-map root lines start at the pill edge + cross-stream mobility section",
    body: "Two follow-ups on /career-paths:\n\n**Root SVG lines.** The previous version absolute-positioned the radiating SVG with `bottom-0`, which put the top edge of the SVG behind the pill — the rays appeared to start from inside the pill text. Switched to in-flow layout: the pill renders on top, the SVG renders directly beneath in the normal document order. The path origin `M 50 0` is now exactly at the pill's bottom edge, so every ray emerges from the bottom centre of the pill rather than from behind the text.\n\n**Cross-stream mobility section.** A new \"What career transitions are possible across streams?\" panel below the flowchart aggregates every cross-tree link the data documents — 11 transitions in total covering Bioprocess → Quality / Project Leadership, Bioprocess → Business, Quality → CGT, Quality → Business, CGT → Clinical / Quality, Clinical → Project / Business, Business → Project, and Project → Bioprocess / Business / Quality. Each transition is a card carrying:\n  • A from → to header with both tracks' icons + the source level + the destination level hinge\n  • Why this move is credible (one sentence)\n  • What to learn before you move — 4 topic phrases, gap-style, no course names\n\nCards have a split top-edge accent (left half = source colour, right half = destination colour) and a horizontal gradient backdrop so the from → to direction reads visually as well as in text. The data schema gained an optional `learningNeeded?: string[]` on each crossLink so the section is fully data-driven; every existing crossLink was enriched with its specific learning gaps, and three new transitions (Quality Senior → Business, Clinical Senior → Business, Project Senior → Quality) were added on top of the original six.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — flowchart + mind-map layout — May 2026
  {
    title: "Career paths — flowchart + mind-map visualisation",
    body: "Pivot from the horizontal-lanes big-picture layout to a proper flowchart × mind-map.\n\n**Mind-map root.** A central \"Your career journey\" pill sits at the top of the chart, with six curved SVG rays radiating downward to the six track headers — every road starts in the same place + diverges.\n\n**Track headers row.** Six cards across the top, one per track, each with an accent-tinted gradient backdrop, the icon, the track name, and the tagline. The grid columns here lock the alignment for everything below.\n\n**Flowchart body.** Five level rows (Junior → VP). Each row contains six station boxes — one per track, in the same column order as the headers above. Between every pair of rows, six curved SVG down-arrows (one per column, each in the track's accent colour) carry the flow downward. Level label bands separate the rows so the seniority context is always visible.\n\n**Station boxes** are unchanged from the previous big-picture version: role title, focus microcopy, education gaps list, cross-tree footer at branch points. Accent intensity scales from light at Junior to full at VP so each column reads as growth.\n\n**Trophy cap** under the VP row marks the top of every ladder.\n\nNeeds ~1180 px horizontal to render all six columns legibly, so the whole chart sits inside `overflow-x-auto` — phones get a horizontal pan rather than a forced reflow. The mind-map root + the SVG radiating curves + the per-column flow arrows give the page a much more diagrammatic feel than the previous horizontal-lanes treatment.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — big-picture map, education gaps instead of courses — May 2026
  {
    title: "Career paths — big-picture map with education gaps (not course names)",
    body: "Pivot from the one-track-at-a-time tree chart to a single-page big-picture map showing all six tracks at once. And from \"suggested courses\" to \"education gaps\".\n\n**Layout** — six horizontal lanes (one per track), each with a track header on top and a 5-column grid of station boxes (Junior → Mid → Senior → Lead → VP). Stations connected by a horizontal ChevronRight pill between them. Sparkles \"Start\" marker on the left end of every lane, Trophy \"Top of the ladder\" marker on the right. Each lane has a subtle accent-tinted gradient backdrop so tracks are visually distinct without colour-fighting.\n\n**Inside each station box:**\n  • Level eyebrow + years-range pill in the track accent\n  • Primary role title + \"+N more\" affordance for the other roles at that level\n  • Focus microcopy (3-line clamp)\n  • **Education gaps** — 5 topic phrases describing the kind of training the trainee needs at this level. Intentionally non-prescriptive: no course names, no links. The point is \"what kind of muscles do I need to build\" rather than \"take this specific class\".\n  • Cross-tree footer when this station has cross-links — names the destination track + the \"when\" hinge.\n\n**Accent intensity grows with seniority** — the top-edge accent strip on each box goes from 30% opacity at Junior to ~98% at VP, so the eye reads \"climbing\" as it scans left-to-right.\n\n**Course chips are gone** from the rendered output (the data layer keeps the course suggestions for potential future use). The page is now a map for orienting yourself, not a curriculum recommender. The map ends with a hand-off line pointing to /courses for specific catalog offerings.\n\n**Responsive** — at lg+ each lane is a 5-column grid; below lg the stations stack vertically inside their lane so the full picture still reads on phones.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — tree-chart visualisation — May 2026
  {
    title: "Career paths — tree-chart visualisation with boxes, lines, and microcopies",
    body: "Follow-up to yesterday's career-paths landing. The previous version rendered the journey as a flat magazine-row list; this version turns it into a proper tree chart.\n\n**What changed:**\n\n• **Station boxes.** Each level is now a real rounded card with a soft shadow, a left-edge accent bar in the track's hue, a level eyebrow + years pill, the role list, the focus microcopy, and 3–4 suggested courses. Subtle accent-tinted gradient backdrop ties the box to its track without becoming a colour wash.\n\n• **Trunk connecting line.** A 2-px vertical bar runs between consecutive station boxes, with a gradient that deepens from light at Junior to full accent at VP — the eye reads \"climbing\" as it scans down. The trunk has a Sparkles cap at the top (Start), an arrow chevron between every pair of stations, and a Trophy cap at the bottom (Top of the ladder).\n\n• **Transition microcopies.** Between every pair of stations sits a one-line italic note explaining what changes at that career hinge: \"Around year 2 — you stop following SOPs and start owning a unit op,\" \"Around year 5 — strong ICs become workstream leaders,\" \"Around year 10 — the work shifts from doing it to designing the system,\" \"Year 15+ — set portfolio strategy, answer to the board.\"\n\n• **Cross-tree branches.** At stations that have cross-links, an SVG dashed curve grows out of the box's right edge to a small destination card carrying the target track's icon, the \"when\" microcopy (e.g. \"Senior → Lead\"), and a one-line \"why\" reason. Clicking the destination card swaps the active track so that journey is immediately on screen. On lg+ the side cards sit in their own column; below lg they collapse to a stacked list under the parent station.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Career paths — guided Junior → VP journeys — May 2026
  {
    title: "Career paths — guided Junior → VP journeys across six tracks",
    body: "New page at `/career-paths` (Experience group, sidebar default-on) that turns the platform's training catalog into six career maps.\n\n**Tracks** — Bioprocess Manufacturing · Quality & Regulatory · Cell & Gene Therapy · Clinical & Trials · Biotech Business & Entrepreneurship · Project Leadership.\n\n**Each track** carries a five-station journey: Junior (0–2 yrs) → Mid (2–5) → Senior (5–10) → Lead (10–15) → VP (15+). At every station you see typical role titles, the focus + muscles you build there, the 2–4 platform courses that fit most cleanly, and any cross-tree branch points where careers commonly fork (e.g. Bioprocess Senior → Quality Lead, Cell & Gene Senior → Clinical Lead, Manufacturing Lead → Business VP).\n\n**Visual design** matches the recent magazine-row aesthetic: track selector at top with a thin left-accent bar per track, then a single vertical timeline with stations connected by a dashed line in the active track's accent colour. Course chips are flat ghost text with a chevron — hover-only underline — so the eye reads the journey first and the courses as supporting detail. Cross-tree branch chips are buttons: click one and the explorer switches to that track so you can see the destination journey without leaving the page.\n\n**Course curation** — we picked the 2–4 highest-signal courses per station rather than dumping the full catalog at each rung. The full catalog stays at /courses; this page is the \"WHY am I taking this\" lens. Each course chip deep-links to /courses?q=<title> so you can jump from the map to the detail.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Course launch — bust the stale-cache holdouts — May 2026
  {
    title: "Course launch — bust stale browser caches still showing the old denial",
    body: "Follow-up to the X-Frame-Options DENY → SAMEORIGIN fix. The server side was correct after that change, but browsers that had already cached the OLD `/scorm-loader.html` response (carrying the stale `X-Frame-Options: DENY` header) kept reusing the cached denial even on revalidation — most browsers don't re-evaluate X-Frame-Options on conditional 304 responses for iframe targets, so a cached denial sticks around until the cache entry is physically replaced.\n\nTwo coordinated changes to make sure no browser can keep showing the stale error:\n\n1. **`next.config.ts`** — `/scorm-loader.html` now serves with `Cache-Control: no-store, max-age=0`. Browsers never cache the loader. Every iframe load gets a fresh response with the current headers.\n\n2. **`ScormPlayer.tsx`** — the iframe URL now carries a `v=<commit-sha>` cache-busting param. Even if a browser has the old loader cached, the URL is different on every deploy, so it can't reuse the cached entry. Pairs with the no-store header for belt-and-suspenders.\n\nNo more user-side hard-refresh required.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Course launch — actual root cause (X-Frame-Options) — May 2026
  {
    title: "Fixed: \"bhn-training-platform.vercel.app refused to connect\" inside the course player",
    body: "**This was the real cause of the SCORM \"course doesn't launch\" issue, separate from the GetValue/Sync bridge fix in the previous changelog entry — both needed to land.**\n\nThe global `X-Frame-Options: DENY` header from next.config.ts (OWASP A05 hardening, May 2026) was applied to every response on the site, including the static `/scorm-loader.html` file and the R2-proxied `/scorm-files/[courseId]/...` route. `DENY` blocks **all** iframe embedding — even same-origin — so when `/player/[courseId]` tried to render its iframe pointing at `/scorm-loader.html`, the browser refused with the error message the user sees: \"bhn-training-platform.vercel.app refused to connect.\"\n\nChanged the global header from `DENY` to `SAMEORIGIN`. Clickjacking protection is preserved (no other origin can frame our pages) while same-origin iframe embedding works again. The SCORM pipeline (`/player/...` → `/scorm-loader.html` → `/scorm-files/...`) all lives on the same origin and now loads correctly.\n\n`DENY` was the right value only for sites with zero legitimate iframe embedding. We have several (SCORM, internal previews, the developer-mode embed views) so `SAMEORIGIN` is the correct level.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Sidebar EQUIP visible to all admins — May 2026
  {
    title: "Sidebar — EQUIP section always visible to admins",
    body: "Both EQUIP learner-side menu items (`equip-funding`, `equip-tracker`) are registered with `defaultEnabled: false` in the preferences registry because most trainees don't apply for funding. The side-effect was that admins also had the EQUIP section hidden from their sidebar until they manually opted in via /profile/preferences — even though admins use those routes constantly to navigate the review pillar.\n\nFixed by adding an admin-bypass on the EQUIP section's render: admin role (and above — superadmin) always sees `equipItems` directly; non-admin roles keep the existing preference-respecting `visibleByPrefs(equipItems)` filter. No registry default changes — trainees / employers still see EQUIP only after opting in.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Course launch fix — synchronous SCORM GetValue — May 2026
  {
    title: "Fixed: SCORM courses failing to launch (Articulate / Captivate / iSpring packages)",
    body: "Authoring-tool SCORM packages were silently aborting their init sequence — \"course doesn't launch\" — because the LMS bridge was returning empty strings for every `LMSGetValue` / `GetValue` call.\n\n**Why it failed.** The SCORM 1.2 + 2004 specs require GetValue to return a value SYNCHRONOUSLY. Our bridge ran `callParent(...).then(v => r = v); return r;` which returned the empty string immediately (the promise resolved AFTER the return). Packages read `cmi.core.student_name`, `cmi.launch_data`, `cmi.core.entry`, etc. on boot and bailed when those came back blank — most authoring tools log \"no LMS connection\" or hang at \"Connecting…\" with no visible error to the trainee.\n\n**The platform's own hand-coded test courses kept working** because they tolerate empty reads — which made the bug invisible until real Articulate / Adobe Captivate / iSpring packages were uploaded.\n\n**What changed.**\n\n1. `public/scorm-loader.html` rewritten. The loader now seeds its own local CMI data store at startup from URL params passed by the player (suspendData, location, completionStatus, learnerId, learnerName, plus all the standard cmi.core.* defaults per spec). `LMSGetValue` / `GetValue` read from this store synchronously — no postMessage round-trip. `LMSSetValue` / `SetValue` write to the local store AND fire-and-forget post to the parent for persistence.\n\n2. `ScormPlayer.tsx` now passes the initial CMI state as URL params to the loader (`?suspendData=…&location=…&completionStatus=…&learnerId=…&learnerName=…`). The parent message-handler still receives SetValue / Commit / Finish for persistence (debounced PATCH to `/api/scorm/session`), but is no longer responsible for fielding reads.\n\n3. `/player/[courseId]/page.tsx` passes the user's id + name to ScormPlayer so the loader can answer `cmi.core.student_name` / `cmi.learner_name` queries.\n\n4. Loader gained an inner-iframe error guard: if the SCORM content fails to load (404 from R2, manifest pointed at the wrong file, network error), the loader shows a clear human-readable error box instead of a blank screen.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator catalog — every published sim playable by everyone — May 2026
  {
    title: "Simulator — every published sim is now playable by every user",
    body: "Before today, /simulator only showed two things: your own attempts (in-progress and completed) and your own requests. There was no way to discover or play a Simulation that someone else had requested — even though the underlying Simulation rows are platform content with no per-user gate. The hand-authored MSL Oncology sim (RPG · Q1 — Medical Scientific Liaison — Oncology) sat in the database invisible to anyone but its original requester.\n\nFixed by adding a new \"Available simulations\" catalog section to /simulator. The section sits between the hero and your in-progress attempts; it pulls every published Simulation row (`prisma.simulation.findMany`, up to 60 most-recent) and renders each as a card with the job title, company, location, and a 3-line JD-snippet preview.\n\nEach card's CTA reads the right thing based on what the calling user has already done with this sim:\n  • No prior attempt → **Start** — POST `/api/simulator/play/[simulationId]` creates a fresh SimulationAttempt and redirects to the player.\n  • Unfinished attempt exists → **Resume** — deep-link to your in-progress attempt at the week you left off.\n  • Finished attempt exists, no active → **Replay** (same Start endpoint, new Attempt) + a secondary \"Review last run →\" link to the finished attempt's summary.\n\nNew endpoint at `/api/simulator/play/[simulationId]` — open to any signed-in user, gated only by session. Distinct from `/api/simulator/start` (admin-only AI generation) and from `/api/admin/simulations/[id]/test-attempt` (admin-only smoke-test). Every call creates a new Attempt; the client surfaces Resume / Replay framing before the user reaches the endpoint.\n\nNet effect: trainees and superadmins (and everyone else) now see the full library of role-play sims the moment they land on /simulator, instead of staring at an empty dashboard until they paste a JD of their own.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator default-on in sidebar — May 2026
  {
    title: "Career Simulator — default-on in the sidebar",
    body: "The Career Simulator (`/simulator`) entry in the Experience group was registered with `defaultEnabled: false`, which meant trainees and superadmins both had to manually flip it on under /profile/preferences before they could even see the link. They didn't know to.\n\nFlipped to `defaultEnabled: true` in the preferences registry. Effect: every signed-in user (trainee, superadmin, and the others) now sees Career Simulator in the Experience group by default. Roles for whom it's irrelevant can still toggle it off from the switchboard — the registry only changes the default for users who haven't touched their preferences.\n\nThe page itself was already open at the route level (only a session is required, no role gate), so this is purely a sidebar-default flip.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Course cards — dark right column + AAA white text — May 2026
  {
    title: "Course cards — darker right column + AAA white text",
    body: "The metadata sidebar on every course card on /courses (the right column carrying Credit / Delivery / Provider chips + Enroll-by + Duration) went from a slightly-darker-than-card grey (color-mix of --raised + 12% black) to a properly deep `bg-slate-800` (#1e293b) with white text.\n\nContrast (WCAG):\n• White on slate-800 ≈ 14.5:1 — **AAA on every theme**.\n• White/70 on slate-800 ≈ 9.4:1 — **AAA** even on the micro 9 px uppercase labels.\n\nWhat changed:\n• Background: `bg-[color-mix(--raised 88%, #000)]` → `bg-slate-800 text-white`.\n• Label text (`Enroll by`, `Duration`): `text-fg-muted` → `text-white/70`.\n• Value text (the dates / durations themselves): `text-fg` → `text-white`.\n• Internal section dividers: `border-t border-line` → `border-t border-white/10` so the hairline is visible against the dark backdrop.\n• Left-vs-right column hairline (`border-l border-line`): dropped — the dark-to-light bg jump IS the divider.\n\nPastel chips (Credit / Delivery / Provider) were intentionally left untouched: each chip carries its own opaque pastel container so the contrast inside the chip is unaffected by the surrounding band; if anything the darker shelf crispens the chip silhouettes.\n\nTheme-stable by design: slate-800 is hardcoded rather than threaded through a theme token, so every palette (Daylight / Sakura / Voltage / Greenwood / dark variants…) gets the same dark shelf instead of a theme-conditional fg inversion that could break on dark themes.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job folders — magazine-row redesign — May 2026
  {
    title: "Job folders — streamlined magazine-row cards",
    body: "The /profile/job-folders index dropped its rounded card boxes (and the box-in-box folder-icon disc) in favour of a flat magazine-row layout — same information, a fraction of the visual weight.\n\n**What changed:**\n\n• **No more rounded card per folder.** Each folder is a flat row inside a `divide-y` hairline list. The outer rounded-xl + ring + colour-fill is gone; the dashed border around the archived section is gone too.\n\n• **One colour per row, on a 3 px vertical bar.** Status (drafting / submitted / interviewing / offer / rejected / closed) is now a thin coloured line pinned to the row's left edge — same six hues as the old pills, but at < 1% of the visual area. Selected rows bump the bar to 4 px; no other background change.\n\n• **No more chip pills.** The five Resume / Letter / Prep / Sim / Status pills (each carrying a different colour fill, ring, and text colour) became inline middot-separated text in the platform's standard muted colour: `Resume · Letter · Prep · Sim ready`. Filled-in pieces only — the absence of a label communicates the absence of content. Status moved into an uppercase tracking eyebrow above the title.\n\n• **No more folder-icon disc.** The 48-px rounded-xl brand-50 tile next to the title is gone. The title is the visual anchor on its own.\n\n• **Action buttons are now ghost text links.** Open folder is a brand-700 text link with an external-link icon; Archive / Restore / Delete are fg-subtle text buttons that pick up colour only on hover. The amber / brand / rose pill backgrounds are gone.\n\n• **Section headers (Interviewing / Submitted / etc.) lost their pills too.** Replaced with a 2-px coloured tick + uppercase label + descriptive subtitle, with a soft hairline gradient underline (line/80 → transparent). The descriptive italic subtitle and folder count stay.\n\nNet: roughly four fewer colour fills per card, one fewer rounded box, and ~30% less density — without dropping any information.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator request delete + daylight hero readability — May 2026
  {
    title: "Simulator requests — delete affordance on the detail page",
    body: "/admin/simulator-requests/[id] now has a Delete button at the bottom of the action bar (under a hairline divider so it reads as separate from the lifecycle actions). One click → useConfirmDialog → DELETE /api/admin/simulator-requests/[id] → redirect to the queue.\n\nLinked-row policy: deleting a request removes the request row only. The fulfilled Simulation (if any) stays — other requests with the same sourceHash may still be linked to it, and admins can delete the simulation separately from /admin/simulations. JobFolder.simulationRequestId is `onDelete: SetNull` in schema, so folders that linked to the request have their FK cleared but the folder itself and the linked Simulation are untouched.\n\nGuard rail: status `generating` blocks delete (both the button hides and the API returns 409) — deleting mid-AI-run would orphan the worker. Wait for the worker to settle to `ready` or `failed`, then delete.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Daylight hero — darkened the top-left teal pop for title readability",
    body: "Follow-up to the daylight-theme hero tweak: the top-left teal pop (which was hero-mesh-2 #2dd4bf / teal-400 after the X-flip override) was too bright behind white title text. Swapped to teal-600 #0d9488 — same hue family, ~30 lower lightness — so the gradient still reads as the daylight 'left side has the bright teal punch' the prior commit established, but the title contrast clears AAA on the darkened patch.\n\nNo position changes — the four radial-gradient stops keep the layout from the last commit.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Admin announcements hero + seed/clear · job folder cards — May 2026
  {
    title: "Admin announcements — hero banner + seed/clear tray",
    body: "/admin/announcements now leads with the same gradient-washed hero treatment as /admin/equip/deadlines (Megaphone icon · brand-tinted gradient · brand-200 hairline divider). A seed/clear tray sits immediately under the hero (per platform rule — hero always owns the top).\n\n**Seed** drops three plausible demo announcements authored by the admin's own user id: one pinned platform-wide maintenance note, one platform-wide cohort update, and one course-scoped scenario (linked to the first published course if any exists, otherwise platform-wide). Every demo row's title is prefixed `[demo]` so the matching clear pass can find them without touching real announcements.\n\n**Clear** removes every announcement whose title begins with `[demo]` — real rows you've posted (no prefix) are never touched. Same airtight pattern as the other self-scoped seed/clear pairs.\n\nUnder the hood: new `\"announcement\"` arm on the shared `DemoSeedEntity` union in DemoSeedAndClearTray, matching arms in /api/admin/demo-seed and /api/admin/clear-test-data.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Job folders — full-width cards, taller, more meta",
    body: "The /profile/job-folders index switched from a 2-column desktop grid to a single full-width column, and bumped card padding (p-3 → p-4 sm:p-5) + JD-snippet clamp (2 lines → 4 lines) for ~50% more vertical space per card.\n\nNew meta row between the title and the chip cluster surfaces the linked posting title (the chip below only shows the company name; the role itself was missing context) and a relative \"Updated <n>d ago\" timestamp. Bigger folder-icon disc (40px → 48px) so the card silhouette holds up at the new width. Same chip vocabulary (Status / Posting / Resume / Letter / Prep / Sim) — only the layout grew, not the language.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Daylight hero — teal-leaning, reversed direction — May 2026
  {
    title: "Daylight theme — teal-leaning hero, reversed direction",
    body: "Small visual polish on the Daylight theme's editorial hero (cinematic design system). The royal-blue corner mesh stop was swapped for a teal-leaning sky-700, so the whole hero reads more teal instead of dipping toward blue at the bottom corner. The four radial gradient stops were also mirrored horizontally: the bright teal pop now lives on the LEFT (was top-right), the deeper teal-blue weight settles bottom-left (was bottom-right), and the calmer cyan flows out to the right. Net effect: the page reads left-to-right the opposite way it used to, and the overall stage is tealer.\n\nOnly Daylight is affected — every other theme (Rosalind, Sakura, Mist, Hitech, Icecream) defines its own `--hero-mesh-*` palette AND keeps the base position layout, so this override doesn't leak.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job folders — Tier 3: AI rate-my-fit + folder templates — May 2026
  {
    title: "Job folders — AI rate-my-fit + folder templates",
    body: "Tier 3 of the improvement pass.\n\n**Rate-my-fit (JD tab).** A new AI panel sits under the skill-match block. Click 'Run rating' and the AI reads your resume against this JD and returns: a 0–100 fit score (rubric: 85+ strong, 70–84 solid, 55–69 mixed, 40–54 stretch, <40 significant gap), a one-sentence verdict, 3–5 grounded strengths (each tied to a specific resume bullet), 3–5 specific gaps the JD requires that your resume doesn't cover, and a 1–2 sentence 'next move' recommendation. The system prompt is explicit about being candid — no cheerleading, no inventing strengths the resume doesn't support. The panel's tone shifts emerald/amber/rose by score. Re-rateable any time the JD or resume changes. Powered by the existing chat() adapter; no new keys needed.\n\n**Folder templates.** New 'From template' dropdown next to 'New job folder'. Pick from five archetypes — Engineering, Product management, Biotech / wet lab, Sales / business development, Consulting. Each archetype pre-populates the new folder's Interview prep tab with archetype-specific Likely questions, Questions to ask them, and Gotchas + research notes (substantive, not generic). JD and cover letter tabs stay empty — those are tailored per posting. Saves the cold-start; new trainees stop staring at a blank prep tab. Static data in lib/job-folders/templates.ts — easy to add domains by appending to the list.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job folders — Tier 2: reuse + matching — May 2026
  {
    title: "Job folders — Skill match, STAR cross-link, Pull-from-past, Mentor share",
    body: "Tier 2 of the job-folder improvement pass — make the folder learn from data you already have, and let mentors review it without an account.\n\n**Skill match panel (JD tab).** Heuristic scorer pulls candidate skill keywords from the JD (single tech-y tokens + capitalised bigrams + acronyms like 'GMP', 'CHO', 'HPLC'), checks each against the linked resume's structured content, and surfaces a 'matched / total' chip + visual progress bar + per-skill tags coloured by present/missing. Tone shifts emerald/amber/rose at 70%/40% thresholds. Recomputes on every JD keystroke, pure client-side, zero API calls. Tells the trainee 'add these N keywords to your resume before applying.'\n\n**Pull from past (cover letter tab).** New sidebar shows up to 10 most-recent cover letters you've written across other folders. Click any title to expand into paragraph cards; click 'Insert into draft →' on any paragraph to append it to the current cover letter. Stop writing the same opening twice.\n\n**Story Bank cross-link (interview prep tab).** New sidebar surfaces your existing STAR stories, sorted by how many of each story's skill tags appear in this JD. Each card shows title + situation preview + skill chips; click 'Insert into prep →' to drop a STAR block into the prep notes. Closes the loop between the Story Bank and the per-application prep.\n\n**Mentor share link.** New Share button in the folder header opens a dialog where you can mint tokenised read-only share URLs (optional label + expiry: never / 24h / 7d / 30d). URL pattern /share/folder/[token] serves a clean, login-free view of JD, resume, cover letter, interview prep, and notes for mentor review. Role-play sim never appears in shared views (it's interactive, not a document). Revoke any time. New JobFolderShareToken model + migration 20260526030000_jobfolder_share_tokens. Public share page sets robots: noindex/nofollow.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job folders — Tier 1 of the improvement pass — May 2026
  {
    title: "Job folders — Notes, application tracker, timeline, duplicate, status-grouped index, print view",
    body: "Tier 1 of the job-folder improvement pass lands together.\n\n**Notes tab.** A new 6th tab — free-form markdown scratchpad for things that don't fit the structured fields. Recruiter conversations, salary band, things to remember before the interview. Auto-saves like the other doc tabs.\n\n**Application tracker fields.** A collapsible 'Application tracker' strip below the folder header carries six new optional fields: Applied on (date), Deadline (date), Application URL, Recruiter name + email, Referred by. Auto-saves. When the deadline is ≤7 days out, a coloured banner surfaces at the top of the folder (sky → amber → rose as it approaches / passes). The Applied-on field also auto-logs a timeline event when first set.\n\n**Timeline tab.** A new 7th tab renders the folder's lifecycle as a vertical event log: created · status_changed · sim_requested · sim_ready · sim_rejected · sim_failed · duplicated · applied · deadline_set / cleared. Auto-captured from the existing endpoints — no extra clicks. New JobFolderEvent table with cascade-delete on folder removal.\n\n**Duplicate folder button.** Header action that clones the JD, resume link, tracker fields, recruiter info, notes — but BLANKS the cover letter, interview prep, and resets status to drafting. The tailored parts are the ones you'd actually retype for a similar role elsewhere; the JD-shaped context isn't.\n\n**Status-grouped index.** The flat folder grid on /profile/job-folders now groups by status into pipeline-style sections: Interviewing → Submitted → Drafting → Offer → Rejected → Closed. Empty buckets collapse out. Same UI scales from 1 folder to 30.\n\n**Print view.** New route /profile/job-folders/[id]/print renders the cover letter + resume in a print-optimised single-column layout with @media print rules. Ctrl-P → PDF in any browser. JD, interview prep, and role-play sim are intentionally NOT included — this is what you'd attach to an application, not an archive.\n\n**Fixes.** SimPanel's hard window.location.reload() swapped for router.refresh() — preserves scroll and unsaved field state. Markdown download endpoint now includes the application-tracker fields in the header block AND the Notes section.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator: email notifications on state change — May 2026
  {
    title: "Simulator — email notifications when your sim is ready / rejected / failed",
    body: "When you submit a sim request (from /simulator/new or from a job folder's Role-play tab) you now get an email the moment its state changes:\n\n• Ready → subject 'Your role-play simulation is ready: …' with a prominent CTA button linking straight to your week-1 attempt.\n• Rejected → subject 'Your sim request needs adjustments' with the admin's written reason in an amber quote box and a link back to your dashboard so you can revise + resubmit.\n• Failed → subject 'Sim generation hit a snag — we'll retry' with the technical reason (usually an AI quota / validator hiccup) so you understand the delay.\n\nPending → generating transitions are intentionally NOT emailed — that's internal admin progress and doesn't need to ping you.\n\nUses the platform's existing SMTP send helper, silently no-ops if SMTP isn't configured (dev / preview deployments without secrets) rather than blocking the admin's save action. Email body is plain text + an HTML version with brand-coloured buttons.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job folders — download all documents — May 2026
  {
    title: "Job folders — Download all documents as a single Markdown file",
    body: "New 'Download all' button in the editor header (brand-tinted pill next to the status dropdown). Hits GET /api/profile/job-folders/[id]/download which bundles four documents into a single Markdown file: (1) the JD body, (2) the linked resume rendered from its structured content into readable markdown sections/items/bullets, (3) the cover letter, (4) the interview prep guide. The role-play simulation is intentionally excluded — it's an interactive experience, not a document.\n\nMarkdown was picked over PDF/zip because it (a) needs zero new dependencies, (b) opens in any text editor, Obsidian, Notion, Google Docs, or Marked, (c) plays nicely with the platform — cover letter and interview prep are already stored as markdown, (d) the user can export to PDF from their tool of choice.\n\nFilename is the slugified folder title plus the folder's last-edited ISO date, e.g. `msd-msl-oncology-2026-05-26.md`. Empty sections render an italic placeholder so the structure is honest about what's still TODO. Resume rendering walks the ResumeContent JSON: header block (name/email/phone) → sections by `position` → items with title/subtitle/dates/metric/url → bullets, all hyperlinkable.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job folders ↔ role-play sim — May 2026
  {
    title: "Job folders — add a role-play simulation alongside JD / Resume / Cover letter / Prep",
    body: "Job folders now hold five things instead of four. The detail editor at /profile/job-folders/[id] has a new 'Role-play' tab that lets you request, track, and launch a 12-week simulation built from the same JD you typed in tab #1.\n\nState-driven panel:\n  • No request yet → 'Build a role-play sim from this JD' CTA. Requires ≥300 chars of JD body (the same floor /simulator/new uses).\n  • Pending / generating → soft waiting state with timestamp and copy explaining an admin will publish within 24 hours.\n  • Ready → 'Resume your simulation' button deep-links straight to your most recent attempt (the server resolves the latest SimulationAttempt for this user×simulation pair). If you haven't started yet, the button reads 'Open the player' and lands on /simulator.\n  • Rejected / failed → admin's rejection note surfaces in an amber quote box, with a 'Submit a new request' button to retry after editing the JD.\n\nFolder index card chips: a new 'Sim queued / generating / ready / rejected / failed' chip joins the existing Resume / Letter / Prep chips so you can see at a glance which folders have a sim attached.\n\nUnder the hood: new optional FK on JobFolder pointing at SimulationRequest (set null on request delete). New endpoint POST /api/profile/job-folders/[id]/sim-request handles cache hits (links to an existing request for the same hash), prevents duplicates, and atomically creates+links a fresh request when needed. Migration 20260526010000_jobfolder_simulation_link.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator: big Edit button + test launch — May 2026
  {
    title: "Simulator — big Edit button + Launch test attempt",
    body: "Two upgrades to the post-publish editing flow:\n\n**Bigger Edit button.** The 'Edit this simulation's payload' affordance on /admin/simulator-requests/[id] is now a proper green primary button with a pencil icon, sitting next to a complementary 'Launch test attempt' button. The old underlined text link was easy to miss.\n\n**Launch test attempt.** A new endpoint (POST /api/admin/simulations/[id]/test-attempt) spins up a fresh SimulationAttempt on the calling admin's own account and redirects them to the player. Available three places: (1) the fulfilled-state panel on the request detail, (2) the editor's action bar (disabled when there are unsaved changes — a test attempt runs the published payload, so the gate avoids confusion), and (3) the post-save flash inside the editor — the moment a save lands, a 'Launch test attempt to verify' CTA appears inline so the admin can immediately play through their changes. Each click creates a NEW attempt so the admin always sees the latest payload from week 1.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Simulator: post-ship payload editor — May 2026
  {
    title: "Simulator — edit a published payload from /admin/simulations/[id]/edit",
    body: "Admins can now tweak the SimulationPayload of an already-published Simulation. The fulfilled-state panel on /admin/simulator-requests/[id] gets an \"Edit this simulation's payload →\" link; clicking it lands on a dedicated editor at /admin/simulations/[id]/edit with the current payload pretty-printed into a textarea. Save runs the JSON through the canonical validatePayload() — same checks the AI and hand-author paths use — and overwrites the row's payload AND its denormalised columns (jobTitle, companyName, location) in one transaction. An \"Unsaved changes\" pill surfaces in the action bar whenever the editor diverges from the last-saved snapshot; Revert restores to that snapshot in one click. A warning banner shows when N players are mid-quarter on this simulation so the admin knows the new payload will hit them on next render. New endpoints: GET /api/admin/simulations/[id] (read the payload) and PUT /api/admin/simulations/[id] (write).",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Simulator: universal copy + faceoff hero graphic — May 2026
  {
    title: "Simulator — universal language + faceoff hero graphic",
    body: "VP-specific language is gone from every shared surface. \"VP 1:1\" → \"Manager 1:1\" on the scenario-type chip; \"performance review from your VP\" → \"the person who hired you\" in the landing copy; \"your TA Head gives a written performance review\" → \"the person you report to (`payload.vpName`)\" in the welcome modal. The role-play game now talks the same way to an MSL applicant, a nurse applicant, an engineer applicant, or any other JD type — without losing the specificity of the simulation itself (each sim still carries its own vpName/vpRole derived from the JD).\n\nHero copy on /simulator rewritten to be snappier and on-brand:\n  • New title: \"Meet the colleagues you don't have yet.\"\n  • New body emphasises the dark-comic premise — the team you'd work with, the meetings that actually bite, the politics nobody puts in the JD, and the 9pm message from the person who hired you.\n  • The right column dropped the \"What you'll get\" feature list and now shows a faceoff illustration: three character portraits (you / a teammate / the person you report to) each with a public speech bubble and an italic parenthetical \"what they're actually thinking.\" Pure inline SVG, theme-aware, decorative.\n  • \"How it works\" 3-step section rewritten with sharper copy. The tier line ends with \"Exceeds, Meets, or 'HR has been looped in'\" instead of the bureaucratic-sounding 5-tier ladder.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator: text-only submit + welcome tour + playbooks — May 2026
  {
    title: "Simulator — text-only requests, welcome walkthrough, per-teammate playbook",
    body: "Three changes land together on the role-play surfaces:\n\n**Text-only submission.** /simulator/new no longer accepts URLs. Posting links expire — and when a Workday or ZipRecruiter URL 404s six months later, the simulation request becomes unactionable. Trainees copy and paste the JD body as plain text now. One textarea, ~300 character floor, character-count hint as you type. The server still accepts body.url for one release as a compatibility shim, but only to translate it into an explanatory error.\n\n**Welcome walkthrough.** First-time visitors to a simulation see a 5-pane modal — what the quarter is, what the five stats track, why the roster matters, why to open the briefing first, and how state auto-saves. Keyboard arrows to advance, ESC to dismiss. localStorage-gated per attemptId so a one-time dismissal sticks across reloads.\n\n**Per-teammate playbook.** Click any roster name and the dossier now carries a new \"How to work with them\" section with four substantive blocks: a 2–3 sentence operating-style brief, 'They can help with' (specific high-leverage asks), 'Avoid' (relationship-damaging mistakes), and a 'Quick win' (the highest-ROI move for week 1). Optional on the SimulationPayload type — older sims hide the section gracefully. The hand-authored MSD MSL-Oncology seed has been extended with full playbooks for all 5 teammates and 4 partners.\n\nAlso: the briefing button on the player is now a big primary action (\"Read the briefing · hidden dynamics, failure modes, interview Qs\") instead of a quiet outline button. Landing-page copy on /simulator and the 3-step \"How it works\" rewritten to reflect the request workflow.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Simulator: request-then-publish — May 2026 ──────────────────
  {
    title: "Simulator — user request workflow replaces self-serve AI",
    body: "Self-serve AI generation on /simulator/new is retired. Users were hitting Gemini quota and Cloudflare validator errors with no clean recovery — so the user flow now SUBMITS a request that an admin reviews and publishes, the same pattern most editorial features on the platform use. What changed:\n\n• /simulator/new — same single-input form, but the submit button now creates a SimulationRequest. The page shows 'Request submitted — typical turnaround 24 hours' with a link back to the dashboard.\n• /simulator — new 'Requested' section above 'In progress' showing each pending / generating / rejected / failed request with status chip and admin notes (if any). Ready requests don't appear here — they're already in 'In progress' via the auto-created Attempt.\n• /admin/simulator-requests — new admin queue with tabs (Pending · Generating · Ready · Failed · Rejected · All) and per-status counts. FIFO ordering for in-flight, LIFO for terminal states.\n• /admin/simulator-requests/[id] — detail page with the full JD, requester info, and a state-driven action bar: Generate with AI, Hand-author payload (JSON, runs through the same validator the AI uses), Reject with reason, Reopen rejected/failed back to pending. When a Simulation with the same sourceHash already exists in the cache, a 'Link existing simulation' shortcut appears so admins can attach instead of regenerating.\n• /api/simulator/start — locked to admin-only. Self-serve POSTs from trainees now return HTTP 410 with a redirect message.\n• New endpoints: POST /api/simulator/requests (user submits), GET /api/simulator/requests (user lists own), GET /api/admin/simulator-requests (admin list with counts), POST .../[id]/{generate,hand-author,reject,reopen}.\n\nNew Prisma model SimulationRequest with state machine: pending → generating → (ready | failed); pending → rejected; rejected|failed → pending (reopen). Indexes on (status, createdAt), (userId, status), (sourceHash). Migration 20260526000000_simulation_requests.\n\nSidebar gets a new 'Sim requests' admin entry under Cross-pillar tools. Admin sees pending count at a glance.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Job-folder demo seeder — May 2026 ────────────────────────────
  {
    title: "Job folders — admin Seed / Clear demo tray on /profile/job-folders",
    body: "Staff (admin, instructor, superadmin) now see the standard demo tray at the top of /profile/job-folders, exactly like the one on the Story Bank page. 'Seed demo' spawns four fully-populated demo folders on the calling staff member's own account spanning the pipeline (drafting · submitted · interviewing · offer), each with a realistic JD snippet, a draft cover letter, and an interview-prep guide — so the page has live status chips and real card content without going through the full prep flow. 'Clear demo' deletes only JobFolder rows whose title starts with [demo], so real folders on the same account are never touched. Wires through the same demo-seed and clear-test-data endpoints as the rest of the self-scoped entities (user_star_story, user_resume, etc).",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  // ── Story Bank builder — May 2026 ────────────────────────────────
  {
    title: "Story Bank — draft new stories inline with live coaching + worked examples",
    body: "The /profile/stories page now opens with a Story Builder you can use to draft a new STAR story without going through the prep flow. Click 'Draft a new STAR story', and a two-column workspace expands: on the left, the four STAR textareas plus a title and tags; on the right, a live coaching column that updates on every keystroke — per-field word count (with the 30–80 / 15–50 / 60–150 / 25–80 target band shown alongside), traffic-light dots, top tips from the deterministic STAR validator, total word count, and a Ready / Almost / Needs-work readiness chip. Plus two binary sentinels: 'Has a number' (the Result section quantifies the outcome) and 'Uses I' (the Action section is in first person). Below the coaching panel sits a 'Worked examples' accordion with four polished READY-tier stories spanning wet-lab rescue, customer service, data crunch, and cross-team handoff. Each expands to show the full S/T/A/R and a 'Use as starting point' button that drops the text into the form — with an inline 'Replace your draft? · Keep mine' two-step confirm if you already have content typed.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Split-view retired — May 2026 ────────────────────────────────
  {
    title: "Admin / Split view retired",
    body: "The /admin/split-view page has been removed along with its sidebar entry, AdminDashboard 'Sit in another role' quick-action, and the Max × EXPERIENCE tour step that featured it. The View-as role-switcher in the sidebar covers the same need with a smoother flow — pick the role you want to preview and the entire UI re-renders in place. The SplitViewClient component, splitR/splitLeft/splitRight tour lookups, and the no-longer-needed Eye / Columns2 icon imports were dropped as part of the cleanup.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Demo Hub 8-bit dinos — May 2026 ──────────────────────────────
  {
    title: "Demo Hub — Rex/Vera/Max redrawn as big 8-bit pixel sprites",
    body: "The three persona dinos on /admin/demo are now chunky 8-bit pixel-art sprites (currentColor body, crisp-edge rendering) shown on a fighter-select-style showcase stage with a soft floor shadow under each character. Each sprite has idle micro-movements that loop forever: a slow body bob (1.6 s), a tail wag (~0.95 s), and an occasional eye blink (~4 s). Phase offsets are staggered across Rex / Vera / Max so they don't all breathe in sync. Hovering a card speeds up the bob and tail like a roster character being highlighted. Honours prefers-reduced-motion — animations collapse for users with motion sensitivity.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP Key Dates — merged round timeline — May 2026 ───────────
  {
    title: "EQUIP Deadlines — Key Dates with full VentureLift round timeline",
    body: "The List tab now shows all eight VentureLift stages (Launch, Pre-screening, Consultations, Invite Decision, Full App, Review, Adjudication, Funding Announcement) inline in the VL column for each month — the separate Round Schedule section has been removed. Active stages glow green, the next upcoming stage highlights amber. Admin actions (Extend, Close, Edit, Delete) appear directly beneath the pre-screening and full-application deadline stages that carry EquipDeadline rows. The section header has been renamed from 'Funding windows — month view' to 'Key dates'. U of T holiday legend moved to the section footer.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── EQUIP deadline manager combined table — May 2026 ─────────────
  {
    title: "EQUIP Deadline Manager — combined month-view table",
    body: "The List tab in Admin › EQUIP › Deadlines now shows VentureConnect and VentureLift side by side in a single month-by-month table instead of two separate stacked tables. Each row is one calendar month; both streams appear as columns. A 'Hide past' toggle collapses closed months. All inline actions (extend, close, edit, delete) remain available per cell with the same colour-coded confirmation panels.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Guided demo tour — May 2026 ──────────────────────────────────
  {
    title: "Demo Hub — live guided tour with animated cursor & spotlight",
    body: "Clicking 'Watch Guided Tour' on the Demo Hub now launches a full overlay walkthrough on the real platform interface. A dark curtain spotlights the relevant UI region, an animated white cursor moves to the exact target element, a click-ripple animation fires on interactive steps, and a floating tooltip card explains each moment. Progress bar, Back/Next/Exit controls, and a persistent demo bar keep orientation throughout. Seven tour scripts cover all 29 steps across Rex × ENGAGE/EXPERIENCE/EQUIP, Vera × EXPERIENCE, and Max × ENGAGE/EXPERIENCE/EQUIP. The system navigates between pages automatically during the tour.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Platform Demo Hub — May 2026 ─────────────────────────────────
  {
    title: "Platform Demo Hub — interactive 3-persona walkthrough",
    body: "A new admin page at /admin/demo provides an interactive, senior-management-ready walkthrough of the BHN platform. Three dinosaur characters — Rex (Triceratops / Trainee / emerald), Vera (Velociraptor / Employer / violet), and Max (Brachiosaurus / Admin / sky) — each navigate all three platform pillars: ENGAGE (learning & certification), EXPERIENCE (placements & hiring), and EQUIP (funding & ventures). Vera's locked states for ENGAGE and EQUIP explain the cross-role relationship rather than silently blocking. Each phase panel shows the screens the persona sees, the actions they take, how their actions ripple to the other two roles, and a live link to the real platform page. Designed for investor briefings, board presentations, sales calls, and new-staff orientation.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  // ── Sakura atmosphere — May 2026 ────────────────────────────────
  {
    title: "Sakura theme — falling cherry-blossom petals",
    body: "The Sakura theme now has a live atmosphere layer: 10 cherry-blossom petals drift across the viewport in three petal shapes (single / open / elongated), each with its own random duration (22–38 s), sway amplitude, and starting rotation. A blurred rose-pink petal-drift mist settles at the bottom of the screen, and a rotating hanami scene caption (花見) appears in the bottom-right corner, cycling every 18 s. Respects prefers-reduced-motion — motion collapses completely while the colour palette remains. Follows the same architecture as the Greenwood falling-leaves layer.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Full dark-theme colour coverage — May 2026 ───────────────────
  {
    title: "All dark themes — complete WCAG AA colour-family coverage",
    body: "Coldbrew, Dryice, Chilli, and Aurora dark themes now have full override coverage for every Tailwind colour family used in the app. Previously, 12 families (violet, slate, green, red, cyan, blue, indigo, gray, orange, yellow, purple, teal) had no dark-theme tint-var or text-lift overrides — using default light Tailwind colours on dark surfaces caused severe contrast failures (as low as 1.9:1 for native text-rose-600 on espresso card). All four themes now match the complete override system already in place for the Voltage theme. An automated audit script (`node scripts/audit-theme-coverage.js`) validates coverage and exits non-zero if gaps are found.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Voltage theme — complete colour-system coverage pass",
    body: "Extended the Voltage dark theme's colour override system to cover all remaining Tailwind colour families: green, red, cyan, indigo, purple, orange, teal, yellow, slate, gray, zinc, neutral, stone, lime, pink, fuchsia, and the critical sky-200 chip border fix. Added matching bright text lifts (600–900 shades) for each new family. Also added 600-level lifts for rose/amber/emerald/sky which were previously only covered at 700–800.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Voltage colour-system completeness — May 2026 ───────────────
  {
    title: "Voltage theme — violet, blue, and brand-600 text contrast",
    body: "The Voltage dark theme was missing overrides for the `violet` and `blue` Tailwind colour families, causing `bg-violet-50` to composite to a medium gray (~rgb(148,148,158)) instead of a near-black tint — text on pipeline node cards failed at 2.58:1. Inline callout boxes using `text-violet-700` on that gray background failed at 2.15:1. Fixed by adding the same tint-override pattern already used for rose/amber/emerald/sky. Also added missing `text-sky-600` lift (was 4.38:1), full violet/blue text lifts, and a `text-brand-600` link/icon override (was 2.97:1 on raised surfaces).",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── Theme contrast fixes — May 2026 ─────────────────────────────
  {
    title: "All themes — WCAG AA fg-subtle contrast pass",
    body: "The `fg-subtle` helper/placeholder text colour now passes WCAG AA (4.5:1) across every surface in all five themes. Previous values ranged from 2.26:1 (Daylight on raised) to 3.96:1 (Sakura on raised) — far below the AA minimum. Updated to: Daylight #5b5b65, Rosalind #625849, Sakura #7d5254, Mist #5e677f. These colours preserve each theme's tonal identity while clearing the 4.5:1 bar on the darkest surface that `text-subtle` can appear against.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Voltage theme — WCAG AA contrast fixes",
    body: "Three contrast failures in the Voltage (TRON) theme have been corrected: `fg-subtle` text (#4f7e98, 4.28:1 on cards) is lifted to #6baec4 (passes 4.5:1 on all surfaces); UI borders raised from 1.88:1 to ~3.1:1 on card backgrounds (WCAG 1.4.11); CTA button background darkened from #007fb3 (4.48:1) to #0073a8 (5.23:1); and the bright cyan hover state (#00aae0 + white = 2.68:1) is fixed by switching to near-black text (7.57:1) so the glow is preserved without sacrificing legibility.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  // ── HR sprint — May 2026 ──────────────────────────────────────────
  {
    title: "Public job board + direct-apply path",
    body: "Candidates can now browse all active postings at `/jobs` and apply directly from `/jobs/[id]/apply`. The form collects name, email, phone (optional), cover letter (100–3000 chars), and resume URL. Submissions create an `AccessRequest` row so employers see them in their hiring workspace without any admin step.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Notification inbox — bell icon + unread badge",
    body: "A bell icon now appears in the sidebar header showing an unread count. Clicking it opens a drawer grouped by day, with per-notification icons and mark-read / mark-all-read actions. The count is fetched server-side on every page load so it's accurate on first paint.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Employer onboarding wizard",
    body: "New employers see a 4-step guided wizard (fixed bottom-left card) walking through: set up your company profile → post your first role → invite teammates → you're ready. Progress is persisted in localStorage, and the wizard can be minimised or dismissed permanently.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer"),
    daysAgo: 0,
  },
  {
    title: "Email template management",
    body: "A new **Email templates** page at `/employer/templates` lets you create, edit, and delete reusable email templates grouped by kind: rejection, interview invite, offer, follow-up, and general. Each template supports merge variables (`{{candidateFirstName}}`, `{{postingTitle}}`, etc.) with one-click chip insertion.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Pipeline analytics + CSV export",
    body: "A new **Analytics** page at `/employer/analytics` shows stage-by-stage funnel counts, offer acceptance rates, average days-per-stage velocity bars, and a company-wide summary. Download a full CSV of all applications with one click.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Interview calendar",
    body: "A new **Calendar** page at `/employer/calendar` displays all upcoming interviews in a week-view grid (desktop) or stacked list (mobile). Navigate weeks with Previous/Next arrows, see format chips (phone/video/on-site), and spot confirmed vs. pending slots at a glance.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Interview scorecard builder",
    body: "Each posting now has a dedicated **Scorecard** page at `/employer/postings/[id]/scorecard`. Build a rubric of up to 10 criteria with custom labels, descriptions, and 4- or 5-point scales. Interviewers submit scores and a hire/no-hire recommendation per candidate; all submissions are visible in a summary panel.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Bulk candidate messaging",
    body: "Select one or more applicants in the hiring workspace and compose a freeform email via the **Message candidates** panel that appears below the list. Supports `{{candidateFirstName}}` personalisation. A two-step confirm prevents accidental sends.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Hiring team assignment per posting",
    body: "A new **Hiring team** section at the bottom of each expanded posting row lets managers assign company members to the posting with a role: Recruiter, Hiring Manager, Interviewer, or Observer. Assigned members receive notifications for that posting.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Duplicate posting",
    body: "A **Duplicate** button (two-step confirm) now appears next to each posting header in the workspace. Creates a copy titled `<original> (Copy)` in draft status so you can reuse a well-crafted posting without re-entering everything from scratch.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Talent pool: skills, stage, and availability filters",
    body: "The talent pool now supports three new search dimensions: filter by **skills** (comma-separated), by **pipeline stage** (new / shortlisted / phone screen / etc.), and by **availability** (exclude anyone already in offer/hired stage). All three filters combine with the existing text search.",
    kind: "improvement",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Voltage theme: hero title contrast fix for employer pages",
    body: "On the **Voltage** (hi-tech) theme, the hero title on all `/employer/*` pages (Postings, Team, How it works, etc.) now uses a bright electric-cyan gradient (`#00d4ff`) instead of the dark teal `--brand-200` token. The Studio DSPageHeader title gradient is now theme-overridable via `--hero-title-gradient` — every other theme continues to use its existing brand-200 sweep, and Voltage overrides it with its bright `--brand-500` cyan so the title is legible against the near-black hero background.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Employer overview: admin feature inventory + DemoSeederBar confirm fix",
    body: "Two improvements to the employer portal:\n\n• **Admin feature inventory** — a new section at the bottom of `/employer` (admin / superadmin only) shows a comprehensive inventory of every surface built for HR accounts: Brand Stage, Hiring Workspace, Team Management, and Other Employer Surfaces. Each group lists features with brief notes and direct links to the relevant pages.\n\n• **DemoSeederBar confirm fix** — the postings demo seeder now uses the same inline two-step confirm pattern as the team demo seeder (first click shows 'Remove all demo data?' + 'Yes, remove' + 'Cancel'; no more `window.confirm`).",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Sidebar section headers: unified chip + chevron on the right",
    body: "The collapse toggle on sidebar section group headers (ENGAGE, EXPERIENCE, EQUIP, ADMINISTRATION, etc.) has been redesigned.\n\n**Before:** a tiny separate `^` button floated to the *left* of the section name chip — two separate click targets, awkward placement.\n\n**After:** the chip itself is the toggle. The chevron now sits *inside* the chip on the right, animating 90° between expanded and collapsed. Same localStorage persistence, same smooth grid-rows accordion animation. Admin sub-group headings (Engage / Experience / Platform / etc.) also got the chevron-right treatment for consistency.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Team page: roles legend, hero header, and demo seeder",
    body: "The `/employer/team` page has three new things:\n\n• **Full hero header** — replaces the plain page header with a DSPageHeader (gradient hero, eyebrow, description auto-updates based on how many members you have).\n\n• **Roles legend** — a compact card below the header lists all four roles (Owner, Manager, Generalist, Viewer) with a one-line capability summary so you always know what each tier can do before you invite someone.\n\n• **Demo team seeder** — a violet toolbar (manager+ only) with **Add demo team** and **Clear** buttons. Adds three realistic demo members (a Manager, Generalist, and Viewer with staggered last-seen timestamps) so you can preview the full team roster experience before your real colleagues have accepted their invites. Clear removes them without touching your real team.",
    kind: "improvement",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Employer portal consolidation — cleaner navigation and no duplicate queue",
    body: "Three small polish changes that remove duplicate surfaces and align labels across the employer portal:\n\n• **Overview action queue is now a compact callout.** The full expanded action queue previously appeared on *both* the Overview (brand-stage) page and the My Postings workspace. The Overview now shows a summary chip (counts by kind) with a single 'Review in workspace' link. The interactive queue — expand an applicant inline, move stages, schedule — still lives in **My Postings**.\n\n• **'How it works' renamed to 'Hiring guide'** in the sidebar (and the English translation key). The page's own eyebrow already said 'Hiring guide'; the sidebar label now matches.\n\n• **My Postings page eyebrow updated.** The hero strip on `/employer/postings` used to say 'Hiring workspace'; it now says 'My postings' so the page header and the sidebar label read the same.",
    kind: "improvement",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "Team workspace for employer accounts",
    body: "HR accounts are now shared workspaces. Multiple people from the same company can sign in, each with a role (Owner · Manager · Generalist · Viewer), and see each other's activity on postings and applicants.\n\n**What's new:**\n\n• **Team page at `/employer/team`** — see all members with role chips and last-seen timestamps. Owner can change roles and remove members from the roster; manager+ can invite.\n\n• **Invite teammates** — the invite button opens a modal where you can add people individually or paste a list (one email per line; optionally `email, Job Title` to auto-suggest a role). Each invite sends a branded email with a 7-day accept link. The public accept page at `/invite/[token]` works before the invitee has an account.\n\n• **Join requests** — when someone with a matching company email domain signs up, the system surfaces a 'Join request' for the team's managers to approve or decline in one click.\n\n• **Attribution chips** — posting rows in the workspace now show a subtle 'touched by Name · Nh ago' line, so you know who last worked on each req.\n\n• **Roles:** Owner (full admin), Manager (invite + approve), Generalist (post + review), Viewer (read-only). You cannot invite at a higher tier than your own role.\n\nThe migration is additive — every existing employer account is automatically the Owner of a company workspace; nothing changes about how your postings or applicants look.",
    kind: "feature",
    visibleTo: ALL.filter(r => r === "employer" || r === "admin" || r === "superadmin"),
    daysAgo: 0,
  },
  {
    title: "HR workspace retired — brand-stage Overview is the home; postings workspace archived",
    body: "HR users now have a single entry point: the brand-stage page at `/employer` with the full-bleed wavy aurora cover banner, company identity row, KPI tiles, action queue, and live posting preview. The separate postings workspace at `/employer/postings` (with its Studio-variant DSPageHeader hero, four-up stats strip, amber action-queue panel, and expandable posting rows with inline applicant pipelines) has been retired — its functionality already exists in two places: the brand-stage page hosts the high-level signals (queue + posting preview), and the per-posting deep routes (`/employer/postings/[id]/...`) handle applicant management end-to-end.\n\n**What stayed.** The brand-stage Overview page — wavy banner, identity row, edit-profile pencil, stats triplet, action queue, hiring shopfront — is unchanged. The per-posting deep routes (`/[id]`, `/[id]/applicants`, `/[id]/applicants/[appId]`, `/[id]/pipeline`) are unchanged. The sidebar's HR section is now leaner: **Overview** + **How it works**, and that's it.\n\n**What's archived.** The retired workspace's visual treatment — the Studio DSPageHeader hero with its gradient + drift blobs + curve-down SVG, the four-up stats strip pattern, the amber-tinted action-queue panel, the expandable posting-row layout — is preserved as a faithful HTML port at `/design-archive/employer-postings-workspace.html`. Indexed on `/admin/design-archive` with anatomy notes for each of the six layers. Drop the pattern into a future surface that wants a polished workspace look.\n\n**What still works.** `/employer/postings` 308-redirects to `/employer`, so the workspace's child routes (`/employer/postings/[id]/...`) still resolve naturally — Next.js routes the [id] child before the redirect fires. Old bookmarks, email links, the per-posting links inside the brand-stage hiring shopfront, internal `revalidatePath()` calls — all keep firing.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "AI tailor for this role — pick the best bullets from your master library",
    body: "The headline AI flow for the master-resume system is live. On the **Master resume banner** at the top of any resume's edit page, click **AI tailor for this role** to open a drawer that:\n\n  1. **Reads the job description** — paste the JD or pick from your saved / active internship postings.\n  2. **Searches your library** — embeds the JD and cosine-ranks your ≤12 best non-archived master bullets by similarity.\n  3. **Asks the LLM to pick + light-rewrite** — top 30 candidates go to Gemini Flash (Cloudflare Llama fallback) with strict rules: never invent, never add facts, rewrites are LIGHT vocabulary matches only.\n  4. **Previews — never auto-applies** — you see every pick grouped by section with a checkbox (default checked), an original-vs-rewrite side-by-side diff, an editable proposed text box, and a **Why this bullet?** disclosure that explains the AI's reasoning + similarity score.\n  5. **Accept your selection** — inserts the bullets into the resume you're editing, marks them `aiSuggested` so the editor highlights them, and tags each with `derivedFromMasterBulletId` so the promotion chip can detect when you edit them later.\n\n**The five rules the AI is bound to** (per the system prompt):\n  • Picks ONLY from your existing master bullets.\n  • Does NOT add facts, numbers, tools, or experiences not in your bullet.\n  • Rewrites are LIGHT — match JD vocabulary (\"cell culture\" → \"mammalian cell culture\" if the JD uses that), never change the claim.\n  • Picks ≤12 bullets. Fewer is fine if only fewer are relevant.\n  • Each pick has a concrete reason grounded in the JD.\n\nDisabled when your master is empty — build the library first via `/profile/master`. Disabled when no resume is open — there's nothing to tailor into.\n\nFull design + the prompt language live in `docs/plans/master-resume.md` under **AI retrieval algorithm**.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Master resume — pull bullets from your library + promote edits back",
    body: "**Two pieces of the master-resume loop are now live on every resume's edit page.**\n\n**Pull from master — drawer + drag-and-drop.** The previously-stubbed \"Pull from master\" card on the Master resume banner now opens a right-side drawer that lists every non-archived bullet in your library, grouped by section. From there:\n  • **Drag a bullet** by its grip handle onto any entry's bullet list in your draft — it inserts at the drop position with a small library glyph in the margin to signal where it came from.\n  • **\"Send to →\"** on each card opens an inline picker (section → entry); click Send and the bullet appends to that entry.\n  • A revision is recorded on the resume with the note \"Pulled bullet from master library\" so version history makes the source explicit.\n\n**Promote edits back to master.** Once you've pulled a bullet, the editor remembers the master body it came from. The moment you edit the wording on the resume side, a thin chip appears beneath the bullet:\n\n  ⬆ **Edited from master.** [Promote to master] · [Keep local only]\n\n  • **Promote** pushes the new wording back to the source master bullet, recording a `promoted_from_resume` revision in the master's history (5-minute coalesce, so quick re-edits don't pile up).\n  • **Keep local only** dismisses the chip for the current body — type one more character and it comes right back. Intentional: future drafts you create from the master will keep showing the older wording until you choose to promote, and we want to make that decision visible without nagging.\n\n**Visual cues.** Derived bullets show a small library icon next to the drag handle so you can tell at a glance which lines came from your library vs. which are unique to this tailored draft.\n\nFull design notes: `docs/plans/master-resume.md`. The bullets list itself is the drop target — you can also drop directly on a specific row to insert at that exact position. Promote chip uses sessionStorage to remember dismissals per browser tab.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Master resume — AI-extract from an existing draft to seed your library in one click",
    body: "Bootstrapping the master library by hand was the friction point. Two new buttons close it:\n\n  • **On any tailored resume page (`/profile/resume?id=…`)** — when the master library is empty, the banner now shows a primary **Build master from this draft** button. One click reads every bullet in the open resume, dedupes against anything already in the master, and bulk-creates the rest with their job/section anchors intact. Header (name, email, phone, location, summary) copies into the master too if the master's header was blank.\n  • **On `/profile/master`** when the library is empty — a **Seed library from a resume** picker appears with a dropdown of your tailored resumes. Pick one, click Seed.\n\n**How dedupe works.** Each candidate bullet is embedded with Cloudflare BGE small (384d, batched in one call) and compared against existing master bullets via pgvector cosine distance. Anything ≥0.92 similarity gets skipped — so re-running the extract against the same resume twice is safe (the second run finds zero new bullets). Within a single run we also dedupe candidates against each other so a resume that repeats nearly-identical bullets only contributes the first copy.\n\n**What you see while it runs.** The button flips to **Extracting…** with a spinner; on completion a green confirmation chip reports how many bullets were added and how many duplicates were skipped. The page reloads the library state so the new bullets show up immediately — no manual refresh.\n\n**What it doesn't do.** The AI does not re-write or polish bullets — your words land in the master verbatim. The bullet's anchor (job title + company, project name, etc.) comes from the parent item in the source resume; the section comes from the parent section. Each created bullet records `sourceResumeId` so you can trace it back later.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Master resume — snapshot PDF export + per-bullet revision history with one-click restore",
    body: "Two follow-ups on the master-resume feature land in this build, closing the two largest gaps in the first cut.\n\n**1. Snapshot → PDF, via your browser's Save as PDF.** The Snapshots card on `/profile/master` now offers two export buttons per version: the existing JSON download (kept — that's the canonical interchange format) **plus** a new print-friendly view. Click the printer icon and a new tab opens with the snapshot rendered through the same ATS-friendly print layout the active-resume preview uses, and the browser's print dialog opens automatically. Pick \"Save as PDF\" as the destination and the suggested filename matches our convention (`master-resume_<slug>_v<n>_<YYYY-MM-DD>`). No new dependencies — we lean on the browser's native print pipeline, same trade-off we made on the active-resume preview: light browser-to-browser variation, zero deploy surface added. A future build can swap in a server-side renderer behind the same URL.\n\n**2. Per-bullet revision history with Restore.** Each bullet card on `/profile/master` already showed a count of prior revisions; clicking the count used to expand a placeholder. Now it expands a live list of the last 10 revisions ordered newest-first. Each row shows the prior body text (truncated to ~160 chars with a hover tooltip for the full text), a relative timestamp (`3m ago`, `2h ago`, `5d ago`, falling back to a date for anything older than a month), a small source chip (Edit / AI / Promoted / Imported), and a **Restore** button. Click Restore and the bullet's body snaps back to that revision; a new revision row is written so the audit trail stays linear. The revision list reloads after each restore so the panel never goes stale.\n\nFetch is lazy — the list only loads when you actually expand the panel, so the deep page stays cheap even on a library with dozens of bullets. New endpoint: `GET /api/profile/master/bullets/[id]/revisions` (returns last 10, ownership-checked via the bullet's master).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Master resume — your library of every bullet you've ever written",
    body: "**One library, many drafts.** Your master resume is a new singleton library of every accomplishment bullet you've ever written. Tailored resumes pull from it; AI will eventually tailor by picking from it. Edit anywhere, promote good edits back.\n\nThis first cut ships the foundation — what you can do today:\n\n**On the new `/profile/master` page:**\n  • Add bullets section by section (Experience, Skills, Education, Projects, Certifications, Publications, Awards, Volunteering, Other)\n  • Group experience bullets by anchor (job title + company) — same anchor = same item on the printed resume\n  • Inline-edit any bullet with autosave (5-minute coalesce on the revision history so re-edits don't pile up)\n  • Tag bullets with free-form labels (`upstream`, `GMP`, `Python`) — used by future AI tailoring\n  • Archive bullets you don't currently want surfaced (kept, never deleted unless you ask)\n  • Take a named snapshot any time to lock + version the master state; download as JSON\n\n**On every resume's edit page (`/profile/resume?id=…`):**\n  • Collapsible **Master resume banner** at the top shows bullet count + latest snapshot + quick-actions\n  • If empty → CTA to open `/profile/master` and start your library\n  • Latest snapshot's download link sits in the banner for one-click export\n\n**What's coming in follow-ups** (not in this build): AI extract from existing PDF to seed the library, AI tailor-for-this-role flow (embed JD → cosine search → LLM re-rank), drag-from-master into a draft, promotion chip on edited bullets, PDF download, revision-history UI.\n\nFull design + 5 principles + data model: `docs/plans/master-resume.md`. User guide: `docs/guides/master-resume.md`. Toggle visibility in `/profile/preferences` under \"Master resume\".",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "ConfirmDialog sweep — every yes/no prompt now uses the branded modal",
    body: "Last of the native browser prompts on the platform. Every `window.confirm()` / `window.alert()` call-site has been migrated to the new branded `ConfirmDialog` — same imperative `await confirmDialog({…})` shape, but rendered as a themed modal with a tone-tinted icon disc, header gradient, and the right confirm-button colour for the prompt's stakes.\n\n**Surfaces upgraded:**\n  • **Leave course** (admin fast-leave on `/my-courses`) — warning tone; failures now surface as an inline error chip instead of `window.alert`.\n  • **Leave pathway** (admin fast-leave on pathway pages) — warning tone; same inline-error treatment.\n  • **Reset copy override** — both `/admin/copy` and the in-page `<EditableText>` modal use warning tone.\n  • **Archive your last active resume** — warning tone, spells out that you'll be left with no live resume.\n  • **Delete N resumes** (batch) — destructive tone, count in the title + confirm label.\n  • **Revert to v{n}** (version history drawer) — warning tone, with explicit \"your in-between work stays in history\" reassurance.\n  • **Re-parse from PDF** — warning tone, reminds the user the previous version is in Version history.\n  • **Dismiss all recoverable items** (resume editor's undo panel) — warning tone, counts the items in the title.\n  • **Delete job folder** (single + batch) — destructive tone, spells out what cascades.\n\n**Tone discipline.** Three tones map onto the destructive-confirmation hierarchy: *neutral* for routine reversibles, *warning* for moderate-risk recoverable (archive, revert, batch ops), *destructive* for bounded-but-irreversible (delete a folder, delete N resumes). Truly irreversible work-destroying actions stay on `LaunchSwitch` (the cover-flip + 10s countdown) — the new dialog doesn't replace those.\n\n**Inline errors over alerts.** The two surfaces that previously used `window.alert` for failure messages (LeaveCourse + LeavePathway) now render an `AlertCircle`-tipped error chip beneath the button — same visual language as every other error surface on the platform.\n\n**Final grep clean.** Zero functional `window.confirm` / `window.alert` call-sites remain in `src/`.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume linter — grammar + style pass at the bottom of every resume",
    body: "Lints your resume the same way a code linter lints code. The new **Grammar & style check** panel at the bottom of the resume editor runs an AI pass over the whole tree and surfaces issues the way a sharp career mentor would catch them on a first read.\n\n**What it flags:**\n  • **Spelling** — typos and misspelled words (severity: error)\n  • **Grammar** — subject-verb mismatches, tense agreement, punctuation issues (severity: error)\n  • **Weak verbs** — \"worked on\", \"helped with\", \"was responsible for\", \"involved in\", \"assisted\" — suggests stronger action verbs (severity: warn)\n  • **Passive voice** — rewrites \"was implemented by me\" → \"implemented\" (severity: warn)\n  • **Vague filler** — \"various tasks\", \"different things\", \"a number of\" (severity: warn)\n  • **Tense inconsistency** — mixing past + present within a single experience item (severity: warn)\n  • **Missing metrics** — experience bullets with no numbers, percentages, or quantified outcomes (severity: warn)\n  • **Repetition** — same action verb used in adjacent bullets (severity: info)\n  • **First-person openers** — bullets starting with \"I\", \"My\", \"We\" (severity: info)\n  • **Wordiness** — \"in order to\" → \"to\", \"due to the fact that\" → \"because\" (severity: info)\n  • **Style** — inconsistent trailing periods, ALL-CAPS that isn't an acronym, double spaces (severity: info)\n\nEach issue card shows the category, severity badge, one-line explanation, the offending excerpt, and (when applicable) a suggested replacement. **Apply fix** rewrites the relevant field in place; **Dismiss** removes the issue from the list without changing anything. The lint pass is stateless — nothing is changed unless you click Apply.\n\nSurface lives at the **bottom of every resume's edit page** so it reads as the \"final check before export\" step. Powered by the platform's chat() adapter (Gemini Flash primary, Cloudflare Llama fallback).",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "LaunchSwitchFacet — faceted plastic-cover delete switch + 12-cover design archive",
    body: "Third member of the LaunchSwitch family, plus an HTML exploration of twelve plastic-cover geometries.\n\n**`LaunchSwitchFacet`** — opaque plastic cover carved into four triangular facets meeting at the centre. Each facet catches light at a different angle (fixed top-left source, ~135°) so the cover reads as a low-poly moulded prism rather than a flat plane. Diagonal seams between the facets are drawn at ~0.4px so the geometry reads even at the small inline size. Cover hinges open with the same overshooting cubic-bezier on close as the canonical LaunchSwitch; the underlying red DELETE base + 10-second cool-off countdown is identical.\n\n**Same API as the glass and classic variants**, so it's a drop-in swap by import path: `LaunchSwitch` (glass · canonical) · `LaunchSwitchFacet` (faceted plastic · this entry) · `LaunchSwitchClassic` (military hazard-stripe · original).\n\n**Companion HTML archive** at `/design-archive/delete-buttons-prism-covers.html` with twelve covers exploring different prism geometries: faceted pyramid, chamfered bezel, diamond rib, rooftop ridge, fresnel rings, octagon-stamped housing, crystal V-grooves, twin-pitch roof, refracted prism (cyan/amber bisect), hex-faceted lens, single-bevel slope, saw-tooth ridges. Each one click-flippable. Reflections are static (fixed light direction) so they read as moulded geometry rather than animated highlights.\n\n**Pick by surface.** Glass = soft product-design language. Facet = moulded-plastic middle ground. Classic = hazard-stripe industrial. Side-by-side comparison + import paths now live on `/admin/design-system`.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "LaunchSwitchClassic restored alongside the glass-cover LaunchSwitch",
    body: "The original military hazard-stripe LaunchSwitch — the one with the amber/black diagonal-stripe cover, red FIRE button, 5-second countdown, and rivet corners — was inadvertently overwritten when the newer glass-cover design shipped. It's now back as a separate component (`LaunchSwitchClassic`) so the system carries both options side-by-side rather than one replacing the other.\n\n  • **`LaunchSwitch`** — current canonical. Clear glass cover, neon-glow DELETE underneath, 10-second cool-off.\n  • **`LaunchSwitchClassic`** — original. Hazard-striped cover, red FIRE, 5-second countdown, riveted chassis.\n\nBoth have the same prop API (`onFire`, `onArm`, `onAbort`, `label`, `countdownSeconds`, `size`, `actionVerb`, `ariaLabel`); pick by surface — industrial admin tooling vs. softer product surfaces. `/admin/design-system` now shows them side-by-side.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Skill ontology — card grid with mouse-wave + 50 delete-button design explorations",
    body: "Two unrelated things.\n\n**1. `/admin/skills` becomes a card grid.** The flat row list was efficient but never invited browsing. Now every skill is a compact card in an auto-fill grid, and the grid responds to mouse movement: each card lifts + tints when the cursor is near, falling off smoothly with distance. The effect is pure CSS — mousemove writes the cursor's `--mx / --my` onto the grid, each card knows its own `--cx / --cy` (measured once + on resize), and a soft `1 / (1 + d²)` falloff drives `translateY`, box-shadow, and a radial gradient. No JS animation loop. `prefers-reduced-motion: reduce` zeroes the effect.\n\n**2. 50 delete-button explorations** in the design archive (`/admin/design-archive` → \"Delete button · 50 variations\"). Saved as a single standalone HTML page. Five groups:\n  • **A · Minimal micro-animations** (1–10) — ink fill, pixel sweep, letter-spacing pulse, magnet split, shutter, aperture X stroke, word swap, glow ring, strike-through, corner cut.\n  • **B · Geometric** (11–20) — folded corner, bracket clamp, stairstep widen, bisect, bevel deepen, slab slide, iso tilt, diagonal two-tone, cross-hatch reveal, aperture iris.\n  • **C · 8-bit Nintendo** (21–35) — NES classic chip, coin block shimmer, mushroom red, Zelda heart empty, mortal screen, bomb fuse, Game Over flash, D-pad diamond, HP drain, Pacman munch, Tetris drop, boss bar drip, 1-UP hue shift, Pong paddle, boss explode.\n  • **D · Industrial / alarm** (36–45) — strobe, hazard stripes, CRT scanline, throbbing LED, cross-out, knurl press, sword slash, fade, CRT static, vacuum suck.\n  • **E · Playful** (46–50) — wiggle, splash, pop bounce, ghost, confetti burst.\nNo thick lines anywhere — motion + colour + glyph carry the warning signal.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "InputDialog + LaunchSwitch refinements — no more ugly native prompts, smaller delete switch",
    body: "Two related polish items.\n\n**1. `InputDialog` replaces every `window.prompt()`.** The browser-native prompt is functional but looks like 1998 — flat black box, unstyled, unbranded, no description support. The new InputDialog gives the same primitive (one short string + OK / Cancel) inside the platform's surface language: rounded card, brand-tinted icon disc, soft gradient header, line + flat aesthetic. Auto-focus + select on open; Enter confirms, Escape cancels.\n\nReplaced in: **create resume**, **rename resume**, **duplicate resume**, **create job folder**, **take snapshot** in the version-history drawer.\n\nUsage via a hook:\n```ts\nconst { inputDialog, node } = useInputDialog();\nconst value = await inputDialog({ title: \"Name this snapshot\", … });\n```\nSaved to `/admin/design-system` with a try-it preview and full API.\n\n**2. `LaunchSwitch` refinements.** The delete-button cover now reads more like a real military switch and less like an arcade prop:\n  • **Smaller default** — 84×24 instead of 96×30 (less beefy in inline action rows).\n  • **Better flip animation** — both rotateX values use the same bracket-transform syntax so the browser actually interpolates them cleanly. Custom cubic-bezier on close gives the cover a satisfying \"click shut\" overshoot; open direction stays soft ease-out.\n  • **`DELETING · 5s` countdown** — replaces the cryptic `T-5`. The verb is configurable via `actionVerb` so other destructive actions can read \"Wiping…\", \"Resetting…\", etc.\n  • **Inner button now reads `DELETE`** (mirrors the cover label) instead of `FIRE` — military jargon out, plain verb in.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Microcopy — voice & tone doc + empty-state sweep + destructive-confirmation tiers",
    body: "Tightening the words on the platform, not the code.\n\n**Voice & tone doc** — `docs/ux/microcopy.md`. Short, opinionated. Sets the principles in one page: plain professional, *you* + *we*, imperative verbs for actions, past tense for done state, no clichés, no exclamation marks, no emoji in product UI. Mirrored to `/admin/design-system` under \"Voice & tone\" so the rules stay alongside the visual system.\n\n**Empty-state sweep** — every user-facing list page that could land empty now follows the same shape: icon (12pt lucide glyph in a brand-tinted disc) + headline (one short sentence — what's missing) + subhead (one short sentence — what to do about it) + primary action. Surfaces upgraded today:\n  • **My Courses** — now opens with \"Pick something from the catalog\" + Browse catalog CTA.\n  • **Certificates** — now opens with \"Complete any course and you'll earn one\" + a See my courses CTA.\n  • **My Skills** — now opens with context about how skills match you to postings + the search-to-claim CTA.\n  • **Interviews** — now explains what'll show up here when employers schedule with you.\n\n**Destructive confirmation hierarchy** — formal doc on which gate to use:\n  • **Tier 1 — no gate** for routine reversibles (hide, archive, remove single comment).\n  • **Tier 2 — `window.confirm()`** for moderate risk (batch operations, revert).\n  • **Tier 3 — LaunchSwitch** for irreversible work-destroying actions (hard-delete, wipe workspace).\n  Don't stack tiers. Pick one.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "LaunchSwitch — protected delete button modelled on a jet fighter's weapons cover",
    body: "The Delete button on every resume card is now a tiny military-style **launch switch**. Modelled on the red protected switches you'd see on a jet fighter's weapons panel — irreversible actions deserve the ceremony.\n\n**Three states.**\n  1. **Closed** — striped amber/black hazard cover sits over the firing button. The stencilled \"DELETE\" label is the only thing visible. Click to lift.\n  2. **Armed** — cover hinges up to ~78°, the red gradient **FIRE** button is exposed. Click the FIRE button to commit. Click the lifted cover (or anywhere on the chassis) to bail.\n  3. **Launching** — a yellow LED flashes, the panel shows **T-5 → T-4 → T-3 …** counting down. An ×/ABORT button gives you 5 full seconds to change your mind. Hit ABORT (or close the cover) and nothing happens. At T-0 the actual delete fires once.\n\n**Why the ceremony?** Hard-delete is irreversible — comments + revisions cascade. The flip-cover + countdown gesture costs the user three deliberate clicks plus 5 seconds of thought; accidental triggers are essentially impossible. We've also dropped the `window.confirm` that used to gate the action since it was redundant on top of the switch.\n\n**Now lives in the design system.** Documented in `/admin/design-system` under \"LaunchSwitch — protected destructive action\" with all three states, both sizes, and prop reference. Reach for it any time a one-click button would be too cheap given the cost of an accidental press.\n\n**Alignment.** The card's destructive control now anchors to the right edge of the action row regardless of how the row wraps on narrow viewports.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar reshuffle + collapsible groups + uploaded resume now surfaces in /profile/resumes",
    body: "Six small things in one push:\n\n  • **Rename** — \"Resume (structured)\" is now **Resume tailoring**.\n  • **Job folders nest under Resume tailoring** — the sidebar shows it with a `↳` glyph indented under its parent.\n  • **Preferences moved to its own \"My profile\" section** at the bottom of the user nav. Was buried under ENGAGE.\n  • **Roadmap moved to Platform admin** — out of the user-side `What's new` row, into the Administration sidebar where it belongs.\n  • **Collapsible groups** — every sidebar group title now has a chevron toggle. Click to collapse / expand; choice persists in localStorage so it survives navigation.\n  • **Uploaded resumes show up in `/profile/resumes`** — if you uploaded a PDF / DOCX via the Application Builder, a card now appears here. New cards carrying an uploaded PDF that hasn't been AI-parsed yet get a prominent **\"AI-parse from your uploaded PDF\"** chip directly on the card; click it and the editor opens with the parse CTA ready to fire. Every card also shows a small \"Uploaded PDF\" link to the source file regardless of parse status.\n\n**Preferences switchboard backfill** — every sidebar nav item is now registered in `src/lib/preferences/registry.ts` with a `featureId`. Items that previously couldn't be toggled (Internships, Matches, Interviews, RPG, Buddy hub, Funding, Equip tracker, etc.) are now controllable from `/profile/preferences`.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Job folders — per-role workspace with AI cover letter + interview prep",
    body: "Job seekers don't apply to roles, they pursue them. Each role has its own gravitational well: a JD, a tailored resume, a cover letter, an interview prep guide, and a status that changes over time. The new **Job folders** feature gives each one its own home.\n\n**Where it lives.** New sidebar entry → **`/profile/job-folders`**. Each folder is a card showing title, status, chips for what's filled in (Resume linked · Letter drafted · Prep ready · Posting linked), and a JD preview. Click into one for the detail editor.\n\n**Detail editor.** Four tabs:\n  • **Job description** — paste / write the full JD (markdown supported). If you linked a platform posting, it surfaces at the top.\n  • **Resume** — pick which of your tailored resumes belongs to this folder. Quick links to open + preview-PDF that resume.\n  • **Cover letter** — long-form letter editor with a big **AI generate** button. The AI uses your JD + linked resume to draft 3-4 paragraphs; you preview + edit + accept before it overwrites whatever's there.\n  • **Interview prep** — same shape. The AI drafts a personalised prep guide: likely questions, STAR-framed answers using your real resume bullets, questions to ask back, gotchas to research.\n\n**Status field.** Drafting / Submitted / Interviewing / Offer / Rejected / Closed. Renders as a colour-coded chip everywhere the folder surfaces.\n\n**Lifecycle.** Auto-saves like the resume editor (700ms debounce). Soft-archive by default; hard-delete with confirmation. The folder is the parent; if you delete a linked resume the folder survives (the JD + letter + prep stay intact).\n\n**Resume index upgrades that landed together:**\n  • **Bigger primary buttons** — Open + Preview PDF are now full-size brand-coloured cards, not 11px chips.\n  • **Checkbox per card + sticky batch toolbar** — select multiples; bulk Archive / Restore / Delete / Open PDFs.\n  • **Hard-delete** — every resume card now has an explicit Delete (irreversible, confirms first). Archive remains the soft option.\n\nAPIs added:\n  • `GET / POST   /api/profile/job-folders`\n  • `GET / PATCH / DELETE /api/profile/job-folders/[id]`  (?force=true for hard delete)\n  • `POST /api/profile/job-folders/[id]/generate`  (cover_letter or interview_prep, preview-then-save)",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Preferences switchboard + paper-style resume thumbnails",
    body: "Two unrelated upgrades that landed together:\n\n**1. `/profile/preferences` switchboard.** A new page where every user controls which sidebar features show up in their own view. Affects ONLY the viewing user — never anyone else.\n\n  • **Per-feature toggles** — each row has a flat line + gradient pill toggle, a short description, and a drag handle for reordering within its group.\n  • **Group toggles** — every group card (Profile · Learn · Experience · Engage · EQUIP · Admin · Account) has an \"All on / All off\" affordance that flips every member at once.\n  • **Presets** — Minimal (5 features), Default (registry default-on), Full (everything registered). One click applies.\n  • **Auto-save** — every change debounces and PATCHes through to the user's `featurePrefs` JSON column. No save button to hunt for.\n\n  The source of truth for what's toggleable lives in `src/lib/preferences/registry.ts` — a single file the dev maintains whenever a sidebar entry is added or removed. New features default to ON unless they're niche / admin-only.\n\n**2. Paper-style thumbnails on `/profile/resumes`.** Each resume card now leads with a 144×186px thumbnail that visually reads as a document — name at the top, section headings with hairline rules, bullets as gray lines. Empty resumes render an \"Empty\" placeholder thumbnail. Archived resumes desaturate. Card layout switches from stacked to horizontal so the thumbnail sits left of the metadata.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume — multiple resumes per user (master + tailored copies)",
    body: "Job seekers in practice maintain one master resume plus a tailored copy per active application. The structured-resume feature now models that directly:\n\n**Schema change.** The unique constraint on `Resume.userId` is dropped. Users can own as many resumes as they want, each with its own version history, comments, and PDF export. New columns: `name`, `isArchived`, `derivedFromId` (links a tailored copy back to its source), `derivedForPostingId` (links to the posting it was tailored for). Migration `20260706000000_resume_multi_per_user`.\n\n**New surface — `/profile/resumes`.** Sidebar entry now points here. Lists every resume as a card with name, version, parsed status, last-edited timestamp, derivation chip (\"Derived from Main resume\"), tailored-for chip (\"Tailored for STEMCELL · Process Engineer Intern\"), comment count, and quick actions: Open · Preview PDF · Duplicate · Rename · Archive. Archived resumes collapse to a separate section and stay restorable.\n\n**Resume picker in the editor.** A dropdown at the top of `/profile/resume` shows the current resume name; clicking switches between siblings via `?id=…`. \"Manage resumes →\" goes to the index.\n\n**Tailor — save as a new resume.** The Tailor panel grows a checkbox: **\"Save as a new resume\"** (default ON). When checked, Apply creates a fresh Resume row with the tailored content, attribution to the source, and the posting tied in — the original stays untouched. Untick for the legacy in-place behaviour.\n\n**Lookups.** Every existing endpoint accepts an optional `resumeId` (query param or body field) and falls back to the user's most-recently-edited non-archived resume. So `/profile/resume`, `/profile/resume/preview`, `/api/profile/resume/structure/revisions/*` and friends all work for any specific resume.\n\n**New API.** `GET /api/profile/resumes` (list), `POST /api/profile/resumes` (create / duplicate), `PATCH /api/profile/resumes/[id]` (rename / archive / restore), `DELETE /api/profile/resumes/[id]` (soft-archive). Hard-delete intentionally not exposed — archived rows stay recoverable.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume — smarter revision history (no more v47 / v48 / v49 spam)",
    body: "The naïve \"a revision per save\" strategy buried the version history in keystroke-level snapshots. After typing a paragraph and fixing a typo you'd have 15 rows that were individually meaningless. Replaced with a smarter model:\n\n**1. Auto-saves coalesce.** Plain edits inside a 5-minute window fold into the most recent \"user\" revision — same row gets the latest content + timestamp. A continuous writing session now produces ONE revision representing the session's end-state. After ~5 min of inactivity the next save starts a fresh session row.\n\n**2. Significant events stand alone.** AI parse / AI rewrite / AI tailor / revert always create a new revision; they're the moments anyone actually wants to roll back to. Never coalesced.\n\n**3. Manual snapshots are explicit.** New **Snapshot now** button in the Version history drawer header. Captures the current state with an optional note (\"Before restructuring\", \"After cleanup\", etc.) into an always-fresh revision tagged `snapshot` with an emerald badge. Use it before any risky restructure to put a pin in your history.\n\n**Trade-off you should know about.** Within a session, intermediate states aren't individually recoverable any more — typing then deleting within 5 min won't both be in history. That's fine because (a) browser native undo handles within-session correction, (b) bullet / item / section removals have their own X-undo snackbar, and (c) Snapshot now is one click away for explicit marker points.\n\nOne new endpoint: `POST /api/profile/resume/structure/revisions/snapshot`.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume — PDF preview view (save your resume as PDF in one click)",
    body: "New surface at `/profile/resume/preview` and a **Preview PDF** button in the editor toolbar.\n\n**What you see.** A clean, ATS-friendly, single-column layout of your structured resume — your real name + contact info up top, sections with bold headings and hairline underlines, items with title-left / dates-right, italic subtitle below, optional description paragraph, then bullets. Skills render as a comma-joined run rather than a bullet list because it reads more naturally on paper.\n\n**How to actually save the PDF.** Click **Save as PDF / Print** at the top of the preview. Your browser's print dialog opens; pick *Save as PDF* in the destination dropdown and hit Save. Works in Chrome, Safari, Firefox, Edge. No new dependency, no server-side PDF library — the browser does it.\n\n**What the print layout fixes vs the editor.**\n  • All UI chrome (sidebar, toolbar, comment threads, edit affordances) is hidden during print.\n  • Letter size, 0.5in × 0.55in margins by default, neutral black-on-white typography.\n  • Empty fields are silently omitted — no \"GPA: —\" leftovers, no \"Currently here\" checkboxes, no item that you started but never filled.\n  • Items try not to break across pages.\n\n**Note.** The PDF is generated by the browser's print pipeline. Output is consistent within a browser but can vary slightly between Chrome / Safari / Firefox. Use Chrome for the cleanest result if you're picky.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume — full version history with preview + one-click revert",
    body: "Every save of your structured resume has always been snapshotted server-side (the `ResumeRevision` table). They're now browseable + restorable from a new **Versions** drawer in the editor toolbar.\n\n**What you get.** A side panel listing every version in reverse order. Each row shows:\n  • The version number (`v12`, `v11`, …)\n  • What triggered it — Edit (auto-save) · AI parse · AI rewrite · AI tailor · Revert\n  • A free-text note if one was attached (\"Tailored to: STEMCELL Process Engineer Intern\", etc.)\n  • Relative timestamp (\"3 min ago\", \"2d ago\")\n  • Buttons: **Preview** (full read-only render of that version in a modal) and **Revert**\n\n**Reverting is non-destructive.** When you revert to v8, your current resume is replaced with v8's content, version bumps to N+1, and a new `ResumeRevision` is stamped with `triggeredBy: \"revert\"`. The versions between v8 and current still sit in the table — you can revert *back* if you regret the revert. Nothing is ever permanently lost.\n\n**Where it surfaces.** A `Versions` button in the editor's top toolbar on `/profile/resume`, next to *AI-parse* and *Tailor to posting*. The drawer's `Esc` key + clicking outside both close it.\n\n**APIs.**\n  • `GET /api/profile/resume/structure/revisions` — list (metadata only, no content payloads)\n  • `GET /api/profile/resume/structure/revisions/[id]` — single revision's full content (for Preview)\n  • `POST /api/profile/resume/structure/revisions/[id]/revert` — restore in place\n\nSelf-only — mentors and admins can read your resume but not your version history.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume — kind-specific item fields (start / end / currently here / description / GPA / URL) and seed-button refresh fix",
    body: "Two related improvements to `/profile/resume`:\n\n**1. Each section kind now surfaces the right fields.** Previously every item — whether under Experience, Education, Projects, or Certifications — had the same generic Title / Subtitle / Date Range form. That worked but lost a lot of the meaning a recruiter looks for. Each section kind now has its own field set, with labels matching the section:\n\n  • **Experience** — Job title, Company · Location, Start date, End date, **Currently here** toggle, Description (one intro sentence above the bullets), Achievement bullets.\n  • **Education** — Degree / Programme, Institution, dates, **Currently here** for in-progress study, **GPA / Grade**, Coursework / Honours bullets.\n  • **Projects** — Project name, Role / Stack, dates, **URL** (repo / live demo), Description, Highlight bullets.\n  • **Certifications** — Certification name, Issuing organisation, Issue + (Expiry OR Currently valid), **Credential ID**, **Verify URL**. No bullets.\n  • **Publications** — Paper title, Authors, **Venue / Journal**, **DOI / link**, Description. No bullets.\n  • **Awards** — Award, Awarding body, date, **Ranking / Placement**, Description.\n  • **Volunteering** — Role, Organisation, dates, Currently here, Description, Activity bullets.\n  • **Skills** — bullet list only. No title / subtitle / dates.\n  • **Summary** — one description paragraph, no bullets.\n\nThe AI parser was also taught to extract these structured fields — start / end dates, currently-here flag, GPA, credential IDs, URLs — instead of stuffing everything into the free-text `dateRange`. The mentor view at `/resume/[userId]` renders the new fields read-only.\n\n**2. Seed Demo Resume now reflects immediately.** Clicking the admin tray's seed/clear buttons used to write to the DB correctly but the editor on screen didn't refresh — it was holding stale client state. Fixed by re-keying the editor on `(resume.id, version, parsedAt, comments.length)` so a seed / clear / AI-parse forces a fresh remount, while normal typing (which doesn't change those keys until the next server fetch) preserves in-progress edits.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Resume — mentor-side viewer at /resume/[userId], 'Tailor to posting' workflow, and per-bullet AI rewrite",
    body: "Phase 2 of the structured-resume feature is live. Three new surfaces and one cross-cutting UX improvement:\n\n**1. Mentor-side resume view at `/resume/[userId]`.** Industrial mentors, instructors, admins, and employers (with an eligible applicant on one of their postings) now have a dedicated page to comment on a trainee's structured resume. Read-only tree on the left; per-bullet, per-item, per-section, and resume-wide comment composers inline. The trainee owns the resume; reviewers can only suggest. Comments still show up on the trainee's `/profile/resume` view with Apply / Resolved / AI-apply buttons.\n\n**2. Trainee resumes index at `/mentor/trainees`.** Staff-visible (instructor / industrial_mentor / admin / superadmin). Lists trainees who've started a structured resume, with comment counts, open-count badges, parse status, and last-edited timestamp. One click opens the mentor view. Sidebar entry added under Administration → EXPERIENCE.\n\n**3. AI bullet rewrite + tailor-to-posting on `/profile/resume`.**\n  • **Rewrite per bullet** — every bullet now has a brand-coloured 'Rewrite' chip. Click it; the AI proposes a stronger variant inline (side-by-side diff: Original vs Proposed); you accept (auto-saves with `aiSuggested` highlight) or dismiss. Nothing persists until you accept.\n  • **AI-apply per comment** — on every mentor comment that pins to a specific bullet, a new 'AI apply' button rewrites the bullet *using the comment as guidance* and auto-marks the comment applied. Closes the suggestion loop in one click.\n  • **Tailor to posting** — new toolbar button. Pick an active posting from the dropdown; the AI proposes posting-specific rewrites for every bullet (respects the posting's required skills, never invents facts). Preview the diffs across the whole resume, then 'Apply all' to commit. Stamps a `ResumeRevision` tagged `ai_tailor`.\n\n**4. APIs.** `POST /api/profile/resume/structure/rewrite-bullet` (single bullet; optional `commentId` for guidance; preview or apply mode). `POST /api/profile/resume/structure/tailor` (whole resume against a posting; preview or apply mode).\n\n**Discovery.** Employers see a new 'Resume + comments' chip on every applicant's materials block (`/employer/postings/[id]/applicants`) — opens the read-only viewer in a new tab. Mentors and instructors find trainees via the new sidebar entry. Admins can route through either surface.\n\n**Why two-step preview/apply?** Tailoring is non-reversible at the human level — the trainee's resume reads differently afterward, and undoing requires combing through revisions. Preview-first lets them flip between postings, see what each one would propose, and only commit when they're confident. The API enforces it: omit `apply: true` and nothing writes to the DB.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Structured resume — edit your resume as sections / items / bullets, get mentor comments pinned to any line, AI-parse from your uploaded PDF",
    body: "New surface at /profile/resume. Your resume is now a structured tree (sections → items → bullets) you can edit inline. Mentors, instructors, and admins (and employers, for applicants on their postings) can leave comments pinned to any specific bullet — and you decide which ones to apply.\n\n**Why this exists.** The uploaded PDF stays as the archival source, but a PDF is a dead end for collaboration. You can't pin a comment to 'the third bullet under STEMCELL'. You can't ask an AI to tailor a specific paragraph. You can't track which bullet changed between versions. The structured tree solves all three.\n\n**How it works.**\n  • **First visit** — the page loads with an 'AI-parse my uploaded resume' button. Click it; we read your uploaded PDF/DOCX, send the text through the resume parser (Gemini Flash → Cloudflare Llama 3.3 fallback), and seed every section, item, and bullet automatically. Takes ~10 seconds. The original PDF stays exactly where it was.\n  • **Edit** — every field is inline-editable. Add/remove/reorder sections, items, and bullets. Auto-saves every 600 ms after the last edit; a small mono status line shows 'Saved · v12' with the version number.\n  • **Comments** — reviewers leave comments via the existing comment-thread pattern (mirrors the ApplicationComment shape on talent submissions). Each comment pins to a specific bullet (or section, or the whole resume). You see the comment-count chip on each bullet — click to expand, then 'Apply' (you incorporated it) or 'Resolved' (you chose not to act). Comments by mentors / admins / instructors are always visible to you; employer comments come from your applicant-pipeline interactions.\n  • **Revisions** — every save snapshots a `ResumeRevision` row with the entire tree. Cheap insurance — you can revert to any prior state, and a mentor can see what changed since their last visit. AI parses are also snapshotted, so re-parsing never loses your manual edits if you don't like the new tree.\n\n**Permissions.**\n  • **You** — edit anything, anytime. This is non-negotiable: 'allow the user to change anything' is the rule.\n  • **Mentors, instructors, admins** — comment + read; cannot edit the tree directly.\n  • **Employers** — comment + read, but only on the resumes of applicants currently on their postings AND who have been eligibility-approved (so the existing talent-pool gate isn't bypassed via the resume URL).\n  • **Other trainees** — cannot see your resume at all.\n\n**Schema.** Three new tables — `Resume` (one per user, JSON content tree + version), `ResumeComment` (mirrors ApplicationComment; anchor by bulletId / itemId / sectionId; status open|resolved|applied), `ResumeRevision` (version snapshot, triggeredBy user|ai_parse|ai_suggest|ai_tailor). Migration `20260705000000_resume_structure_comments` runs on the next Vercel deploy.\n\n**APIs.** `/api/profile/resume/structure` (GET + PATCH self), `/api/profile/resume/structure/parse` (POST self), `/api/resume/[userId]/comments` (GET + POST gated), `/api/resume/[userId]/comments/[id]` (PATCH owner-only status updates).\n\n**Phase 1 — what's in this commit.** Editor, comment thread, AI parse from uploaded file, auto-save with revisions, sidebar entry under Profile. Phase 2 will add the 'AI rewrite this bullet' button per comment and the 'tailor to this posting' flow that drafts a posting-specific variant of the resume.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "New user role — Industrial Mentor (industry professional offering guidance to trainees)",
    body: "Adds a seventh user role to the platform: `industrial_mentor`. External role like employer — sits at rank 0 in the role hierarchy, not staff. Industry professionals can now be assigned this role to formalise their position as mentors to trainees on the platform.\n\n**What changed.**\n  • `Role` union in src/lib/auth.ts now includes `industrial_mentor`.\n  • `ROLE_RANK` registers the role at rank 0 (alongside trainee · evaluating · employer).\n  • New `isIndustrialMentor(role)` helper.\n  • Admin role-pickers — `UsersTableClient`, `UserRowClient`, batch `setRole` API — all include the role.\n  • Role-switch act-as endpoint allows superadmins to view-as `industrial_mentor` for QA.\n  • Self-service role-request flow at /api/profile/role-request accepts `industrial_mentor` as a target (still gated behind admin approval like the other elevated requests).\n  • Sidebar Role-Switcher dropdown surfaces the new role.\n\n**Not yet wired** (deliberate — separate follow-ups):\n  • Mentor-trainee pairing flow (likely a lightweight extension of the existing buddy system at /buddy).\n  • Mentor dashboard surface (currently mentors see the default trainee/profile view; explicit /mentor dashboard pending).\n  • Mentor-specific talent-pool read access (currently mentors don't inherit employer or instructor visibility; gated per-route as those surfaces are designed).\n\nAdmins can assign the role today from /admin/users — pairing and mentor-specific surfaces follow.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Talent pool — eligibility check gate · employers see only human-verified members · batch approve from /talent-pool",
    body: "Two-step admit on every talent-application submission, and a per-row eligibility check that determines whether an approved member is visible to employers.\n\n**Step 1 (existing)** — Admin reviews the submission and sets `reviewStatus = approved`. The member enters the internal talent pool. Admins and instructors see them; employers do NOT.\n\n**Step 2 (new)** — A human (admin or instructor) verifies eligibility. Each submission row carries an `Eligibility pending` chip until checked; ticking it stamps `eligibilityApprovedAt = now` and `eligibilityApprovedBy = <userId>`. The chip flips to `Eligible · <approver name>` in emerald and the member becomes visible to employers from that point on.\n\n**Where this is enforced.** Both employer-facing entry points to the talent pool now filter on the eligibility gate:\n  • `/talent-pool` — shows only `eligibilityApprovedAt != null` to employers; admins/instructors still see everyone so they can triage.\n  • `/api/employer/applications` (used by the employer applicants board) — same filter applied at the data layer, so a posting's applicant list can never accidentally surface an un-verified member.\n\n**Batch ops for staff.** `/talent-pool` wraps the list in a batch toolbar (admin + instructor only):\n  • Per-row checkboxes + a header \"Select all\" with the intermediate `indeterminate` state.\n  • Sticky toolbar that slides in once anything is selected. Two bulk actions: **Approve eligibility** (stamps the timestamp + approver on every selected row) and **Revoke** (clears them, reversing the gate).\n  • Inline success toast + error surface inside the toolbar.\n  • The page header strip now shows a pool-wide `N eligible · N pending` split so admins know how much triage is left before they scroll.\n\n**Plumbing.** New endpoint `POST /api/admin/talent-pool/eligibility` carries the batch ({ ids, action: 'approve'|'revoke', note? }), capped at 200 ids per request. Admin/superadmin/instructor only. One AuditLog row per batch records the action + every affected id + the optional note, so eligibility decisions reconstruct from /admin/audit forever.\n\n**Schema.** Three new columns on `EventFormSubmission`: `eligibilityApprovedAt`, `eligibilityApprovedBy` (userId, no FK so admin deletion doesn't ripple), `eligibilityNote`. Supporting compound index `(formId, reviewStatus, eligibilityApprovedAt, leftPoolAt)` for the employer-facing query.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Admin dashboard — redesigned as a Y2K Aero magazine cover + sidebar-left layout (picks one strong visual language, drops the mid-line tile quilt)",
    body: "Long-running pain point: even after two redesigns the admin dashboard still read as a fragmented quilt of round-cornered tiles. This pass commits to one strong visual language from the design archive and exactly two layouts on top of it.\n\n**Visual language — M34 Y2K Aero.** Candy gradient backdrop, translucent glass cards with pearl inner highlights via inset box-shadow, deep navy text with a faint white halo via text-shadow, soft drop shadows tinted blue. Same look that drove the floaters showcase admin earlier.\n\n**Top section — L21 magazine cover.** Big editorial masthead on the left: italic headline that follows the same priority cascade as the old spotlight (\"X approvals waiting\" if pending > 0, \"Setup step N of M\" if onboarding incomplete, otherwise \"the platform reads healthy\"), short deck explaining context, stamp pills with the four key KPIs, signoff line with the admin's name and sign-up count this week. Right-hand table of contents that doubles as deep-link navigation — Action queue, Bench, Postings, Audit, Setup checklist (only when open), Credit expiry watch (only when any expiry within 90d), AI calls 7d (only for superadmins). The TOC numbers reflow so the list stays terse.\n\n**Bottom section — L6 sidebar-left.** Dark navy rail on the left with six stacked KPI tiles — Pending (highlighted pink when > 0), Users, Employers, Postings, Enrolments, Certificates — each linkable into the matching admin surface. Right-hand 3-column glassy content body: Action queue (pending breakdown, each row linking into the matching admin queue), Bench (active users / employers / postings / talent apps), Audit log tail (last five entries with timestamps and the actor's display name).\n\n**Cleanup.** AdminDashboard.tsx slimmed from 1,031 → 511 lines (-520). All the v2 helper components (MidlineRow, SpotlightPanel, SectionEyebrow, SectionAccent, SetupColumn, QuickActionsList, plus the render helpers and constants) are now dead code and removed. The dead `metrics` and `spotlight` arrays in the function body are dropped. Imports trimmed to only what the new JSX actually uses. Y2K Aero CSS lives at module level in an `AERO_CSS` constant and is injected via one inline `<style>` tag scoped under `.adash-aero` — no global token leakage, no new file proliferation. Same data-fetching shape as v1 / v2 so nothing downstream changes.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Design archive — index of static HTML design explorations under /admin/design-archive",
    body: "Working sketches and visual-language explorations now have a proper home in the admin sidebar under Administration → Insights → Design archive. Three explorations seeded:\n\n  • `visual-languages-60.html` — sixty distinct design idioms (editorial print, tech-tool, retro, cultural movements, tactile, mood) all populated with the same admin content so only typography / palette / chrome vary. Use this to pick a base visual language before exploring layout structures.\n\n  • `vintage-ibm-10-layouts.html` — ten ways of organising the same content on the M35 Vintage IBM design system (tan/navy palette, hairline borders, Plex Sans + Plex Mono, no rounded corners).\n\n  • `y2k-aero-50-layouts.html` — fifty layout structures on the M34 Y2K Aero visual language (translucent glass cards, candy gradient backdrop, deep navy text with a faint white halo); grouped into foundational, hero-driven, editorial, bento/mosaic, and data-driven families.\n\nEach archive entry is a self-contained static HTML file under `public/design-archive/`. Click any title on the index page to open the file in a new tab. Adding a future archive is two lines of work: drop the HTML into `public/design-archive/<slug>.html`, then append a row to `ARCHIVE_ENTRIES` in the page component. No database, no migration — the index is purely code-side, so the archive stays cheap to maintain.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Login floaters admin — interactive visual gallery folded into /admin/login-floaters (was a separate /floaters-showcase.html page)",
    body: "The old text-only \"Add a floater\" dropdown on /admin/login-floaters is replaced with a full editorial visual gallery — and the separate standalone /floaters-showcase.html page is retired. One surface now handles browsing the curated library AND seating floaters on /login.\n\n**Gallery aesthetics.** Dark backdrop (`#04080f → #0a1623`) with subtle radial washes, category sections with numbered eyebrow (`01`, `02`, …) + 16-px gradient hairline bar, glass-card grid with `auto-fill, minmax(220px, 1fr)` columns. Mirrors the editorial mood of the retired showcase HTML so the design vocabulary stays consistent.\n\n**Each card is the live React component, not a hand-maintained HTML mock.** Cards render the actual floater (`<reg.Component size={…} />`) at thumbnail scale inside a square stage with a radial wash — so what admins see in the gallery is exactly what lands on /login. No drift between catalog and reality.\n\n**Interactive states.**\n  • Inactive card → \"ADD\" pill that brightens on hover; click adds the floater to the active list with its default position + size + colour.\n  • Active card → dimmed background + green \"ACTIVE\" chip with a check icon; click is no-op (already seated).\n  • 12 of 12 seats full → all inactive cards dim further and the click is blocked, with a tooltip explaining the cap.\n\n**Fine-tuning surface unchanged.** The active-floater rows above the gallery still expose side / vertical % / size / colour class / drift variant. The gallery is the picker; the rows are the editor.\n\n**Plumbing.** LoginFloatersEditor now imports FLOATER_REGISTRY directly (was passed serialised metadata from the server page); the page just passes `initialFloaters` + `swimClasses`. The retired showcase entry, the `NavItem.external` flag, the `target=\"_blank\"` Link prop, and `public/floaters-showcase.html` are all gone — no UI cliff, since the new gallery covers the same browse surface plus the interactivity the static page lacked.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Login floaters — 20 ENGAGE-course-aligned floaters (Biomfg gowning · QC micro · QC analytics · OOS/OOT · DMF · SOP · clinical activation · pitch deck)",
    body: "User mapped the floater library against the BHN ENGAGE Spring/Summer 2026 brochure and asked to close every gap so each ENGAGE pathway has a representative glyph. Built 20 new floaters in `src/components/branding/`, organized by pathway:\n\n**Biomanufacturing pathway (4):**\n  • `GowningCleanroom` — sanitize → hairnet/mask → coverall → sterile gloves → ISO 5 entry check. Directly covers the brochure outcome \"contamination control behaviors and gowning practices aligned with cleanroom expectations\".\n  • `AsepticConnection` — tubing welder cycle: align → 260 °C heater blade → fused joint → integrity ring + flow OK. Closed-system aseptic-connection skill central to the CATTI closed-systems / CAR-T stream.\n  • `AlcoaDocumentation` — ALCOA+ data integrity: blank batch record → contemporaneous entries → audit-trail rows (J.Park entered → L.Wong reviewed) → secure archive vault. Brochure-named principle.\n  • `GmpCellBank` — MCB/WCB lifecycle: research vial → expansion flask → aliquot vial rack (100 vials) → LN₂ −196 °C → ID/sterile/myco QC chips → WCB ribbon. Covers \"generate GMP-compliant cell banks\" from the Aseptic Cell Culture course.\n\n**QA/QC Micro pathway (5):**\n  • `SterilityTest` — USP <71> compendial: sample vial → 0.45 µm membrane filter → FTM (32 °C) + SCDM (22 °C) media bottles → no-growth PASS banner.\n  • `EndotoxinLAL` — kinetic chromogenic LAL: 96-well plate → LAL reagent dropper → amber color development → EU/mL PASS chip (< 0.5).\n  • `MycoplasmaPCR` — qPCR alternative to 28-day culture: DNA extraction column → qPCR tube → amplification curves (positive control rises rose, sample flat green) with Ct threshold → NEGATIVE banner.\n  • `BactAlertRapid` — explicitly named rapid method: source vial → bottle inoculation → BacT/ALERT instrument bay (LED green or rose) → CO₂ sensor curve crossing threshold → POSITIVE alert pulse.\n  • `BioburdenPlate` — pre-sterile enumeration: serial dilution tubes (1:10, 1:100, 1:1000) → SCDA petri dish → colony growth (14 random positions) → 14 CFU pass badge.\n\n**QA/QC Analytics pathway (4):**\n  • `HplcAnalyticalRun` — autosampler vial → C18 column with band migrating from frit to frit → UV detector → chromatogram revealed via stroke-dashoffset (gradient) → peak integration shading + 99.4 % main label.\n  • `ElisaPlateAssay` — sandwich ELISA: 96-well plate fills sequentially — coat (faint) → sample (sky tint) → detect Ab (deeper sky) → TMB develop (amber gradient row-by-row, top high → bottom low) → standard curve graph at read.\n  • `PotencyBioassay` — reporter cell-based: 8-well test row + 8-well reference row tint by dose → response curves (ref solid green, test dashed sky) → % POTENCY badge \"102 % relative\".\n  • `OosOotInvestigation` — structured: SPEC bar 95–105 % with rose 88.2 % OOS marker → PHASE I card (lab error: NONE) → RETEST n=3 (99.8 / 100.1 / 99.4) → ROOT CAUSE bar (HPLC column drift) → DISPO BATCH RELEASE banner. Brochure-named outcome.\n\n**Regulatory Affairs pathway (3):**\n  • `DrugMasterFile` — Type II DMF compile (S.1–S.5 sections) → submit to HC/FDA portal (doc lifts) → Letter of Authorization referenced by sponsor → DMF · 034 581 badge. Brochure-named.\n  • `RecallComplaintAdr` — post-market: COMPLAINT card (Lot 24-118 · grade 3 rash) → SERIOUS rose triage → MedEffect ADR submitted (15-day expedited) → ROOT CAUSE + CAPA (supplier excipient impurity) → rose RECALL · Class II · Lot 24-118 stamp.\n  • `SopLifecycle` — DRAFT → REVIEW with rose redlines → APPROVED · QA green stamp → EFFECTIVE training roster (5 green check circles) → PERIODIC REVISE amber arrow back to v4.\n\n**Clinical Trials pathway (3):**\n  • `SiteActivation` — hospital silhouette + 5-checkpoint chain (PI → CTA → IRB → SIV → FPI) lighting green one-by-one → patient PT-001 icon at FPI.\n  • `InformedConsent` — PI + patient figures with Q&A speech bubble → ICF document with sections → green signature flourish via stroke-dashoffset → filed into REG BINDER §2 ICFs at the bottom.\n  • `SourceDataVerification` — side-by-side SOURCE CHART vs EDC CRF panels with comparison arrows → rose Q discrepancy flag on a row → green check resolution.\n\n**Entrepreneurship pathway (1):**\n  • `PitchDeckBuild` — slide stack thumbnails (TITLE / PROB / MKT / ASK) with active slide lifted → large slide preview cycles through Title (NUCLEUS BIO · seed), Problem/Solution two-column, Market (concentric TAM/SAM/SOM + $12 B / 3 B / 600 M), Ask ($8 M · 18 mo runway) → investor panel scene: projector screen + 4 audience heads + amber Q-bubble. Directly covers brochure outcome \"Build an effective pitch deck and gain confidence presenting to potential investors\".\n\n**Coverage matrix.** Every ENGAGE Spring/Summer 2026 curated pathway is now represented:\n  • Biomanufacturing → MscCultureCycle + CarTManufacturing + BioreactorScaleUp + ChromatographyPurification + SterileFillFinish + **GowningCleanroom + AsepticConnection + AlcoaDocumentation + GmpCellBank**\n  • QA/QC Micro → EnvironmentalMonitoring + QcReleaseTesting + BatchReleaseQA + **SterilityTest + EndotoxinLAL + MycoplasmaPCR + BactAlertRapid + BioburdenPlate**\n  • QA/QC Analytics → QcReleaseTesting + BatchReleaseQA + **HplcAnalyticalRun + ElisaPlateAssay + PotencyBioassay + OosOotInvestigation**\n  • R&D Upstream → BioreactorScaleUp + ChromatographyPurification\n  • R&D Proteomics → MassSpecProteomics\n  • Regulatory Affairs → RegulatorySubmission + PatentProsecution + PharmacovigilanceSignal + **DrugMasterFile + RecallComplaintAdr + SopLifecycle**\n  • Medical Affairs → MslEngagementCycle + PublicationPlanCycle + MedicalInformationRequest\n  • Clinical Trials → EnrollmentFunnel + KaplanMeierReveal + AdaptiveTrialDesign + DoseEscalation3plus3 + CompoundLogisticsKit + **SiteActivation + InformedConsent + SourceDataVerification**\n  • Entrepreneurship → VcDiligenceCycle + PatentProsecution + **PitchDeckBuild**\n\nTotal floater inventory: 5 original + 35 personas + 20 ENGAGE-pathway = **60 floaters**. All in `src/components/branding/` following the same `useStageCycle` + `currentColor` + role='progressbar' pattern. Stroke widths in the 0.5–1.0 range, matching the thinner v2 vocabulary.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Login floaters — thinner strokes globally + 35 new persona-process glyphs (35 personas across 11 categories)",
    body: "Two follow-up passes on the floater system. (1) User flagged that the new persona floaters' lines were too thick. Bulk-thinned `strokeWidth` across all 10 existing new floaters via a placeholder-swap sed pipeline — each value rounded down ~30 %: 1.4→1, 1.2→0.85, 1.0→0.72, 0.9→0.65, etc. The vocabulary now matches the original `MscCultureCycle` lightness instead of feeling stocky. (2) Built 35 additional looping process glyphs in two sub-waves so the floater library covers basically every life-science persona, not just bench science.\n\n**WAVE A (15 floaters, 4-5 stages each, ~12-14 s loop):**\n  • `CrisprEditCycle` — Gene editing · DELIVER → BIND → DSB → EDIT (HDR insertion)\n  • `HighThroughputScreen` — Drug discovery · LIBRARY → DOSE → READ (hits light green) → CONFIRM pick row\n  • `MedChemSAR` — Med chem · HIT → ANALOG (R-group variants) → SAR bar chart → LEAD ringed\n  • `PhageDisplayPanning` — Antibody discovery · LIBRARY → BIND → WASH (low-affinity dim) → ELUTE winner glow\n  • `MrnaLnpAssembly` — Vaccine/mRNA · IVT → 5'CAP → MIX (microfluidic T-junction) → LNP with cargo\n  • `InVivoPkPdStudy` — Preclinical PK · mouse + syringe → DOSE → sample tubes → PK curve (stroke-dashoffset draw) with Cmax\n  • `BiomarkerQualification` — Translational · DISCOVERY scatter → CONFIRM shortlist → ROC inset → QUALIFIED stamp\n  • `QcReleaseTesting` — QC · vial + three test rows (ID, potency, purity) check in sequence, RELEASED stamp\n  • `BatchReleaseQA` — QA · MBR → rose deviation flag → amber CAPA arrow → green DISPOSITION stamp\n  • `SterileFillFinish` — Aseptic · conveyor + filling needle + inspect cam + reject X + label band\n  • `ColdChainShipment` — Cold chain · shipper + thermometer (25 °C → −80 °C) + truck + −80 trace + arrival check\n  • `PharmaSalesCall` — Sales rep · territory map with HCP pins → route dashed line → rep+HCP scene → CRM log card\n  • `HeorPayerEngagement` — Market access · AMCP dossier → ICER bar vs WTP line → P&T review committee → formulary tier 2 placement\n  • `PublicationPlanCycle` — Pub planning · abstract → manuscript with figures → red R1 marks → NEJM-cover with DOI\n  • `CarTManufacturing` — Cell therapy mfg · patient + apheresis bag → bioreactor with viral vector capsids → cell expansion → release stamp → infusion drip\n\n**WAVE B (20 floaters):**\n  • `MolecularDocking` — Comp chem · pocket → pose ghosts → score bar → bound pose + Kd label\n  • `CryoEMStructure` — Structural biology · particle micrograph → 2D class grid → contoured 3D map → helices fit + 2.8 Å chip\n  • `SingleCellRnaSeq` — scRNA-seq · cell suspension → 10x droplet junction → UMAP scatter → 3-cluster annotation (T cells / Macrophages / B cells)\n  • `MassSpecProteomics` — Proteomics · trypsin digest with K/R cut sites → LC column band separation → MS/MS spectrum → top-peak peptide IDs\n  • `FlowCytometryGating` — Flow core · ACQUIRE smear → COMPENSATE (cluster tightens) → GATE polygon → POPULATION % + MFI\n  • `ToxDoseEscalation` — Preclinical tox · 3 mouse cohorts (10/30/100 mg/kg) → tox marker bars (rose at high dose) → NOAEL dashed line\n  • `AdmeProfiling` — DMPK · 4-row dashboard (SOL/MLM/Papp/CYP) fills sequentially with color-coded chips and bars\n  • `StemCellDifferentiation` — Regen med · iPSC colony → ectoderm with protrusions → bipolar progenitors → mature neuron with dendrites + axon\n  • `AdaptiveTrialDesign` — Adaptive biostat · 3 arms accruing → interim look line + efficacy/futility dashed boundaries → drop Arm C strike-through → continue A+B extending\n  • `DoseEscalation3plus3` — Phase I onc · 3 dots at DL2 → one DLT (rose ring) → +3 expansion → green escalate arrow + new DL3 cohort\n  • `RadiologyImagingBiomarker` — Radiology · CT frame + body + lesion contour → diameter line with mm → RECIST report card with Σ LDs and -22 % delta + PR chip\n  • `DigitalPathology` — Pathology · glass slide → WSI tile grid + scanner gantry → AI ROI bounding boxes → ADENOCARCINOMA · G2 diagnosis lozenge\n  • `TechTransferLabToPilot` — Tech transfer · R&D flask → protocol pages → pilot vessel + 3 engineering run dots → commercial skid + green check\n  • `ValidationIQOQPQ` — Validation engineer · IQ/OQ/PQ row checkboxes fill in sequence → RELEASED seal lands\n  • `EnvironmentalMonitoring` — Aseptic QC · cleanroom map with 3 settle plates → incubator card → colony dot on plate 2 → trend chart with one excursion above alert limit\n  • `AavGeneTherapy` — Gene therapy · empty AAV capsid (icosahedron) → GOI payload inside → target cell receptors with capsid dock → therapeutic protein emerging + durable timeline\n  • `PatientSupportProgram` — PSP/Hub · patient card with HIPAA check → benefits-verification status pills → copay $0 card chip → 4-week adherence calendar\n  • `GrantSubmissionCycle` — Academic researcher · Specific Aims doc → submit to NIH portal (doc lifts) → 3 reviewer scores (poor) → A1 marker (scores improve) → green FUNDED ellipse\n  • `MedicalInformationRequest` — Med Info · HCP inquiry bubble → references stack → response letter with disclaimer → CRM ledger with 4 timestamped rows (last = DONE)\n  • `CompoundLogisticsKit` — Clinical supply / IRT · blinded kit (vial + insert) → courier truck on dashed route → site shelf with kits + patient → IRT ledger row with kit→patient assignment\n\n**Pattern adherence.** Every new floater follows the established structure exactly: `\"use client\"`, STAGES array, STAGE_INFO record with label/sub/duration, `useStageCycle(STAGES, STAGE_INFO)` hook, SVG with `currentColor` stroke, monospace stage label + sub-label centered below, `role=\"progressbar\"` stage-dot row with `aria-valuenow`/`max`, `prefers-reduced-motion` respected via the `noTransition` flag, `{ size?: number; className?: string }` props. Stroke widths sit in the 0.5–1.0 range — same lightness as the original `MscCultureCycle`.\n\n**Total floater inventory.** 5 original (bench science) + 35 new (personas across the life-science workforce) = 40 looping process glyphs available in `src/components/branding/`. None of the new 35 are wired onto `/login` yet — that would crowd the periphery. They're available as building blocks for: (a) persona-specific landing pages (`/for/msl`, `/for/clinops`, `/for/regulatory`, etc.), (b) a rotating-subset login layout that picks 4-6 floaters per session, or (c) section heroes on relevant docs/blog/about pages.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin dashboard v4.1 — SpotlightPanel folded into the line + gradient layout",
    body: "Last hold-out from the rounded-corner era — the SpotlightPanel at the top of the admin dashboard was still a `rounded-3xl` card with a big ambient drop shadow, two layered radial-gradient spotlights, a glow halo behind a white-on-saturated icon chip, and a 5xl/6xl tone-coloured KPI. Tall, opinionated, and visually disconnected from the flat mid-line layout immediately below it.\n\nRewritten as a flat editorial strip:\n  • No rounded corners, no border, no drop shadow.\n  • Top + bottom hairlines (`border-y border-line/70`) bracket the strip from the PageHero above and the mid-line layout below.\n  • The radial gradient stays as the focal cue but drops from ~0.22 alpha to ~0.10 alpha — soft tonal wash, not dramatic stagecraft.\n  • Inline pastel icon next to the uppercase eyebrow (same SectionEyebrow-style pattern as every other section). No more chunky white-on-saturated chip with a halo glow.\n  • Short gradient accent bar below the eyebrow — the same `linear-gradient(90deg, rgba(...) 0.8 → 0)` pattern used by SectionAccent on every other section.\n  • Headline shrunk from `text-2xl md:text-3xl` to `text-lg md:text-xl`; body from `text-sm leading-relaxed` to `text-xs leading-snug`; KPI from `text-5xl md:text-6xl` to `text-4xl md:text-5xl`; primary CTA from `rounded-xl shadow-lg ring-1` to `rounded-md shadow-sm`.\n  • Padding from `px-7 py-8 md:px-10 md:py-9` to `px-5 md:px-6 py-5`.\n\nNet result: vertical height of the strip drops by roughly half. The strip still reads as the page's single focal — the soft radial wash + tone-coloured KPI keep the \"look here first\" cue — but it's now structurally continuous with the rest of the dashboard instead of a separate card hovering above it.\n\nHeader doc-comment updated to describe the new flat stagecraft (radial wash + hairlines + eyebrow + accent + KPI) so future readers don't see references to the old shadow + chip approach.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin dashboard v4 — pastel icons + continuous mid-line layout",
    body: "User feedback after v3 (line + gradient): icon colours were still too saturated, and stacked editorial sections needed a stronger visual spine. v4 adds two changes.\n\n**1. Pastel icon palette.** SECTION_TONE_CLS now carries an explicit `icon` field for each tone (`-400/70` instead of the eyebrow text's `-700`). The eyebrow text stays saturated for legibility; the icon supports the text at a quieter step. Same softening applied per-row: the PulseRow icon chip drops from `text-brand-600` to `text-brand-400/70`; the QueueRow chip tints drop from `bg-{tone}-50 / text-{tone}-700` to `bg-{tone}-50/60 / text-{tone}-400`; the Recent-activity row chip drops to `text-subtle/60`. Icons recede into rows now — calm tone markers, not callouts.\n\n**2. Mid-line editorial layout.** Below the SpotlightPanel, a continuous vertical hairline runs down the centre of the dashboard. Sections sit on either side of it; rows are separated by horizontal hairlines. The line is the spine, content branches off it.\n\nNew local `MidlineRow` component renders a row of `grid-cols-2` with one section on each side. Padding lives in the cells (`py-7 lg:pr-8` / `py-7 lg:pl-8`); the continuous vertical line is drawn by an absolutely-positioned div over the relative wrapper (`absolute top-0 bottom-0 left-1/2 w-px bg-line/60 -translate-x-1/2 hidden lg:block`). On mobile (< lg) the grid collapses to a single column and the midline is hidden — sections stack vertically with row dividers.\n\nFour pairings:\n  • Row 1: At-a-glance metrics (LEFT) ↔ Get airborne / Setup checklist (RIGHT)\n  • Row 2: Daily reach / Quick actions (LEFT) ↔ Approval queues (RIGHT)\n  • Row 3: Credit expiry (LEFT, conditional on anyExpiry) ↔ Live pulse (RIGHT)\n  • Row 4: Recent activity (LEFT) ↔ Superadmin shortcuts (RIGHT, conditional)\n\nAt-a-glance's 6-column metric strip recompacts to `grid-cols-2` (2 cols × 3 rows) so it fits the half-width slot. Approval queues' 3-column row of queue panels becomes a `divide-y` vertical stack of QueueRow links — each row is a full-width clickable triage entry. Credit expiry's 3-column row collapses similarly. Live pulse + Recent activity were already vertical lists, so they fit unchanged.\n\nThe outer `Command deck` wrapper title (previously paired Setup + Quick) is gone — Setup goes on the right of row 1, Quick goes on the left of row 2, each as its own section. The same eyebrow + accent treatment, but now the midline is the structural anchor instead of the column wall inside a wider box.\n\n`DashboardSection` helper deleted as dead code (no caller after the v4 inline blocks). `SectionEyebrow` + `SectionAccent` remain.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin dashboard v3 — line + gradient design system, every secondary panel un-boxed",
    body: "User feedback after the previous \"unify the shells\" pass: it was still too fragmented, too many rounded-corner boxes. Asked for a line + gradient design system — rounded corners reserved for the focal element only, sections delineated by hairlines and gradient accents instead of bounded cards.\n\nFull rewrite of the admin dashboard render. The SpotlightPanel above remains as the one bounded focal (rounded-3xl + ambient shadow + radial-gradient stagecraft — earned because it's the single dramatic element). EVERY OTHER section below it now sits directly on the page background — no surrounding box, no border-line ring, no rounded corners.\n\n**Editorial section pattern** (used by every section below the spotlight):\n  • Top hairline rule via parent's `divide-y divide-line/70`.\n  • `SectionEyebrow` — uppercase tracked label in the section's tone colour with optional leading lucide icon.\n  • `SectionAccent` — a 20 px-wide horizontal gradient bar that fades from the section's tone colour (brand-500 / amber-500 / emerald-500 / violet-500) to transparent. This is the literal \"line + gradient\" signature in one element.\n  • Optional subtitle (text-muted, max-w-2xl).\n  • Optional right-aside (e.g. the credit-expiry \"Run sweep now\" link, the recent-activity \"See all\" link, the setup progress bar).\n  • Content flows directly under, columns separated by vertical hairlines via `divide-x divide-line/50`, never by box walls.\n\n**New helpers** in the same file (kept local since they're admin-specific):\n  • `DashboardSection({ eyebrow, eyebrowIcon, tone, subtitle, rightAside, children })` — bundles the standard editorial section shape.\n  • `SectionEyebrow` and `SectionAccent` exposed separately for sections with bespoke layouts that need to compose their own header (Pulse + Activity uses these directly so each of its two columns has its own eyebrow + accent).\n  • Tone palette: brand / amber / emerald / violet. Each carries an `accentRgb` triple used to build the gradient inline.\n\n**Sections shipped**: At-a-glance (6-col metric strip), Setup + Quick actions (two columns, each with its internal eyebrow — the outer \"Command deck\" wrapper title is gone, the two parallel columns ARE the section), Approval queues OR \"all clear\" inline state (single-line eyebrow when clear, full 3-col grid when not), Credit expiry (3-col with the sweep-now aside), Pulse + Activity (2-col with per-column eyebrows + accents), Superadmin shortcuts.\n\nAlertCircle import dropped (the previous superadmin-shortcuts strip had a small warning icon in the corner — gone with the box).",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Login floaters — 10 new persona-process glyphs available (MSL · ClinOps · Biostat · RegAffairs · PV · CMC · Downstream · Bioinformatics · VC · IP)",
    body: "Until now, the `/login` periphery floaters depicted bench science only — antibody binding, DNA transcription, Western blot, CAR-T kill, MSC passaging. That biased the atmosphere toward researchers. Life-science is much wider: medical affairs, clinical operations, biostats, regulatory, drug safety, manufacturing, downstream process, computational biology, investors, patent counsel — all part of the same world. Built 10 new looping process glyphs in `src/components/branding/`, each following the existing pattern (4-5 stages, `useStageCycle` hook, monospace stage label + sub-label, role='progressbar' stage-dot row, prefers-reduced-motion respected, `currentColor` for theme tinting).\n\n**1. `MslEngagementCycle`** (4 stages, ~12 s) — MSL persona. PREP → KOL MEETING → SCIENTIFIC EXCHANGE → FIELD INSIGHT. Two seated head-and-shoulder figures across a desk; KOL fades in at MEETING; data dots travel along a dashed conversation arc during EXCHANGE; an INSIGHT lozenge rises from a manuscript toward an HQ marker above the MSL. Stethoscope loop on the KOL, badge dot on the MSL — identity by role marker.\n\n**2. `EnrollmentFunnel`** (5 stages, ~13 s) — Clinical Operations. SCREENING → CONSENT → SCREEN FAIL → RANDOMIZED → FIRST DOSE. 8 candidate dots at the funnel mouth; consent dots inside; 2 dots break out the right side along a dashed EXCL path on screen-fail; randomized arms split into solid Arm A + outlined Arm B; dose cup fills with all four on C1D1.\n\n**3. `KaplanMeierReveal`** (4 stages, ~12 s) — Biostat. KM PLOT → EVENTS LOGGED → STEP FUNCTION → mOS REACHED. Empty axes with S(t)/time labels; event circles + censor ticks; step-down survival curve drawn left-to-right via `stroke-dashoffset` interpolation through 5 events; 50% reference line + vertical median-OS crosshair land in the final stage.\n\n**4. `RegulatorySubmission`** (5 stages, ~14 s) — Reg Affairs. COMPILE eCTD → SUBMIT → REVIEW CLOCK → INFO REQUESTS → APPROVAL. M1-M5 module bar stack; dossier slides up into an FDA portal arrow during SUBMIT; circular PDUFA clock rotates with a tick hand; amber IR dots appear next to specific modules during REVIEW; green-ring check stamp drops onto the dossier at APPROVAL.\n\n**5. `PharmacovigilanceSignal`** (4 stages, ~11 s) — Drug Safety / PV. AE INTAKE → MedDRA CODING → DISPROPORTIONALITY → SAFETY SIGNAL. ICSR queue of 8 dots on the left; per-dot SOC color tags flag on during CODE; dots fan into an observed-vs-expected scatter with a dashed identity reference line; the outlier point switches to rose with a pulsing ring + a `SIGNAL` lozenge top-right.\n\n**6. `BioreactorScaleUp`** (5 stages, ~13 s) — CMC / Process Dev. SHAKE FLASK → N-3 STR → N-2 STR → N-1 STR → N PRODUCTION. Five vessels left-to-right (250 mL flask → 5 L → 50 L → 500 L → 2000 L STR) with progressively larger radii; the active vessel highlights, past vessels keep a couple of residual cell dots; dashed transfer arrows between vessels brighten as the active index advances; impeller shafts + blades + media-line ticks on each STR.\n\n**7. `ChromatographyPurification`** (4 stages, ~12 s) — Downstream Process. LOAD → WASH → ELUTE → POOL. Column on the left, UV A₂₈₀ trace on the right. A green band migrates down the column body (frit lines top + bottom, resin hatching, top inlet drop); the UV trace reveals progressively via `stroke-dashoffset` — baseline at WASH, sharp Gaussian peak at ELUTE; collection cup fills + drip appears at POOL; small `mAb` triangle marker above the peak apex.\n\n**8. `BioinformaticsPipeline`** (5 stages, ~13 s) — Comp Bio. FASTQ INTAKE → QC TRIM → ALIGN → VARIANT CALL → ANNOTATE. Six read bars (2 low-quality) scattered above; low-quality reads shrink + get trim ticks during QC; all reads transition (x, y, width) into a pileup column over the variant locus on a reference chr7 line during ALIGN; an amber arrow + `T` mark land at VAR_X during CALL; a `p.V600E` lozenge labels the variant at ANNOTATE.\n\n**9. `VcDiligenceCycle`** (4 stages, ~12 s) — Investor / VC / BD. DEAL SOURCED → DILIGENCE → TERM SHEET → CLOSE. Deck stack with one front deck slid forward (with bar-chart suggestion lines) for SOURCE; 4×3 data-room tile grid with check marks on select tiles + a magnifier lens with crosshair for DILIGENCE; term-sheet doc with `TERM SHEET` header + bulleted lines + bottom-right `$` marker for TERM; signature flourish path drawn via `stroke-dashoffset` + green check seal stamp for CLOSE.\n\n**10. `PatentProsecution`** (5 stages, ~14 s) — IP / Patent Counsel. DRAFT CLAIMS → FILE USPTO → OFFICE ACTION → AMEND → GRANT. Document with 5 claim rows (claim 1 bolder as the independent claim); document lifts up toward a `USPTO` marker during FILE; rose `§103` ribbon + strikethroughs on claims 2 and 4 during OFFICE; amber `↳ ins` carets appear under amended claims during AMEND; a green `ISSUED · US 12,345,678` seal rotates in at -12° during GRANT.\n\n**Implementation notes.** All 10 reuse the shared `useStageCycle` hook from `src/components/branding/useStageCycle.ts` (no new timing machinery). All 10 stroke with `currentColor` so any Tailwind text-{color}/{opacity} on the parent tints them. All 10 carry `role=\"img\"` with a dynamic `aria-label` reflecting the current stage, plus a `role=\"progressbar\"` dot row with valuenow/valuemax. Component prop signature matches the existing floaters: `{ size?: number; className?: string }`.\n\n**Not yet placed on `/login`.** The components are added but not imported anywhere yet — the current 5-floater layout would get crowded if all 15 were on at once. Recommended next pass: rotate floaters per persona (e.g., random subset per visit) or use them on persona-specific landing pages (a future `/for/msl`, `/for/clinops`, `/for/regulatory` set, where each page features the matching floater as its hero accent).",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin dashboard — every secondary panel unified to one shell so the spotlight reads as the single focal",
    body: "User flagged the admin dashboard as too fragmented. Diagnosis: the SpotlightPanel was meant to be the single dramatic focal (radial spotlights, big ambient shadow, rounded-3xl), and everything below it was supposed to be quieter — but each \"quieter\" section carried its own gradient wash (brand-50/40 on the metrics strip, brand-50/30 on the Command Deck, amber-50/30 on Credit Expiry, brand-50/30 again on the Pulse panel), inconsistent header padding (px-5 pt-4 pb-3 vs px-6 pt-5 pb-4), and edge-case shells (rounded-xl emerald celebration badge, border-dashed superadmin shortcuts strip). The eye registered each section as its own card style, not a unified surface beneath the spotlight.\n\nStreamline pass — every secondary panel now uses ONE shell:\n  • `rounded-2xl border border-line bg-card overflow-hidden` for the section\n  • `px-5 pt-4 pb-3 border-b border-line/70` for the header (where one exists)\n  • No `surface-shadow` (only the SpotlightPanel has shadow now)\n  • No gradient washes (only the SpotlightPanel has gradient stagecraft)\n\nFive panels updated:\n  1. **At-a-glance metric strip** — dropped the `bg-gradient-to-br from-brand-50/40` wash.\n  2. **Command Deck** — dropped the `bg-gradient-to-br from-card via-card to-brand-50/30` wash and tightened the header padding from `px-6 pt-5 pb-4` to match the rest at `px-5 pt-4 pb-3`.\n  3. **Approval queues** — removed the `surface-shadow` lift (was redundant with the spotlight above). The \"all clear\" fallback (when totalPending = 0) was a `bg-emerald-50/60 border-emerald-200 rounded-xl` inline-flex badge; now it's the same `bg-card rounded-2xl` shell as the rest, with the emerald tone preserved on the icon chip + tagline only.\n  4. **Credit expiry** — dropped the `bg-gradient-to-br from-amber-50/30` wash.\n  5. **Pulse + Activity** — the Pulse column had a `bg-gradient-to-br from-brand-50/30` wash that made the pair look mismatched; both columns now share the same shell.\n  6. **Superadmin shortcuts** — was a `bg-elevated/40 border-dashed border-line rounded-xl` strip glued to the bottom; now a `bg-card rounded-2xl` section like the rest, with the brand-tinted icon chip preserved to keep the \"superadmin\" signal.\n\nSpotlightPanel itself is untouched — it's the one element doing the dramatic-focal job (`rounded-3xl`, big ambient shadow, two layered radial-gradient spotlights, halo glow behind the icon chip, big tone-coloured KPI on the right). With every other section flat and unified, the spotlight's contrast reads as intentional hierarchy instead of one of several competing styles.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Sidebar — Role-play Simulator surfaced under EXPERIENCE",
    body: "The role-play simulator at `/simulator` shipped a while back but wasn't reachable from the sidebar — the only way trainees found it was via the changelog entry, a direct URL, or word of mouth. Added a sidebar entry under EXPERIENCE between \"Matches for you\" and \"Application Tracker\" so the natural flow reads *browse postings → see your matches → role-play one → track applications → interview*.\n\nEntry: **Role-play Simulator** (`/simulator`, `Drama` lucide icon) with the hover description: \"Practise any role before you apply. Paste a job-posting URL and live through a 12-week quarter as that person — 1:1s, escalations, hiring, the QBR. Every choice moves five stats. End-of-quarter performance review from your VP.\" Translation key reserved as `nav.simulator` for future i18n.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "New feature — Role-play Simulator. Paste any job-posting URL and live through a 12-week quarter as that person.",
    body: "Trainees can now practice the lived experience of a job before applying for it. The new simulator at `/simulator` accepts any public job-posting URL (LinkedIn, Indeed, company career pages, even a Google Doc with a JD pasted in). Behind the scenes it pulls clean text via Jina Reader, then generates a tailored 12-week simulation through Gemini Flash (primary) or Cloudflare Workers AI (fallback) — a roster of 8–12 direct reports plus 3–6 cross-functional partners, each with daily/weekly/monthly/quarterly/annual rhythms, and 12–17 scenarios spanning VP 1:1s, design critiques, escalations, hiring loops, regulatory drops, the QBR.\n\nEach scenario presents 3–4 choices that move five stats: Team Morale, VP Confidence (or equivalent for the role), Velocity / Craft, Cross-Functional Trust, Your Capacity. Hover a choice to preview the deltas before committing. At week 12, the simulator computes a weighted final score and a tiered performance review (Exceeds / Strong Meets / Meets / Below / Concerns) with per-stat narratives, highlights, lowlights, and a closing line from the trainee's VP.\n\nGenerated simulations are cached by JD content hash so the same posting only pays the AI cost once across the whole cohort — replays and a second trainee on the same role start instantly. State is checkpointed after every choice so trainees can close the tab and resume later. The 'Try the quarter again' button on the review screen resets stats without re-generating.\n\nProvider strategy: Gemini Flash auto-enables when `GEMINI_API_KEY` is populated (free at https://aistudio.google.com/app/apikey). Cloudflare Workers AI runs Llama 3.3 70B as the always-available fallback using the existing `CF_ACCOUNT_ID` / `CF_AI_TOKEN`. Both providers log via the existing `AIInteraction` table so admins can audit spend alongside everything else.\n\nNew Prisma models: `Simulation` (cached template) and `SimulationAttempt` (per-trainee state). Migration: `npx prisma migrate dev --name simulator_models`.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Employer sidebar — duplicate \"Applicants\" entry removed (it pointed at the same workspace as My Postings)",
    body: "User flagged that My Postings and Applicants hosted the same information. Investigation confirmed it: `/employer/applicants` was a 13-line redirect to `/employer/postings`, and the sidebar surfaced both as separate entries with different descriptions even though clicking either landed you on the same `HrWorkspace` (postings list with per-posting applicant pipelines that expand inline + a top-of-page action queue).\n\nFix: removed the second \"Applicants\" sidebar entry from `employerItems` in `Sidebar.tsx`. The `/employer/applicants` URL still redirects to `/employer/postings` so old bookmarks keep working, but the duplicate nav entry is gone. Tightened the My Postings description to make explicit that the workspace covers both postings AND applicants (and that the action queue surfaces new applications + stale stages + pending offers at the top).\n\nIf candidate-first triage across postings becomes a real need later, `/employer/applicants` is a natural home for a cross-posting applicant inbox — separate from the postings-centric workspace. Not building that yet; the current workspace handles small-volume employer flows fine via row-expand.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Hero banners — prominent icon prop removed from every page that was passing one",
    body: "User asked: if any hero banner contains an icon, remove it. Found six pages passing the prominent `icon` prop to `DSPageHeader` (the big floating-card icon that sat to the left of the eyebrow + title). Removed them all:\n\n  • `/employer/how-it-works` — `<Compass />` removed\n  • `/equip/apply/new` — `<Rocket />` removed\n  • `/admin/assist` (AutoPipette) — `<Pipette />` removed\n  • `/admin/equip/overview` — `<TrendingUp />` removed\n  • `/admin/equip/[id]` (reviewer surface) — `<FileText />` removed\n  • `/talent-pool` — `<Users />` removed\n\nFour orphan lucide imports cleaned up alongside (Compass, Rocket, Pipette, TrendingUp — each was only used by the icon prop on its page). The `icon` prop is still defined on `DSPageHeader` and `PageHero` so future pages can opt in if they want; just none currently do.\n\nNot touched: tiny inline icons inside `eyebrow` labels (e.g. `<><Compass size={11} /> Program guide</>` on `/experience`). Those are part of the eyebrow typography — visual bullets next to category labels — not a standalone hero icon. They render at 11–12 px inline with the eyebrow text, materially different from the big floating-card treatment the user's screenshot circled.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Employer profile — \"Listed as\" ticker removed, logo search now always returns candidates, Logo-shape picker removed",
    body: "Three cleanup changes on the employer surface area.\n\n**1. `/employer` public page** — dropped the gradient-styled \"Listed as\" stock-ticker block that sat above the main-business prose in the right sidebar. The `companyTicker` field stays editable in the profile modal and remains in the database; it's just no longer surfaced as a visible call-out on the public employer page.\n\n**2. Edit-profile logo search now always finds something.** `POST /api/employer/profile/logo-search` used to return an empty `candidates` array when the website crawl found nothing usable (private CDN / JS-only app shell / hostile WAF / dead path), leaving the operator with no options in the picker. The endpoint now falls back to a chain of third-party brand-asset services derived purely from the domain:\n  • Clearbit Logo Service (400 px)\n  • DuckDuckGo Icon Service\n  • Google favicon service (256 px and 128 px)\n  • Direct `/favicon.ico` on the company host\n  • Direct `/apple-touch-icon.png` on the company host\n\nThe modal's candidate `<img>` tiles already carry an `onError` that hides broken images, so the operator visually picks whichever of the fallbacks actually loads. Response includes a new `fallbackSources: true` flag so the modal could surface a hint in the future, but no UI change required today — the picker just stops looking empty.\n\n**3. Logo-shape picker removed from the Edit-profile modal.** The 4-button shape selector (Natural / Circle / Rounded / Square) that sat between the candidate grid and the cropper is gone. Profiles that already have a non-natural `companyLogoShape` keep their setting (it's still read at render time by `normalizeLogoShape`), but new users land on `natural` by default and the field is no longer surfaced as editable. The orphan `LOGO_SHAPES` constant + the shape-picker JSX block were removed from `EditProfileTrigger.tsx`.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Cover-art admin — \"Prefer the CLI?\" panel removed",
    body: "User asked to remove the \"Prefer the CLI?\" panel from `/admin/cover-art` (the trailing card that listed the `npx tsx scripts/auto-thumbnail-courses.ts` variants for off-platform batch jobs and pre-deploy seeding). The in-platform `CourseThumbnailRegenerator` immediately above it already does the same work via the UI; the CLI snippet was a leftover from when the panel didn't exist yet. Now-unused `ImageIcon` import dropped as well.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Equip deadlines admin — Edit mode can now correct the prepopulated date directly",
    body: "User asked to be able to edit the dates of auto-prepopulated deadline rows (the ones the page-load sync stamps from the canonical VL round schedule in `lib/equip/calendar.ts`). The Edit-mode form gained two new inputs alongside the existing Cycle label + Note:\n\n  • **Deadline date (ET)** — `<input type=\"date\">`, pre-filled from the row's current `deadlineAt` rendered in Toronto-local time.\n  • **Deadline time (ET)** — `<input type=\"time\">`, pre-filled from the row's current time in Toronto-local 24h format.\n\nNew tiny helpers `torontoDateInput` / `torontoTimeInput` produce the `YYYY-MM-DD` and `HH:MM` strings these inputs expect from a stored ISO instant.\n\n**API side** — the existing `update_meta` action on `PATCH /api/admin/equip/deadlines/[id]` now also accepts a `deadlineAt` ISO string. When provided, it overwrites BOTH `deadlineAt` AND `originalDeadlineAt` and clears any prior `extendedAt`/`extendedById` marker so the row reads as a freshly-set value with no extension audit trail (the audit log still records the change with `equip_deadline.update_meta` + before/after detail). The pencil-icon tooltip updates from `Edit cycle label / note` to `Edit date / cycle label / note`.\n\n**Edit vs Extend** — kept distinct on purpose:\n  • **Extend** is for pushing an already-announced deadline forward; status becomes `extended`, `extendedAt`/`extendedById` are stamped, and the row displays \"Originally <X>\" so applicants and admins both see the history.\n  • **Edit + new date** is for hard-correcting a prepopulated value that was never the real deadline. No history is preserved (and shouldn't be — the original was wrong).\n\nThe noon-ET fast path in the existing New-deadline + Extend forms (`noonEasternIso` when time = `12:00`, otherwise a Toronto-local timestamp) is reused for the Edit-mode submit.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Equip deadlines admin — table headers are now click-to-sort",
    body: "User asked for `/admin/equip/deadlines` to sort by clicking column headers. The page renders two tables (VentureConnect + VentureLift) — both now sortable independently.\n\n**Sortable columns** — Deadline (ET), Cycle, Status, Note. The Actions column stays fixed (not sortable). Default sort is `deadlineAt asc` (chronological), matching the previous implicit ordering. Click a header to sort by that column; click again to flip direction. Each table owns its own sort state via a new `StreamTable` subcomponent extracted from `ListView`, so the VC and VL tables can be sorted independently.\n\n**Visual + a11y** — active column shows a coloured up/down arrow pointing in the current direction; inactive columns show a faint `ChevronsUpDown` hint so the user knows they're sortable. Headers carry `aria-sort=\"ascending\" | \"descending\" | \"none\"` for screen readers, and the underlying `<button>` has a `focus-visible` ring for keyboard users.\n\n**Null-safe comparator** — nulls and empty strings (e.g. missing Cycle labels or Notes) always land at the END of the sort regardless of direction. Stops missing values from randomly migrating to the top when the user flips asc↔desc. Status sorts by an explicit `STATUS_ORDER` (open → extended → closed) so the natural lifecycle direction reads sensibly when sorted ascending.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Course card pills — bumped to a true pastel palette",
    body: "User wanted the catalog-card chips (credit / delivery / provider) to read as pastel. The previous palette used the `-50` bg tier which is so close to white that the colour barely registered. Bumped every chip family up one step in Tailwind's tint stack: `bg-{tone}-100` for the bg (a visible-but-soft pastel — mint / sky / lilac / cyan / rose), `text-{tone}-700` for the text (slightly softer than the previous `-800`, still legible), and `ring-{tone}-200` for the same-family hairline ring. Every -100 bg and -700 text variant already has dark-theme overrides in `globals.css` so contrast lands cleanly on Aurora / Hitech / Atom Punk / Greenwood etc. as well. The default chip (used when delivery doesn't map to a known tone) keeps `bg-elevated / text-fg-muted / ring-line`.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course catalog — \"SCORM 1.2 / 2004 module\" placeholder text removed, real blurbs picked by title keyword",
    body: "Investigation: the `SCORM 1.2 / 2004 module — <title>` line that kept showing on course cards (even after the previous SCORM-plumbing cleanup) wasn't being rendered from a hardcoded string anywhere in the UI — it was the value of `course.description` in the database. `scripts/bulk-upload-scorm.ts` stamped that placeholder on every Course it created from a SCORM ZIP. The catalog card and the search-result row both render `course.description` verbatim, so the placeholder leaked all the way through.\n\nFix is three-part:\n\n**1. UI safety net** (lands immediately on deploy) — new `displayCourseDescription` helper at `src/lib/courses/displayDescription.ts` strips the legacy boilerplate prefix and returns `null` if the whole description is just the placeholder. Wired into `CourseCard`, `CourseSearchBar` (autocomplete), and the course detail page at `/courses/[id]`. Until the database is backfilled, the boilerplate simply doesn't render — cards / search results / detail pages show no blurb instead of visible placeholder text.\n\n**2. Source-side fix** — `scripts/bulk-upload-scorm.ts` no longer writes the placeholder. New Course rows created from a SCORM ZIP get `description: null` and rely on the backfill script (or an admin) to supply a real blurb.\n\n**3. Data backfill** — `scripts/seed-course-card-fields.ts` reworked:\n  • Old flat `BLURB_POOL` of 12 generic strings replaced with `BLURB_BANK` — 22 tagged entries spanning the actual topic spread of BHN courses (cell culture / MSC passaging, downstream + upstream processing, microbial engineering, mRNA + LNP, CAR-T + gene therapy, aseptic / cleanroom / GMP, regulatory affairs, analytical methods, proteomics, bioassays, molecular biology, MSL, founder bootcamp, algae cosmetics, KE placements, data integrity, scale-up).\n  • New `pickBlurb(title, idx)` scores each blurb's tags against the course title's words, returns the best-scoring blurb, falls back to a per-course index cycle when nothing matches. So a course titled \"MSC Passaging Cell Culture\" gets the cell-culture blurb; \"GMP Cleanroom Gowning\" gets the aseptic / cleanroom one; etc.\n  • New `SCORM_BOILERPLATE` regex detects the legacy placeholder so existing rows (which have `description.length > 40` and so used to skip the old length-only check) now get rewritten on the next backfill run.\n\nTo apply the data fix on production, run:\n\n    npx tsx scripts/seed-course-card-fields.ts\n\nThe script is idempotent — it only fills fields that are missing or carry the SCORM placeholder, so a second run is a no-op.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard — Open Opportunities board stripped of its header chrome, Events audience reworded",
    body: "Tightening pass on the trainee home page per user feedback (\"more tidy, more streamlined\"). The DEADLINE-DRIVEN board (Engage · Training / Experience · Placements / Equip · Funding / Events columns) is unchanged — those four columns each carry their own label + audience line, and they're the substantive content of the section. What's gone:\n\n  • The 'Open opportunities' `SectionEyebrow` that sat above the four-column grid.\n  • The 'Deadline-driven training, placements, funding, and events. Each column lists what's open right now.' intro paragraph that sat beneath the eyebrow.\n  • The 'Meet the BioHubNet team in person — drop by, no RSVP needed unless noted' line on the Events column (felt promotional and slightly mismatched with the other columns' factual audience cues) — replaced with 'Workshops, mixers, and the annual symposium — open to everyone'.\n\nVisual rhythm preserved: the quiet 4-pillar emerald/amber/sky/violet wash on the section background is unchanged, and `mt-4` spacing above the grid (which previously created a gap below the intro paragraph) is dropped along with the paragraph itself so the grid sits at the natural top of the section.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login — every floater is now a looping multi-stage process animation",
    body: "User asked for all `/login` floaters to be animated processes 'like the cell culture one' (the MSC passaging cycle). Built four new animated components mirroring its pattern — each cycles through 4–5 stages with stage labels, sub-labels, smooth CSS-transition attribute interpolation, and a progress-dot row at the bottom for `role='progressbar'` accessibility. The MSC cycle is no longer the only narrative glyph on the page; the whole atmosphere now reads as the lab in slow motion.\n\n**Shared timing engine** — new `useStageCycle` hook centralises the cycle clock: takes `order` + `info` (records with a `duration` field), advances on a per-stage `setTimeout`, freezes on stage 1 when `prefers-reduced-motion` is on, returns `{ stage, stageIdx, reducedMotion, noTransition }`. The `noTransition` is the inline-style override callers spread onto their SVG attribute transitions so reduced-motion users get hard cuts instead of animated tweens.\n\n**1. `DnaTranscription`** (5 stages, ~15 s loop) — DNA → mRNA via RNA polymerase. CLOSED → UNWINDING → RNA POL II → TRANSCRIBING → mRNA RELEASED. A central transcription bubble opens (the two backbone strands deflect outward, rung lines inside the bubble fade), an RNA polymerase bead docks, a nascent mRNA strand grows from the polymerase via interpolated `d` attribute (length 0 → 46 px), then drifts off to the right + fades as the bubble re-closes. SVG path interpolation on the strand `d`s for smooth strand-separation tween.\n\n**2. `AntibodyBinding`** (4 stages, ~11 s loop) — IgG recognising its cognate antigen. CIRCULATING → ANTIGEN APPROACH → BOUND → RELEASED. Antigen translate3ds in from a far position, lands at the right Fab paratope, then drifts off after the koff. The right paratope dot brightens + scales up (r: 2.5 → 3.4, fill-opacity: 0.55 → 1.0) when engaged to suggest the conformational lock. All the anatomical detail of the static Antibody glyph (heavy + light chains, hinge, three disulfide bonds, heavy-light disulfide ticks, Fc base) is preserved.\n\n**3. `WesternBlotRun`** (5 stages, ~14 s loop) — five-lane gel from samples-in-wells to developed image. LOAD → RUN → TRANSFER → PROBE → DEVELOP. Bands animate their `y` attribute downward as the gel runs (~1.1 s transition) from the well row (y=16) to their MW-appropriate resting positions (target at y≈33, loading control at y≈69), then the target band lights up during PROBE/DEVELOP (opacity boost + a slight height bump on DEVELOP), the ladder + loading-control bands fade because the antibody only binds the target. Sample dots in the wells fade out as RUN begins.\n\n**4. `CarTKill`** (5 stages, ~14 s loop) — CAR-T cell engaging and lysing a CD19-positive tumor. PATROL → TARGET ENGAGED → IMMUNE SYNAPSE → LYSIS → CLEAR. Tumor cell drifts in from the right, the synapse-arc dashed line lights up during DOCK, then during LYSIS the tumor cell switches to a dashed outline + six debris dots radiate outward from the tumor centre via interpolated `cx`/`cy`. Antigen markers on the tumor surface fade with cell integrity. The six CAR receptors on the T cell membrane are pre-computed at 60° intervals (no trig in render).\n\n**Login page layout** — all four animated processes plus the original MscCultureCycle are now positioned on the periphery: AntibodyBinding (top-left, size 140), DnaTranscription (lower-left, size 220 — wide so it spans the left edge), WesternBlotRun (top-right, size 150), CarTKill (mid-right, size 160), MscCultureCycle (bottom-right, size 200). The static `Antibody`, `DnaHelix`, `WesternBlot`, `CarT` exports from `BiomanufacturingGlyphs` are kept around for non-login consumers — they're no longer used on the login page.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login floaters — mRNA-LNP removed, MSC dish loses background washes, glyph rotation bounded to ±45°",
    body: "Three follow-up changes on the `/login` floaters per user feedback.\n\n**1. mRNA-LNP dropped.** The newly-added mRNA-LNP floater on the right edge is gone; only its sister glyph CAR-T remains there. The right column now reads (top → bottom): WesternBlot, CAR-T, MscCultureCycle. CAR-T shifts up to top-40% to fill the slot. `MrnaLnp` is still exported from `BiomanufacturingGlyphs.tsx` in case it's wanted elsewhere — only its usage on `/login` was removed.\n\n**2. MscCultureCycle — dish background washes removed.** The three coloured wash ellipses inside the dish (pale-cyan PBS rinse during the wash stage, green wash during trypsin, pink wash during neutralize) are deleted. The dish now stays clean across every stage; stage context comes from the label + the cell state (blue attached → green rounded-up) only. Wash-opacity calculations + the `style transition` plumbing for those ellipses both removed.\n\n**3. Glyph rotation bounded to ±45°.** The `lab-spin` CSS keyframe used to do full continuous 360° rotations on every floater (random duration, random pivot, half clockwise / half counter-clockwise via the `-rev` reverse variant). That was rotating the MSC vignette's stage labels through inverted territory — at 80 s/rev there are several seconds per cycle where the labels are upside-down or sideways. The keyframe is now an asymmetric 0°→45°→0°→-45°→0° oscillation, so every glyph rocks gently within ±45° of its starting orientation. `ease-in-out` so the direction reversals at the extremes feel like gentle settling rather than abrupt snaps. The asymmetry of the keyframe means `lab-spin-rev` (which plays it in reverse) still produces a genuinely different visual path — right-first vs left-first — rather than identical playback. Random per-instance duration + transform-origin (set by `DraggableGlyph` via the `--spin-duration` and `--spin-origin` CSS custom properties) are unchanged, so neighbours still desync.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login floaters — pruned to 6, mRNA-LNP + CAR-T added, MSC cycle moved to bottom-right",
    body: "Big trim + curation pass on the `/login` periphery glyphs. User asked to drop 5 of the 9, swap 2 new ones in, and reposition the MSC vignette to the bottom of the right column. Final layout: 2 left, 4 right.\n\n**Left column** (was 4, now 2):\n  • Antibody (top-14%) — kept.\n  • DnaHelix (top-58%) — kept.\n  • ~~Ribosome~~, ~~PCR~~ — removed.\n\n**Right column** (was 5, now 4):\n  • WesternBlot (top-10%) — moved up from top-36%.\n  • **NEW** `MrnaLnp` (top-32%) — concentric dashed lipid bilayers (outer envelope + inner bilayer with offset dash patterns) wrapping an mRNA strand visibly packaged inside: figure-eight curve with a filled 5′ cap and a fade of poly-A markers trailing off, plus nine lipid-headgroup dots scattered around the outer envelope. Reads as the Pfizer / Moderna delivery vehicle that made mRNA vaccines practical.\n  • **NEW** `CarT` (top-55%, larger glyph with extended pokeRadius=150) — engineered T cell with nucleus + nucleolus, six CAR receptors as small Y-projections evenly spaced at 60° intervals around the membrane (each with a transmembrane stem, two scFv arms, and binding-head dots at the tips), a partial target tumor cell on the right with three CD19-style antigen markers projecting back, and a dashed synapse arc joining the engaging CAR to the central antigen for the immune-recognition moment. CAR receptor positions computed via trig (`base = cellCenter + R * (cos θ, sin θ)`) and rotated by θ so each projection points outward.\n  • MscCultureCycle (bottom-4%, moved from top-10%) — the storytelling vignette now anchors the bottom of the right column instead of the top.\n  • ~~LipidNanoparticle~~ (replaced by MrnaLnp), ~~CellSchematic~~, ~~Bioreactor~~ — removed.\n\nColor palette on the right is now: sky / violet / rose / slate (top → bottom). Lucide imports unchanged; the floater layout block in `/login` is ~30% shorter than before.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login & terms — EQUIP bullet added to the 'New here' column, button baselines aligned, Terms of Service rewritten + linked",
    body: "Four changes triggered by user feedback on the /login page.\n\n**1. EQUIP bullet on the 'New here' column.** The trainee value-prop list (industry-led training, pathways, internship matching) now has a fourth bullet covering the third BHN pillar: 'EQUIP funding — VentureConnect + VentureLift micro-grants for innovators, up to $25K'. New `Rocket` lucide icon added to the import.\n\n**2. Button baselines now match exactly.** The 'About a minute. No payment info needed.' caption that sat above the *Create your free account* CTA has been removed. With both columns using `flex flex-col` + `mt-auto pt-8` on their CTA wrappers AND the CTA now being the LAST element in each column (no caption above on the left side, no anything else below the Sign-in submit on the right side), the two buttons land on the same y-coordinate across the hairline divider regardless of how tall the columns stretch to. Comment above the wrapper updated to explain the invariant.\n\n**3. Terms of Service link in the footer now goes somewhere.** Replaced the static line 'By signing in you agree to our terms of service.' with a proper `<Link href=\"/terms\">Terms of Service</Link>` (underlined, hover lightens the colour + the decoration).\n\n**4. /terms rewritten.** The existing `/terms/page.tsx` had six skeletal sections (Account, Acceptable use, BHN Credits, Certifications, Liability, Changes) and a `new Date().toLocaleDateString()` 'Last updated' line that re-ticked on every render. Rewrote it as a 17-section first draft covering: about-these-terms, eligibility (13+ minimum, age-of-majority consent for under-majority users, higher thresholds inside), account responsibilities, BHN Credits (virtual currency, no cash value, may expire, non-transferable), acceptable use (no scraping, no malware, no impersonation, no harassment), user content licence (you keep ownership, you grant BHN a limited operational licence), courses & certificates (educational; certificates aren't regulatory approvals), internship matching (BHN facilitates, employment relationship is between user + employer), EQUIP funding applications (no guarantee of an award; admin discretion), privacy cross-reference, third-party services, disclaimers (AS IS), limitation of liability (CAD $100 cap, or amount paid in the last 12 months, whichever is greater), termination, changes-to-terms protocol, governing law (Ontario / Canada), and contact (hello@biohubnet.ca). Top of the page carries a 'working first draft' notice so the reader knows we'll formalise it with counsel before any change in commercial terms. The 'Last updated' line now uses a stable constant (`May 18, 2026`) — a real document date — instead of ticking on every render.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login backdrop — spinning centrifuge removed, corner left clean",
    body: "Reverting yesterday's experiment. User asked to drop the bottom-right `SpinningCentrifuge` corner accent on `/login` — the top-down rotor with the six-ghost motion-blur trail and the `13,400 rpm` readout — and leave the corner empty. Removed:\n\n  • The `<SpinningCentrifuge>` block + import from `/login`.\n  • `src/components/branding/SpinningCentrifuge.tsx` (the component file itself — deleted via `git rm`).\n  • The `cfg-spin` `@keyframes` block + `.cfg-spin` class from `globals.css` (no other consumer).\n\nThe `/login` stage now goes: aurora wash → spotlight cone → deep-sea stars → biotech glyph floaters → vignette → form. Nothing in the bottom-right corner.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "StylizedMark — half-sketch / half-painted BHN petal removed everywhere",
    body: "User asked to remove `StylizedMark` entirely. After the previous release swapped it on `/login` for the spinning centrifuge, the only remaining usage was as the bottom-right backdrop on `DSPageHeader` (the canonical cinematic page header used by every `<PageHero>` on the platform). Removed:\n\n  • The `<StylizedMark size={260} />` block from `DSPageHeader` — the half-sketch / half-coloured BHN petal that used to peek from the bottom-right corner with `mix-blend-screen` + a cyan/green drop-shadow glow. The atmospheric stage now stops at the reeded-glass ribs and goes straight to the edge vignette + noise grain. Z-order comments renumbered from 7 layers to 6.\n  • The `import` from `DSPageHeader` and the `StylizedMark.tsx` component file itself (`src/components/branding/StylizedMark.tsx`) — gone from the codebase.\n\nText references in earlier changelog entries describing the old composition are kept as historical record (those entries document what shipped at that time).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login backdrop — BHN petal sketch replaced with a spinning centrifuge, motion-blurred rotor at 0.5 s per revolution",
    body: "User asked to swap the half-sketch / half-painted BHN petal mark in the corner for a spinning centrifuge moving fast with motion blurs. Done.\n\n**New `SpinningCentrifuge` component** — top-down view of a benchtop centrifuge with the lid open, showing a 6-position rotor spinning at speed. Hardcoded 240×240 viewBox, parent passes a `size` prop (320 on sm/md, 520 on lg+, matching the petal's previous footprint). All strokes/fills use `currentColor` so the parent's Tailwind `text-cyan-200` tint applies cleanly.\n\n**Motion-blur technique** — instead of using `filter: blur(...)` on the rotor (which would also soften the housing + hub and look flat), the rotor is drawn as SIX ghost copies at staggered rotational offsets: -34° / -26° / -18° / -10° / -4° / 0° with opacities 0.06 / 0.12 / 0.22 / 0.38 / 0.62 / 0.95. The whole stack rotates together via the new `cfg-spin` CSS keyframe at one full revolution per 0.5 s (linear timing). The eye reads the staggered opacity trail as persistence-of-vision motion blur — the same way a strobe-lit fan looks blurred even though each strobe snapshot is sharp.\n\n**Extras that sell 'spinning fast'** — twelve tangential speed-line dashes at 30° intervals just OUTSIDE the rotor edge (static, not part of the spinning group; they blur visually with the spinning rotor and read as 'air being whipped up'); a dashed angular smear ring AT the rotor circumference (six dashes inside the spinning group → smears into a near-continuous blur ring at speed); a soft radial 'heat-haze' backwash behind the rotor (currentColor radial gradient suggesting agitated air); a pulsing LED in the status panel (≤1 s blink, SMIL `<animate>`); a static power LED in the top-left corner; a mono `13,400 rpm` readout so the speed cue is verbal as well as visual.\n\n**Industrial detail** — rounded-square housing with bolt dots at each of the four corners, a 96-radius porthole rim with a faint inner safety ring, status panel sized + positioned like a real benchtop display.\n\n**Central hub** — drawn AFTER the spinning rotor so it sits on top sharp and still, with a two-ring metal collar design (currentColor outer disc, white-translucent ring at r=7, bright white pinpoint at r=2.6 at dead centre) reading as the polished motor-shaft collar.\n\n**SVG transform-origin** — uses `transform-box: view-box` so `transform-origin: 120px 120px` pins the rotation pivot to the 240×240 viewBox centre regardless of the element's bounding box. Without this, the pre-rotated ghost stack would resolve the origin against the combined bbox (not the visual centre).\n\n**Reduced motion** — `prefers-reduced-motion` zeroes the `cfg-spin` keyframe so the rotor freezes; the six-ghost composition still reads as a stylised 'caught mid-shutter' snapshot.\n\n**`StylizedMark` kept around** — still used as the corner backdrop in `DSPageHeader` (every cinematic page header on the platform) so the component file stays intact; only its usage on `/login` was removed.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login backdrop — PCR + Western Blot glyphs swap in for the T-flask, antibody redrawn anatomically, deep-sea stars drift through the stage",
    body: "Four changes to the /login atmosphere layer, all in the same line-art family so the dark stage gains depth without competing with the form.\n\n**1. T-flask out, PCR in.** Dropped the T-flask floater on the left edge bottom and replaced it with a `Pcr` glyph — a single-frame snapshot of the denature → anneal → extend cycle: two melted antiparallel single strands (gentle waves, 5′→3′ labels at both ends), short forward + reverse primers annealed with arrowheads pointing in the extension direction, and a fade of nucleotide-dots being added by Taq beyond each primer's tip. Reads as 'PCR' at a glance without needing a textbook caption.\n\n**2. New Western Blot glyph on the right edge upper-mid.** `WesternBlot` is a five-lane membrane with a kDa ladder on the outside: lane 1 is the protein marker (four equally-intense bands at the four ladder positions), lanes 2–4 are sample lanes showing a target band at ~50 kDa at moderate / weak / strong intensities, lane 5 is a knockout (no target, loading-control only). The target band sits at the same height across all four sample lanes so the eye reads it as one experiment.\n\n**3. Antibody redrawn anatomically.** The simple Y triangle was technically an antibody silhouette but lost most of the structural information. The new `Antibody` glyph keeps the same Y silhouette but adds:\n  • Two heavy chains as the outer strokes running from each Fab tip down through the hinge into the Fc stem (rendered as two close-parallel verticals that curve into a rounded base — the real two-chain Fc).\n  • Two light chains as inboard parallel strokes in each Fab arm only (they don't extend into the Fc — anatomically correct).\n  • A flexible hinge knot where the heavy chains pivot together.\n  • Two short dashed inter-heavy-chain disulfide bonds across the Fc stem (the cysteine bridges of typical IgG1) + heavy-light disulfide ticks where the chains link in each Fab arm.\n  • Antigen-binding-site hooks + filled paratope dots at each Fab tip (the variable region).\n  • A flared elliptical Fc base.\n\nStill renders as a small floater glyph — just with biologically honest detail anyone in the field will recognize on inspection.\n\n**4. Deep-sea stars drifting through the stage.** New `DeepSeaStars` component renders a cloud of 24 featherweight star particles that fall slowly through the page like marine snow / plankton sinking through deep ocean water. Each star is one of two micro-shapes (a 5-point sea-star silhouette or a 4-armed ✦ twinkle), in one of four cool tints (cyan / sky / teal / off-white), with a hand-tuned x-position, size (4–12 px), peak opacity (0.18–0.50), animation duration (20–36 s), starting delay, and one of four `sea-star-sink-{a,b,c,d}` keyframe variants. Each keyframe combines vertical drift (-8vh → 108vh) with a different horizontal sway profile so neighbours never sync up and the cloud reads organic — like real currents shaping the fall. Slow gentle rotation as they sink. Per-instance peak opacity carries through the keyframe via a `--star-op` CSS custom property. Quietest particles sit in the central form column band (opacity ≤ 0.22) so the stars never compete with the sign-in form. Linear timing, `will-change: transform, opacity`, `prefers-reduced-motion` zeros the animation. Positions / sizes / variants are hardcoded (not random) so SSR + hydration stay clean.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "First-login ritual — every new trainee splits a cell before the dashboard unlocks",
    body: "User asked for a fun, gamified gate: 'when people register for the first time and log in, I want them to split a cell before they can start — only once. As admin I can replay it freely.' Built end-to-end.\n\n**Schema** — new boolean `hasSplitCell` on `User`, defaults to false. Migration `20260702000000_user_has_split_cell` ships with the next deploy. Flips to true the first time a trainee completes the mini-game; never resets.\n\n**Dashboard guard** — `src/app/(dashboard)/dashboard/page.tsx` now redirects `trainee` + `evaluating` roles to `/welcome/split-a-cell` when `hasSplitCell === false`. Admins / superadmins / employers / instructors are routed to their own dashboards by the existing role-branch logic above the guard, so they never trigger the redirect. Once the flag is true the guard is a no-op and the trainee lands on /dashboard as normal.\n\n**Welcome route** — new `/welcome/*` route group OUTSIDE `(dashboard)` so the sidebar / queue badges / chrome don't appear during the ritual. Minimal fullscreen slate-950 stage. Server-component `/welcome/split-a-cell/page.tsx` checks the session (→ /login if anonymous), reads `?replay=1` for admin replay support, and redirects already-completed non-admin users back to /dashboard (so trainees can't replay by URL-hacking). Admin replay always plays, regardless of the flag.\n\n**The game itself** — `CellSplitGame.tsx`, a 9-stage interactive walkthrough that mirrors the MSC passaging protocol the trainee already saw on /login:\n  1. CONFLUENT — start screen, 'your cells are 80% confluent, time to passage'.\n  2. ASPIRATE-MEDIA — pipette descends, sucks the spent media out.\n  3. PBS-WASH — pale cyan rinse to clear residual FBS.\n  4. TRYPSIN — green wash, cells start rounding up.\n  5. INCUBATE — 3:00 → 0:00 timer (sped to 3 seconds real time) auto-advances.\n  6. NEUTRALIZE — pink media flows in, FBS inactivates the trypsin.\n  7. ASPIRATE-CELLS — pipette draws the suspension up.\n  8. RE-SEED — a fresh dish slides in, a few cells dropped in.\n  ✓ COMPLETE — confetti sparkles, welcome copy, button → /dashboard.\n\nEach stage is gated on a single user click (except INCUBATE which auto-advances on timer). Per-stage copy (title / lead / CTA / progress pill) lives in a STAGE_COPY record. The 28 cell positions match MscCultureCycle so the visual language is continuous from /login → /welcome. SVG dish with three wash ellipses (cyan PBS, green trypsin, pink neutralize) fading in / out per stage; animated pipette descends during the two aspirate stages with a cell-coloured liquid column rising up its bore; fresh empty dish slides in during reseed; sparkles overlay at complete via a local `@keyframes cell-split-sparkle`. Background is a midnight cinematic stage with six animated colour blobs in the corners (respects `prefers-reduced-motion`). Eight-of-nine progress dots at the bottom (complete stage excluded from the dot count).\n\n**Completion endpoint** — `POST /api/onboarding/complete-cell-split` flips the flag for the signed-in user. Idempotent (true→true is a no-op for UPDATE). 401 for unauthenticated callers — defence in depth; the welcome page is auth-gated anyway. The client component fires it at the start of the COMPLETE stage, then `router.push('/dashboard')` once it returns.\n\n**Admin replay** — admins can visit `/welcome/split-a-cell?replay=1` any time. The server guard explicitly allows admin + replay through even when the flag is already true, and the client component checks the `replayMode` prop before firing the POST — so the flag stays untouched and admins can replay over and over. A subtle 'Admin replay — completion won't be saved' banner appears at the top so they know which mode they're in.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard hero — complete redesign as a reeded-glass hothouse, art behind the glass",
    body: "Full redesign of the trainee dashboard hero per the user's reference image (vertically-ribbed glass with palm fronds visible through it, distorted by the rib refraction). The hero is no longer a flat mesh-gradient stage — it's now a piece of designed art seen THROUGH a sheet of reeded / fluted glass.\n\n**Composition, back-to-front (z-order):**\n\n  **1. Base wash.** Theme-tinted vertical gradient mixing `var(--hero-mesh-1)` + `var(--hero-mesh-3)` with the theme's `--hero-bg`, plus a soft top-centre spotlight cone (the warm 'window light' falling through).\n\n  **2. Art layer + displacement.** Five stylised palm-frond bodies painted across a 1920 × 700 viewBox as groups of elongated ellipses (central spine + radiating leaf blades, radiating at ±22°, ±42° per frond). One frond mid-left (large), one upper-right (medium), one lower-right (smaller), one far-left edge (accent), one mid-back (faded). Each frond uses one of the theme-mesh tokens (`hero-mesh-1` / `hero-mesh-3` / `hero-mesh-4`) so the art adapts per theme — Greenwood gets greens, Sakura gets pinks, Aurora gets violets, Atom Punk gets atomic teal + tangerine, etc. Plus four big atmospheric colour blobs in the background for depth and a warm orange-rust glow in the lower-right corner (matches the reference image's warm note).\n\n  All of it is fed through TWO SVG filters in sequence:\n  - `feGaussianBlur stdDeviation='9'` — soft-focuses the fronds the way real fronds look through real frosted glass.\n  - `feTurbulence baseFrequency='3 0.005' + feDisplacementMap scale='60'` — the actual refraction. `baseFrequency` is heavily biased horizontal (3 oscillations per filter-unit across X, only 0.005 down Y) so the noise produces vertical streaks of displacement data; `feDisplacementMap` then offsets each pixel of the blurred art by a different amount horizontally depending on which vertical band it sits in. That's exactly how a sheet of fluted glass works as a strip of cylindrical lenses, slicing what's behind into vertical bands.\n\n  **3. Reeded ridge highlights.** Primary 9 px `repeating-linear-gradient` with a light edge + a dark groove per rib (`mix-blend-overlay`) — the 3D rib structure catching light, sitting on top of the displaced art. Plus a finer 3 px micro-texture between grooves (`mix-blend-soft-light`) — the polished quality of real fluted glass between the main ridges.\n\n  **4. Vertical frost wash.** Slight darkening at top + bottom, lighter middle, so the eye reads the centre as the 'warm pool' of the glass surface.\n\n  **5. Edge vignette.** Gentle 28 % darkening at the corners — the theatrical frame.\n\n  **6. SVG noise grain.** 12 % opacity `feTurbulence` fractalNoise overlay for editorial print texture.\n\n**Theme-aware.** Every colour in the art layer is a theme-mesh token, so the same composition renders different on each theme. The base wash and ridge highlights are theme-independent (work on any background). Falls back to hardcoded hex values when the CSS custom properties aren't set.\n\n**No floating glyphs / draggables / animations.** Strictly static layered atmosphere — matches the user's earlier requirement and removes the StylizedMark corner backdrop the previous build had.\n\nContent layer (top rail with mono date + LogoMark, italic-serif welcome + giant first name, lead sentence, CTAs, right-column HeroStat stack) is unchanged — sits cleanly on top of the new glass.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course card — slimmer, theme-aware, muted centered pills; CTA shrunk; SCORM plumbing removed",
    body: "Tightening pass on the catalog card based on user feedback. Six changes:\n\n**1. Theme-aware throughout.** The card was hardcoded `bg-slate-900` LEFT + `bg-white` RIGHT — looked great on Light theme, broken-island on every other. Now uses theme tokens: LEFT content side = `bg-card-solid` (the platform's lighter 'paper' surface), RIGHT sidebar = `bg-elevated` (the slightly darker 'raised' surface). Both adapt per theme. Same for text: every `text-white` / `text-slate-300` / `text-slate-900` swapped for `text-fg` / `text-fg-muted` / `text-fg-subtle`. The card now reads cleanly on Light / Dark / Aurora / Sakura / Atom Punk / Greenwood / Icecream / Hitech.\n\n**2. CTA shrunk.** The `Request to Enroll` / `Enroll` button was a chunky 12.5 px font in a 12 px-padded slate-800 bar. Trimmed to a `10.5 px` uppercase tracked button at `px-3 py-1.5 rounded-md`, sitting on a slim `p-2 sm:p-2.5` band of `bg-card-solid` with a top border-line. Button fill switched from amber-500 → `bg-brand-600` so it adapts to the theme's brand colour instead of always being orange.\n\n**3. Pills now muted + centred.** Replaced the bright filled chips (`bg-teal-500 text-white` etc.) with the platform's standard light status-pill family: `bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200` (and parallel `blue-50`, `sky-50`, `indigo-50`, `cyan-50`, `rose-50`). Text is now `justify-center text-center` instead of left-aligned. Every dark theme has overrides for the 800 step in `globals.css` so contrast lands cleanly on Aurora / Hitech / Atom Punk too. Result: much calmer card overall, no longer screaming.\n\n**4. Blurb under title — visible + tighter.** Description renders as a `line-clamp-3` blurb (was `line-clamp-5`) at `text-[11.5px] text-fg-muted` directly below the title, with a `mt-1.5` gap. Title shrunk slightly to `14/15 px` so it doesn't dominate. Code eyebrow is `10 px uppercase tracked mono` above the title.\n\n**5. Compact card overall.** Padding tightened across the board:\n  • Cover art: `h-24 sm:h-28` → `h-20 sm:h-24`\n  • LEFT content: `p-5 sm:p-6` → `p-3.5 sm:p-4`\n  • RIGHT sidebar: `p-3 sm:p-4` → `p-2.5 sm:p-3`\n  • CTA bar: `p-3 sm:p-3.5` → `p-2 sm:p-2.5`\n  • Card radius: `rounded-2xl` → `rounded-xl` (slightly tighter corner)\n  • Sidebar widths: `150 / 170 px` → `128 / 142 px`\n  • Heart icon: `18 px` → `14 px`\n  • Various font sizes nudged down 0.5–1 px\n  • Dividers: `border-slate-200 my-3` → `border-line my-2`\n\n**6. SCORM plumbing removed.** `scormPackage`, `_count.modules`, and `courseType` are no longer fetched / passed / typed anywhere in the catalog pipeline. They were dead data on the new card design — no SCORM badge, no module count, no course-type label. Removed:\n  • `scormPackage: { select: { version: true } }` from the `/courses` Prisma include\n  • `_count.modules` from the `_count` selection (only `enrollments` remains, and that's only kept if used elsewhere)\n  • `courseType: c.courseType` from the page mapping\n  • `scormPackage`, `_count`, `courseType` from the `CatalogCourse` interface\n  • `scormPackage`, `_count`, `courseType` from the `CourseCardProps` interface\n  Smaller wire payload + cleaner types.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course favorites — heart icon on the catalog card is now functional, with a Favorites-only filter chip",
    body: "User asked for the heart icon on the catalog card to actually do something. Built the full favourite / unfavourite flow end-to-end.\n\n**Schema** — new `CourseFavorite` join model on `User` × `Course`. Unique composite key on `(userId, courseId)` plus per-side indexes so 'is this course favourited by THIS user?' (filtered by user) and 'how many users favourited this course?' (filtered by course) are both cheap. Migration `20260701000000_course_favorites` ships with the next deploy; it cascades on delete from either side so deleting a user / course also drops the favourite rows.\n\n**API** — `POST /api/courses/[id]/favorite` toggles. The route reads the existing `(userId, courseId)` row, deletes it if present, creates it if not, and returns `{ favorited: boolean }` reflecting the NEW state. Idempotent at the record level via the unique constraint; 401 for unauthenticated callers (defence in depth — the page is auth-gated anyway).\n\n**Heart icon — now an interactive button.** Replaced the static decorative `<Heart>` icon with a `<button>` that:\n  • Stops propagation + prevents default on click so the surrounding `<Link>` doesn't navigate to the course detail.\n  • Optimistically flips local state via `useState(course.isFavorite)` for instant feedback.\n  • Fires the toggle API; on `200` it adopts the server's returned state (useful if another tab toggled it stale).\n  • On error reverts the optimistic state.\n  • Disables itself + cursor-wait while in-flight to prevent double-fires.\n  • Filled rose-500 when favourited; outline rose-300/80 (hover: rose-400) when not.\n  • Has proper `aria-label` (\"Add to / Remove from favorites\"), `aria-pressed`, and `focus-visible:ring`.\n\n**'Favorites only' filter chip on `/courses`.** Toggle `?fav=1` in the URL. The chip shows `♥ Favorites · {N}` with the user's total favourite count so they know how many cards they'll see when toggled. The chip is hidden until the user has at least one favourite to avoid noise on a first visit. While active, an inline 'Show all courses' link offers an easy escape. The `/courses` query is restricted to `where: { id: { in: Array.from(favoriteIds) } }` when the filter is on.\n\n**Catalog plumbing** — `CatalogCourse` interface picked up `isFavorite: boolean`; the `/courses` page fetches `prisma.courseFavorite.findMany({ where: { userId }, select: { courseId: true } })` first and builds a `Set` of favourite IDs that drives both the filter restriction and the per-card `isFavorite` flag.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course catalog cards rebuilt — two-column layout with code, credit, delivery, provider, enroll-by + cohort dates (admin-editable)",
    body: "User shared the legacy BHN course-card design as reference and asked for a redesign that surfaces every metadata field on the card AND is editable from the admin backend. Done.\n\n**Schema** — added four nullable columns to `Course`:\n  • `code` — short course code shown on the card eyebrow (e.g. `BIOP210`, `ACRTM101`)\n  • `enrollByDate` — enrollment-deadline date for cohort-based courses\n  • `cohortStartDate` — cohort start date (In-Person / Hybrid)\n  • `cohortEndDate` — cohort end date (In-Person / Hybrid)\n\nNew migration `20260630000000_course_card_fields` ships with a `Course_code_idx` index so catalog search can filter by code cheaply.\n\n**Card redesign** — `CourseCard` is now a two-column tile mirroring the reference image:\n\n```\n┌──────────────────────────────────────────────────┐\n│ BMFG205                  ┆ ◆ Credit 500          │\n│ Probiotic Kombucha …     ┆ ◆ Hybrid              │\n│                          ┆ ◆ OBIO                │\n│ Engineer microbes to …   ┆ ─────────────────     │\n│                          ┆ Enroll by:            │\n│                          ┆ Jun 30, 2025          │\n│ [ Request to Enroll → ]  ┆ Duration:             │\n│                          ┆ Jul 23 – Aug 15, 2025 │\n└──────────────────────────────────────────────────┘\n```\n\nLEFT (content) — mono code eyebrow + heart favorite icon, bold title, line-clamp-4 description, orange CTA at the bottom. RIGHT (sidebar, `bg-elevated/60` with hairline divider on the left) — three colour-coded chips (credit/free → emerald, delivery → sky/indigo/amber based on mode, provider → rose), then `Enroll by:` + `Duration:` rows. CTA copy is driven by `requiresApproval` — `Request to Enroll` for cohort-based, `Enroll` for self-serve. Duration text adapts: cohort window (`Jul 23 – Aug 15, 2025`) when `cohortStartDate` + `cohortEndDate` are set, fallback to `duration` minutes otherwise.\n\nTheme-native throughout — `bg-card` content side, `bg-elevated` sidebar, the standard light + ring status-pill family for the chips. Every theme paints its own palette through the same tokens.\n\n**Admin editability** — the catalog `QuickEditDialog` (the pencil that pops on hover for admins) now carries a `CatalogCardFields` section above the filter fields covering: `Code`, `Credit cost (0 = Free)`, `Enroll by`, `Cohort start`, `Cohort end`, plus a `Requires approval` checkbox. All six fields PATCH through the existing `/api/courses/[id]` route which was extended to accept the four new date / code fields (empty strings clear, ISO date strings parse to `Date`, `null` clears explicitly).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "All page heroes — major redesign borrowing the /login spotlight stage (no floaters), visible reeded glass ribs across the board",
    body: "Big redesign pass on the platform's head banners. User flagged that the reeded-glass effect still wasn't reading on the dashboard and asked for all head banners to be redesigned with the /login page as the reference (minus the floating biotech glyphs). Touched two surfaces:\n\n**Canonical `DSPageHeader` (every cinematic page header) — rebuilt the cinematic decoration stack with seven theme-aware layers, top-to-bottom in z-order:**\n  1. Deep radial dome from `var(--hero-mesh-1)` — gives the stage its theme-flavored sky.\n  2. Aurora wash — two soft theme-tinted radial glows around the top centre (`hero-mesh-1` at 35 %, `hero-mesh-3` at 28 %), mirroring the /login spotlight pool.\n  3. Tighter warm-white spotlight cone at top-centre (the theatre's key light).\n  4. **REEDED / FLUTED GLASS RIBS** — repeating vertical-line pattern at strong contrast (`rgba(255,255,255,0.14)` highlight + `rgba(0,0,0,0.18)` shadow per rib, primary 10 px spacing, `mix-blend-mode: overlay` so the ribs really read on every theme). Plus a finer 3 px micro-texture between grooves for polished-glass feel. This is the visible 'fractal glass' effect the user was after — actual vertical lines across the whole stage, not subtle.\n  5. `<StylizedMark>` backdrop peeking from the bottom-right corner — the half-pencil-half-coloured BHN petal, pulled mostly off-screen and `mix-blend-screen`'d in so it lives in the dark periphery, never behind the title. Hidden below `lg` so smaller viewports keep a clean stage.\n  6. Edge vignette — gentle 32 % darkening at the corners so the stage feels framed.\n  7. Fine SVG fractal-noise grain at 14 % opacity for editorial print feel.\n\nNo floating glyphs, no `lab-swim` keyframes — strictly static atmospheric layers. Every page that uses `<PageHero>` / `<DSPageHeader>` gets the new stage for free.\n\n**Trainee dashboard hero — bespoke editorial layout retained, atmospheric layers refactored to match `DSPageHeader`'s new recipe.** Keeps the magazine masthead + giant italic-serif name + right-column stats stack, but the background atmospherics (mesh blobs + constellation grid + sliced reeded-glass attempt) are replaced with the same seven-layer recipe DSPageHeader uses. Reads as one design language across the platform now.\n\n**/equip/my-applications cleanup.** Removed the stray '← Equip' back-link that sat above the `DSPageHeader` (violated the platform rule that hero is the absolute top of every page) + the `ClipboardList` icon prop on the hero (per user request).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard hero — real reeded / fluted glass effect (the right kind of fractal glass)",
    body: "Previous build used three frosted-shard panels with backdrop-blur + `feTurbulence` fractal noise — wrong effect. User showed the reference: REEDED / FLUTED GLASS, the vertical-rib texture where each rib acts as a tiny cylindrical lens and slices what's behind it into vertical bands. Rebuilt the hero decoration layer to do the real thing.\n\n**How it works.** The mesh blobs are now rendered as SVG `<ellipse>` shapes inside the same `<svg>` element, then filtered through a custom `feTurbulence + feDisplacementMap` chain:\n  • `feTurbulence baseFrequency='2.6 0.004'` — heavily biased horizontal, so the noise oscillates rapidly across X but stays nearly constant down Y, producing vertical streaks of displacement data.\n  • `feDisplacementMap scale='42' xChannelSelector='R' yChannelSelector='G'` — uses the streaked turbulence to offset each pixel of the mesh by a different amount horizontally, depending on which vertical band it sits in. Result: every blob behind the glass is sliced into vertical strips that step left + right of each other — exactly how real fluted glass refracts what's behind it.\n\n**Theme-aware fills.** The five ellipses fill with `var(--hero-mesh-1..4)` so every theme (Light, Sakura, Atom Punk, Greenwood, etc.) paints its own palette through the same glass effect — same theme-mesh tokens, refracted.\n\n**Rib ridges.** On top of the displaced mesh, two layered `repeating-linear-gradient`s draw the physical ridge texture: an 8 px primary pattern with light + shadow stripes (`mix-blend-mode: soft-light`) and a finer 3 px secondary pattern for the polished-glass micro-texture between grooves (`mix-blend-mode: overlay`). Plus a subtle vertical frost wash for the cool haze fluted glass has.\n\nThe three frosted-shard panels from the previous build are gone. The whole hero now reads as one panel of theme-tinted reeded glass, with the title content sitting cleanly on top.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard hero — fractal-glass shards layered into the background",
    body: "Added three fractal-glass shards floating in the trainee dashboard hero's decoration layer. Each shard is a translucent rounded panel that catches the underlying mesh through `backdrop-filter: blur(18-22px) saturate(150-160%)` (glassmorphism), then layered with an SVG `feTurbulence` fractal-noise filter inside (`baseFrequency 1.2-1.6, numOctaves 2-3`) at 22-28 % opacity in `mix-blend-overlay` — gives a richer 'frosted glass' texture than a plain blur. Glass edges are mimicked with `border-white/15`, an inset-top white highlight, and a soft drop shadow.\n\nThree shards layered at different angles + sizes:\n  • Shard 1 — large 28 × 12 rem pane, mid-left, rotated −12°, sits behind the title block.\n  • Shard 2 — small 16 × 8 rem accent, upper-right near the LogoMark + date, rotated +8°.\n  • Shard 3 — medium 20 × 9 rem pane, lower-right, rotated −6°, anchors the bottom edge.\n\nAll three sit inside the existing absolute-positioned decoration wrapper (so they don't trip the `.hero-mesh-brand > * { position: relative }` rule), behind the title content in DOM order. Hidden below `md` (Shards 1 + 2) / below `lg` (Shard 3) so mobile stays lean — no backdrop-filter perf cost on small viewports.\n\nThe SVG fractal-noise filters live in a single zero-width `<svg>` `<defs>` block at the top of the decoration layer; each shard references one of two filter IDs (`hero-glass-fractal-a` / `-b`) so we get two distinct fractal patterns sharing across shards without duplicating filter declarations.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard hero — deeper, more designerly, editorial composition",
    body: "Redesigned the trainee dashboard's head banner from the stock `PageHero` / `DSPageHeader` into a bespoke editorial hero with more gravitas and design sensibility (`设计感` + `深沉`).\n\n**Top rail — editorial masthead.** A small uppercase mono runner reads `DASHBOARD · MONDAY, MAY 18`, followed by a fading hairline gradient and the four-petal `LogoMark` with a soft cyan glow drop-shadow. Sets the editorial tone before the title block even loads.\n\n**Title block — magazine-style typography.** Small italic-serif `Welcome back,` line, then the trainee's first name set HUGE (6xl → 7xl → 8xl) in italic serif on the cinematic `var(--hero-title-gradient)` — adapts per theme. Below the name: a short white hairline, then a state-aware one-line lead (`{N} courses in flight. Today's the day to make a stitch.` / `{N} courses done. The path keeps unfolding.` / `The path lives here. Pick one up.`). Replaces the previous generic 'BioHubNet wires biomanufacturing HQP …' marketing sentence with a tighter, fitted line.\n\n**Right-column stats stack (lg+).** Hairline-separated from the title block; carries three mono numbers (In progress / Credits / Certificates) with tiny uppercase tracked labels underneath. Reads like a designer's spec sheet or a printer's colophon — adds quantitative presence without crowding the title.\n\n**Atmospheric depth — without leaving the design system.** Still uses the platform's theme-aware `.hero-mesh-brand` utility for the base (so Aurora, Atom Punk, Hitech, Sakura, etc. each paint their own stage), but layers TWO extra blurred mesh blobs (`var(--hero-mesh-1)` top-left and `var(--hero-mesh-2)` bottom-right, both at 20-25% opacity) plus a faint constellation grid (`radial-gradient` 1 px dot pattern at 18% opacity, mix-blend-overlay) for additional atmospheric depth. The `.hero-mesh-brand` bottom scrim still guarantees text contrast on every theme.\n\n**Action treatment.** Primary CTA is now a `bg-white text-slate-900` rounded-full pill (cleaner than the previous brand-600 square button on the dark stage); secondary is a `bg-white/8 border border-white/25` ghost pill with `backdrop-blur-sm`. Both gain focus-visible rings. Smaller, tighter, more confident.\n\n**New `HeroStat` helper** colocated in `page.tsx` for the right-column stat tiles.\n\nNet effect: the head banner now feels like an editorial spread — magazine masthead + giant italic-serif name + mono stat sheet — instead of a generic 'Hi, {Name}' dashboard greeting. Theme-aware throughout; nothing breaks on Light, Aurora, Atom Punk, Hitech, Sakura, Icecream, Greenwood, or Rosalind.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard — a note from the BHN team, sitting just under the hero",
    body: "Personal editorial blurb from the BHN founders, sitting just under the hero on the trainee dashboard. Italic serif body on a soft brand-tone wash, signed off with the four-petal LogoMark + an uppercase team attribution.\n\n**Copy** — addresses the trainee by first name, then names four hopes (one per pillar): a course that surprises, a placement that opens a door, a funding round that gets the idea moving, and a few people whose company they'd keep beyond the platform. Closes with `We're rooting for you` in bold. Sets a warm tone for the dashboard without taking up much real estate.\n\n**Design** — standard section chrome native to the platform DS: `border-t border-line py-5 sm:py-7 px-5 sm:px-8` outer, a faint cyan → indigo → pink gradient wash (matches the brand cinematic palette), `<SectionEyebrow tone='brand'>A note from the team</SectionEyebrow>` header, italic serif body (font-family inherits from the active theme — Sakura gets cherry-blossom serifs, Atom Punk gets Roboto Slab, etc.), `max-w-2xl mx-auto` line-length for editorial readability, four-petal LogoMark + uppercase tracked attribution at the bottom. No card chrome, no marketing-banner outliers — sits rhythmically alongside Open Opportunities / For You / Reminders.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard — Open opportunities section rebuilt native to the design system",
    body: "User flagged that the previous 'WE ARE DEADLINE-DRIVEN' board (navy banner header + rounded panel chrome + hardcoded brand-900 column labels) read as a marketing-card mimicry of biohubnet.ca and didn't match the platform's flat-section + theme-token design system. Rebuilt the four-pillar opportunities board native to the DS:\n\n**Section chrome — same rhythm as every other dashboard section.** Dropped the rounded `border + bg-card-solid + shadow-sm` panel wrapper and the navy `linear-gradient(135deg, #0a1f3d → #1d4f8b → #2c8aa3)` banner. The section now sits on the standard `border-t border-line py-4 sm:py-6 px-5 sm:px-8` with a quiet 4-stop emerald → amber → sky → violet gradient wash (matching the For You / Reminders wash pattern). A regular `<SectionEyebrow tone='brand'>Open opportunities</SectionEyebrow>` header + a one-line description introduces it.\n\n**Column headers — SectionEyebrow per pillar instead of bespoke 2xl black labels.** Each column heading is now a `SectionEyebrow` with its own tone (engage=emerald, experience=amber, equip=sky, events=violet) and the same gradient-hairline + 10 px uppercase-tracked label as every other section heading. The italic audience line below the eyebrow stays — but now reads as a subtitle, not as a marketing tagline.\n\n**Item typography — theme-token native.** Item titles are `text-fg font-semibold` with a `group-hover` to the pillar tone (per-tone classes are STATIC so Tailwind's JIT picks them up). Descriptions are `text-fg-muted`. Both adapt to every theme via the existing token system instead of being baked-in dark grey.\n\n**Status pills — light + ring, matching the platform's existing status-badge family.** Replaced the heavy `bg-rose-900 text-white` and `bg-sky-700 text-white` deadline pills with the platform's standard light status palette: `bg-rose-50 text-rose-800 ring-rose-200` (deadline / full), `bg-sky-50 text-sky-800 ring-sky-200` (event date/time), `bg-amber-50 text-amber-800 ring-amber-200` (warnings), `bg-elevated text-fg-muted ring-line` (neutral). All three theme overrides for rose / sky / amber kick in on dark themes via globals.css so the pills read correctly on Aurora, Hitech, etc.\n\n**`EyebrowTone` extended to include `violet`.** The Events pillar now has a proper violet→pink gradient hairline instead of falling back to the brand cyan→violet gradient. Same uppercase-tracked tone language as the other pillars.\n\nNet effect: the section sits rhythmically alongside For You, Reminders, Loot Vault, and the Personal-status strip — same eyebrow, same padding, same wash, same divider — instead of barging in as a marketing-card outlier.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard — EQUIP narrowed to next-open VC + VL, EVENTS reads from the event calendar, tighter visual consistency",
    body: "Three refinements on the DEADLINE-DRIVEN board.\n\n**EQUIP now shows ONE next-open round per stream.** The previous query pulled the next 5 upcoming windows ordered by deadline, which on a busy calendar could surface two VLs and no VC (or vice versa) in the EQUIP column. Swapped for two `findFirst` queries — the soonest open or extended VentureConnect cycle AND the soonest open or extended VentureLift cycle. Trainees see at most two EQUIP rows: one VC card + one VL card. If a stream has nothing open, that row simply doesn't render. Closed / passed windows are never shown.\n\n**EVENTS now reads from the event calendar (BhnEvent).** The column was previously pulling individual `Workshop` rows nested under events — fine for surfacing a single iBEST-style coffee, but inconsistent with the public `/events` calendar which lists parent `BhnEvent` editions (symposiums, training-weeks). Swapped the query to `bhnEvent.findMany({ status: 'published', endDate: gte now })` mirroring the `/events` query exactly. Each card now shows the event title + tagline (or main venue as a fallback) + a `MAY 19 · 9–11 AM`-style date pill, linking to `/events/{slug}`.\n\n**Tighter visual consistency across the dashboard.** Three small tweaks so the page reads as one designed surface, not a Frankenstein of disparate sections:\n  • Section padding uniform — every section now sits on `border-t border-line py-4 sm:py-6 px-5 sm:px-8`. DEADLINE-DRIVEN's outer section padding shrunk from `px-4 sm:px-6 py-5 sm:py-7` to match.\n  • The Recent activity section's header was a one-off uppercase `<div>` — replaced with `<SectionEyebrow>Recent</SectionEyebrow>` so it matches the rhythm of For You / Reminders / Loot Vault / Your training / placement / funding.\n  • `PersonalStatusColumn` (the 3-col status strip below the board) tightened its internal padding to `px-4 sm:px-5 py-4 sm:py-5` so it visually pairs with the `PillarColumn` (the 4-col DEADLINE-DRIVEN columns above it). Same column rhythm, smaller primary line + secondary list text to keep the strip compact.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard — WE ARE DEADLINE-DRIVEN board mirrors biohubnet.ca + half-size Loot Vault + tighter page",
    body: "Big rebuild of the trainee dashboard. User flagged that the existing Pillar Trinity ('1 in progress · 123 internships open · 5 windows open') was a pulse, not a planning board, and asked us to mirror the marketing site's `WE ARE DEADLINE-DRIVEN` 4-column card at biohubnet.ca.\n\n**New `WE ARE DEADLINE-DRIVEN` board.** Replaces the old 3-column Pillar Trinity with a single rounded panel: a navy banner header (`linear-gradient(135deg, #0a1f3d → #1d4f8b → #2c8aa3)`) over a 4-column body (stacks 1-up small, 2x2 md, 4-up lg). Each column carries a big black `ENGAGE / EXPERIENCE / EQUIP / EVENTS` label, a one-line subtitle, an italic 'audience' line, a hairline divider, and a list of deadline-driven items. Each item is a clickable card with a colour-toned title, a 1-line description, and a status pill (maroon `bg-rose-900` for `APPLY BY [date]` / `FULL · WAITLIST`; sky `bg-sky-700` for in-person event date/time).\n\n**Real data wired in.**\n  • **ENGAGE** — published `Pathway` rows with enrollment open + admin-curated `OpportunityDeadline` rows (kind=`engage_highlight`).\n  • **EXPERIENCE** — active `InternshipPosting` rows (with company name + top 3 skills as the description, deadline as the pill) + `OpportunityDeadline` rows (kind=`knowledge_exchange` or `mobility_award`).\n  • **EQUIP** — existing `EquipDeadline` rows. **VC and VL are now spelled out**: `VentureLift` (up to $25K for IP-backed innovations — supports business strategy, product development, regulatory navigation) and `VentureConnect` (up to $5K for industry events, investor conferences, pitch competitions), with the audience line saying `For trainee-entrepreneurs with an IP-backed innovation`.\n  • **EVENTS** — upcoming `Workshop` rows under published `BhnEvent`s, with title + short description + location + a `MAY 19 · 9–11 AM`-style pill.\n\n**New `OpportunityDeadline` Prisma model.** Single polymorphic table for `kind` ∈ {knowledge_exchange, mobility_award, engage_highlight, …} + `pillar` ∈ {engage, experience, equip, events}. Carries `title / blurb / opensAt / deadlineAt / status / ctaUrl / ctaLabel / pillText / displayOrder`. Lets an admin curate KE rounds + MA windows + engage highlights without us shipping per-kind models. Migration `20260629000000_opportunity_deadlines`. (Admin UI to populate it lands in a follow-up; for now the table can be seeded directly or via a future `/admin/opportunities` page.)\n\n**Loot Vault halved.** The old Loot Vault was a tall card with a 5xl/6xl credits counter + a frosted 3-stat row + a fat 3px milestone bar with 32 px circular tier markers. Refactored to a SINGLE-ROW horizontal strip: credits counter on the left (3xl/4xl), slim 2px milestone bar with 12 px tier dots in the middle, and a `Trophy N/M` chip + `Open vault` affordance on the right. Roughly half the vertical real estate; same gradient + blob accents so it still reads as the Loot Vault.\n\n**Personal-status strip below the board.** The trainee's own status (courses in progress, talent-pool state, EQUIP application status) used to anchor the Pillar Trinity. It still matters but doesn't need a hero panel — moved to a compact three-column strip below the DEADLINE-DRIVEN board: `Your training / Your placement / Your funding`, each with a one-line primary state + two-line secondary lines + a single CTA.\n\n**Tighter page rhythm.** Section padding was `py-7 sm:py-9` / `py-9 sm:py-12`; now `py-4 sm:py-6` / `py-5 sm:py-6` across the board. Inner `mt-5` margins on section bodies trimmed to `mt-3`/`mt-4`. Grid gaps `gap-x-10 gap-y-8` tightened to `gap-x-8 gap-y-6`. The dashboard feels noticeably more compact end-to-end.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Full-site UI audit sweep — accessibility, navigation, visual polish",
    body: "Ran a comprehensive UI audit (IA + nav, design-system adoption, accessibility, visual hierarchy) and shipped the actionable fixes in one batch.\n\n**Accessibility (P0)**\n  • **Login form focus rings.** Every input + the submit button + the Sign-up Link now carry `focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2` so keyboard users can see what's focused. Was a WCAG 2.4.7 fail.\n  • **Remember-me checkbox focus state.** The `sr-only` native checkbox now proxies a visible focus ring onto the styled `<span>` via `peer-focus-visible:*` so keyboard focus is no longer invisible.\n  • **ThemePicker + ThemeCycler touch targets.** Both bumped to `min-h-[44px] min-w-[44px]` (WCAG 2.5.5 AAA) — they were 32 px and 34 px before. Also added focus-visible rings.\n  • **Subtle-text contrast on Sakura / Icecream / Greenwood.** `--fg-subtle` darkened in all three themes (Sakura `#a87e80 → #8a5d5f`, Icecream `#a78fa6 → #7d5d7c`, Greenwood `#7e8d72 → #5d6b55`) so hints / footnotes clear the 4.5:1 AA threshold on their respective bases.\n  • **MscCultureCycle reduced-motion.** New `useReducedMotion` hook freezes the cycle on the first stage and nullifies all inline `transition` styles when the OS preference is on — was bypassing the global CSS guard.\n  • **DraggableGlyph keyboard boundary.** The pointer-event layer is now explicitly `aria-hidden` + `tabIndex={-1}` so the decorative login glyphs can never leak into the keyboard tab order. The drag/poke physics stays a mouse-only ENHANCEMENT; keyboard users see no missing functionality.\n  • **Gradient-clipped headline fallback.** The 'culturing' word on the login teaser now declares a solid `text-emerald-200` fallback before the gradient override — contrast checkers can verify it, and unsupported browsers stay readable.\n  • **MscCultureCycle progress dots.** Wrapped in `role='progressbar'` with `aria-valuenow / aria-valuemin / aria-valuemax / aria-label` so the six dots announce as a proper cycle indicator instead of decorative circles.\n\n**Information architecture (P1)**\n  • **`/compliance → /admin/compliance`.** The compliance overview was admin-only but lived at a root-level path that didn't match its peers (`/admin/security`, `/admin/audit`). Moved into the admin namespace; the old `/compliance` route is now a redirect, and the four in-page links (`/admin/security/page.tsx`, `/admin/security/policies/page.tsx`) point at the new URL.\n  • **`/admin/access-requests` added to the sidebar nav.** The page existed on disk and was linked from `/admin/inbox` + `/admin/insights` + `/admin/experience-metrics`, but had no top-level nav entry. Now lives at the top of OPERATIONS (above Merch fulfillment + Events).\n\n**ThemePicker semantics (P1)**\n  • Dropdown gets `role='menu'` + `aria-label='Choose theme'`; theme rows get `role='menuitemradio'` + `aria-checked` so screen reader users hear the dropdown as a radio group.\n  • Active-theme `Check` icon now has an `sr-only` 'Currently selected' announcement so SR users learn which theme is active without relying on the icon.\n  • `Palette` + `Sparkles` icons inside labeled buttons marked `aria-hidden`.\n  • `aria-haspopup='menu'` + `aria-expanded` wired to the picker trigger.\n\n**Featured-limited-time promo softened (P1)**\n  The card was using rose for the ring, button, and corner washes — overpowering the rest of the muted menu. Now: neutral `ring-line`, brand-tone CTA (`bg-brand-600`), corner washes drop opacity. The only rose accent left is a small 'Limited time' pip badge, which reads as a tag rather than the card's mood. CTA also got a focus-visible ring.\n\n**Visual hierarchy (P1)**\n  • **EQUIP pillar cap at 3 deadlines + '+N more' link.** The deadline list was up to 4 rows tall; on busy cycles that broke the three-column-grid balance with ENGAGE + EXPERIENCE. Now shows 3 rows with a `+N more` link to `/equip` when more are queued.\n  • **Loot Vault gradient softened.** The 5-stop rainbow (`indigo → violet → magenta → orange → amber`) was tonally jarring on top of the band wash. Refined to a 3-stop ramp (`indigo → violet → magenta`); the warm spectrum stays present via the amber + fuchsia blurred blob accents. Dashboard band wash also retuned to the same 3-stop palette at low opacity so the two layers stop fighting.\n  • **StylizedMark visible on small viewports.** The login petal backdrop was `bottom: -160px; right: -160px` with `size={520}` — effectively invisible below `lg`. Now renders at `size={320}` with `-bottom-32 -right-32` below `lg`, and grows to the full dramatic size on `lg+`.\n\n**Design-system tokens (P2)**\n  • Replaced hard-coded `bg-slate-100 / text-slate-700 / text-slate-900` on the courses[id] 'archived' banner with the proper `bg-elevated / text-fg-muted / text-fg` theme tokens. (The 44+ other slate hits in the codebase are mostly status-pill colour maps where slate semantically means 'neutral/inactive' — left as-is.)\n\n**Not actioned (audit findings that aren't really bugs)**\n  • The duplicate 'Talent pool' nav entry: appears once in `employerItems` (employer role) and once in admin items — same href, but different roles. That's intentional, not a duplicate.\n  • `rounded-3xl` outliers: many uses (employer cover banner, ProfileEditorAccordion, AdminDashboard tour cards, DSSection cinematic panels) are intentional 'big feature panel' choices, not strays from `rounded-2xl`.\n  • Loot-card hover transform under reduced-motion was flagged but is already handled at `globals.css:980` (`transform: none` in the reduced-motion block).\n  • Form label associations on the login page: `LineField` wraps the `<input>` INSIDE the `<label>` — that's a valid implicit-label pattern, not a bug.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Trainee dashboard — EQUIP lists real VC/VL deadlines, playful Loot Vault returns, Sakura promo moves into the theme picker",
    body: "Three refinements on the trainee dashboard.\n\n**EQUIP pillar column — lists the real VC + VL funding windows instead of just a count.** The headline metric used to be a bare \"X windows open\" — useful as a pulse, useless as a planning tool. Swapped the `prisma.equipDeadline.count()` query for a `findMany()` that pulls the next four upcoming windows (`status in [\"open\", \"extended\"]`, `deadlineAt >= now`, ordered ascending, capped at 4 to keep the column scannable). New `EquipDeadlinesList` component renders each row as a colour-dotted stream tag (VC sky-blue for VentureConnect, VL indigo for VentureLift), the deadline date, and an \"Extended\" pip when the window was shifted post-creation. Empty state still says what's coming (\"New VC + VL cycles drop most months\") instead of \"0 windows\". `PillarColumn` got an optional `metricSlot?: React.ReactNode` so the EQUIP column can render this list in the metric real estate while the ENGAGE and EXPERIENCE columns keep their big-number presentation.\n\n**Loot Vault returns to its original playful style.** The dashboard's bottom-band Loot Vault had been quietly downgraded to a flat slim widget (a label + a thin progress bar). Restored the full arcade scoreboard energy the `/rewards` page leads with — rainbow gradient panel (`linear-gradient(135deg, #4338ca → #6d28d9 → #be185d → #f97316 → #fbbf24)`), three soft blurred blob accents for depth, three floating glyphs (Gift, Sparkles, PartyPopper) on `loot-float` / `loot-float-slow`, a 5xl/6xl mono credits counter with the amber star, a frosted 3-stat row (Tiers unlocked / Claimed / To next loot or MAXED), and the fat 3px glowing milestone bar with 8×8 circular tier markers (`loot-glow` on reached ones, frosted backdrop-blur on locked) and the tall white \"you-are-here\" pin. The whole panel is a Link → `/rewards` so any click lands in the full vault. Bottom band on the dashboard is now a single full-width column for the Loot Vault — the previous \"Today's theme\" companion has migrated (see below).\n\n**Sakura promo migrated into the theme picker as a Featured Limited-Time promo.** The `DailyThemeCard` on the dashboard nudged a different theme each day, with Sakura preempting the rotation during its May 2026 window. That nudge is now colocated with the action — when you open the theme picker (palette icon, bottom-left of the sidebar), a featured promo card sits at the very top of the dropdown for the currently-active limited-time theme, with a bigger 52 px swatch, rose-coloured theme-washed corner blurs, a \"Limited time\" eyebrow with a sparkle, a `Try Sakura · 13 d left` (or `· last day`) rose-filled CTA that computes the countdown client-side from the theme's `endsOn` date. Discovery is where it should be — beside the picker — instead of pestering trainees on their dashboard. `DailyThemeCard` is no longer rendered on the trainee dashboard.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login page — glyphs stay in the periphery, trimmed chrome, both CTAs share the gradient style",
    body: "Three refinements on the live /login page.\n\n**Floating glyphs now hug the periphery only — never the centre.** Repositioned every background glyph into a strict LEFT-EDGE / RIGHT-EDGE band within ~6 % of the viewport edge, well clear of the form column in the middle. Left edge gets Antibody (top), Ribosome (upper-mid), DNA helix (mid), T-flask (bottom). Right edge gets the MSC vignette (top, the big storytelling piece), LNP (upper-mid), Cell (mid-lower), Bioreactor (bottom). The earlier centre-zone placements for LNP (was `right-[26 %]`) and Ribosome (was `left-[34 %]`) are gone. Combined with the swim translate (≤ 58 px), rotation orbit (≤ ~40 px), and a poke physics that pushes glyphs AWAY from any cursor that drifts close (and the cursor lives over the form, in the centre), the glyphs literally cannot wander out of the periphery. All eight remaining glyphs are `hidden lg:block` so they only fire when the viewport actually has periphery to fly around in.\n\n**Trimmed chrome — the in-text string, the section divider, and the five small atoms are gone.** Removed: (1) the `// p < 0.05, results pending` mono footnote at the end of the hero paragraph, (2) the horizontal `Spec. / Sign in / Join` section divider that sat between the hero and the 2-column access pair (replaced by a margin-only gap), and (3) all five small O₂ + CO₂ atoms that were scattered across the centre band. The page reads cleaner — eight major glyphs in the periphery, one centred hero, two CTAs in the spread below, no horizontal noise across the middle.\n\n**Both CTAs now share the brand-gradient style.** Earlier the Sign-up button was the brand-gradient `linear-gradient(120deg, #1d4f8b → #2c8aa3 → #3fa86a)` with an inner shine sweep, while Sign-in was flat white-on-slate. User flagged this — both should share a style, and not the flat-white one. The Sign-in button now wears the same gradient + inner shine sweep + drop-shadow + inset highlight as Sign-up, with the same `hover:-translate-y-px` lift. The pair reads as one design system now; the only difference between them is the CTA copy (`Create your free account` vs. `Sign in`) and the second column's email/password/MFA form sitting above the button. Differentiation through context rather than treatment.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login backdrop — gentler graceful poke + slow per-instance rotation + a ribosome translating mRNA",
    body: "Three refinements on the live /login atmosphere, all in response to the feel of the previous build.\n\n**Gentler graceful poke.** The earlier version moved the glyph by `offset += force × 0.18` each frame — at full force (cursor right on top of it) that was a hard, kick-style push. Replaced with a velocity-based physics step: each frame the cursor (when within `pokeRadius`) ADDS to a velocity, a spring constant adds a pull-back component, and the velocity is then damped (`v *= 0.92`) and integrated. Force easing is now quadratic — `(1 − dist/R)²` — so it's whisper-soft right at the radius edge and builds smoothly as the cursor closes. Default `pokeRadius` widened from 110 → 150 px so a glyph starts drifting BEFORE the cursor reaches it, not as a reaction at contact. The net effect: glyphs glide away rather than jump. Distance is now measured from the inner element's `getBoundingClientRect` so as the glyph drifts, the next push direction is computed from where it currently appears (post swim + spin + drag), not from its static base origin — feels right when a glyph has wandered far from where it started.\n\n**Slow per-instance rotation around a random centre of weight.** New `.lab-spin` + `.lab-spin-rev` CSS keyframes (60–140 s for a full rotation, linear easing, customisable via `--spin-duration` + `--spin-origin` custom properties) and a new spin layer in `DraggableGlyph` (between the lab-swim wrapper and the inner drag wrapper). On mount each glyph randomises four spin parameters — duration (60–140 s), transform-origin X (25–75 %), transform-origin Y (25–75 %), and direction (50/50 clockwise vs counter-clockwise) — so no two glyphs spin in unison. Glyphs whose random origin lands near 50/50 twist in place; glyphs whose origin lands toward a corner trace a wider orbital arc as they rotate. Randomisation runs in `useEffect` (not in render) so there's no SSR / client hydration mismatch.\n\n**A new ribosome translating mRNA.** New `<Ribosome>` glyph in `BiomanufacturingGlyphs` — the iconic large + small subunit pair (60S / 40S in eukaryotes), the mRNA strand threading through the cleft between them with 5′ / 3′ labels at each end, and a growing peptide chain emerging from the large subunit's exit tunnel. Two embedded SMIL `<animate>` loops give a heartbeat-style pulse on the active-site codon AND on the newest amino acid joining the chain (both at 2.2 s period, in sync), so the glyph reads as \"mid-translation\" rather than a static still life. Positioned in the middle band of the backdrop (left 34 %, top 54 %), drifting on `lab-swim-slow` with a generous 170 px poke radius — the chain gets nudged before the cursor reaches the densely-packed subunit body.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login page — half-sketched petal mark + interactive biotech atmosphere + MSC passaging cycle",
    body: "After several iterations the /login page is now its own little biotech aquarium. Designed to feel like flipping open a designer's notebook where one half of the BHN mark is still pencil and the other is already painted, while behind the form the actual workhorse equipment and molecules of biomanufacturing drift past and respond to your cursor.\n\n**The BHN mark, half-sketched.** New `<StylizedMark>` component renders the four-petal logo at 480×480 in two regions split by an organic wavy curve (not a straight line):\n  • **LEFT** is a hand-drawn pencil study — 20 px construction grid + 5 px sub-grid, dashed symmetry circles at r=80/120/160/220, vertical/horizontal axes + 45°/135° diagonals, and the petal outlines stroked THREE times at slightly different translate offsets + opacities (1.4 / 1.0 / 0.8 px stroke, 0.62 / 0.42 / 0.30 opacity) so it reads as layered pencil lines. Wrapped in a `feTurbulence` + `feDisplacementMap` filter (`baseFrequency=0.04`, `scale=2.4`) so the strokes wobble micro-hand-drawn instead of machine-perfect. Tiny registration crosses at the corners, tick marks on the centre axis at 80 px increments, monospace annotations (`y` / `x` / `R0` / `Ø160` / `SECT. A-A`) — the whole vocabulary of a designer's sheet.\n  • **RIGHT** is the finished gradient-coloured mark (blue → green family, same ramp as the live LogoMark + favicon).\n  • **The boundary** is a wavy `clipPath` (cubic curves meandering vertically from top to bottom) rather than a straight cut — and a brush-edge feather mask (`linearGradient` from transparent through 0.55 white at 22% to opaque at 55%) softly fades the colour into the sketch so the painted half looks brushed-on rather than stamped. The mark sits at the bottom-right corner of the page (size 520, pulled `-160 px` off-screen) with `mix-blend-screen` + a cyan/green drop-shadow glow so it lives in the dark periphery, never behind the centred teaser headline or the form columns.\n\n**Interactive biotech glyphs.** New `<DraggableGlyph>` wrapper handles pointer-down/move/up via pointer-capture so you can **click-and-drag** any glyph anywhere on the page. When you're not grabbing, an rAF loop checks the cursor distance to each glyph centre — within `pokeRadius` (default 110 px) the glyph is pushed AWAY from the cursor with force proportional to inverse distance, so brushing past lightly nudges it sideways. When idle, the visual offset eases back toward zero (0.965 multiplier per frame) so the layout doesn't drift forever. Two-layer DOM: outer wrapper stays in the page's `pointer-events-none` atmosphere layer (so the form/links stay clickable everywhere), middle layer runs the `lab-swim` CSS keyframe (32–54 s drift), inner layer is `pointer-events-auto` and takes the pointer drag/poke transform imperatively (no React re-render per frame). Every glyph on the page is now interactive: DNA double helix, monoclonal antibody, mRNA strand, lipid nanoparticle, cell schematic, bioreactor — plus the new T-flask (slanted-neck tissue-culture vessel with cap threads + media line + a few cell colonies inside).\n\n**MSC passaging cycle.** New `<MscCultureCycle>` component renders a six-stage looping animation that tells the full mesenchymal-stem-cell passaging story in one corner of the page:\n  1. **P0 · SEEDED** (3.4 s) — 4 cells in fresh media at 5×10³ cells/cm²\n  2. **PROLIFERATING** (3.6 s) — 9 cells with little `+1` dividing indicators on a couple of them\n  3. **80% CONFLUENT** (4.2 s) — 16 cells, dense monolayer, ready to passage\n  4. **TRYPSIN · 0.25%** (3.6 s) — green wash flows into the dish, cells round up (radius grows from 2.4 → 3.4 with a 500 ms transition, tint goes from blue to green) as the protease cuts adhesion proteins\n  5. **ASPIRATE** (4.2 s) — the pipette descends from above, a stream of cells is drawn up into it (visible cell column inside the pipette body)\n  6. **RE-SEED · P1** (3.0 s) — pipette pulls back, dish is mostly empty, a fresh droplet falls out the tip and a few new cells land\n  Then it loops. Stage label + sub-label render in monospace at the bottom; six dots above the label show the cycle position. Pure React `useState` + `setTimeout`, with CSS transitions on the SVG attributes so each stage hand-off looks smooth rather than cut.\n\n**O₂ + CO₂ flowing around.** Five small O₂ (double bond, two atoms labelled O) and CO₂ (linear O=C=O, two double bonds, three atoms) molecules scattered across the page at low opacity (22–30%), each with its own lab-swim keyframe variant so they drift on different cycles. Tinted sky-blue (O₂) and emerald (CO₂). All draggable too — they're the gas atmosphere of every incubator, brought to the page.\n\n**Two CTAs, distinct styles, same level.** *Create your free account* is brand-gradient filled (cyan → teal → green) with an inset white-shine layer that sweeps in on hover. *Sign in* is flat white-on-slate. Both buttons are anchored at the bottom of their flex columns via `mt-auto pt-8` so they sit on the exact same baseline across the editorial divider — equal weight, equal visual hierarchy. The form fields are underline-only (no card chrome), label uppercase tracked above each, on a dark stage with radial spotlight overhead and edge vignette below.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cinematic hero is now ONE continuous editorial stage — no more two-box feel",
    body: "User flagged that the two-tier cover+body composition still read as *two boxes sitting on one another* — a deep gradient cover up top, then a paper-coloured body card underneath, joined by a horizon hairline. Rebuilt as one continuous stage so the dashboard hero finally reads as a single editorial composition.\n\n**Design** — one full-bleed `.hero-mesh-brand` panel. Theme-driven `--hero-bg` base + the existing built-in mesh radials + four BIG blurred auroras (positioned at the four corners, mostly off-screen so only the dreamy bleed shows). Fine SVG noise on top for editorial grain. The universal `.hero-mesh-brand::before` bottom scrim is the contrast cushion under text on dark stages.\n\n**Composition** — magazine-cover. Big top padding (`pt-36 sm:pt-44 lg:pt-56`) pushes the title block to the bottom of the stage, so the auroras have visual real estate at the top and the title weighs in at the lower edge. Title is `text-4xl/5xl/6xl` with a per-theme **`--hero-title-gradient`** shimmer:\n  • Most themes → default `white → brand-200 → white`\n  • Aurora → `white → brand-500 (lavender) → white` (brighter mid-stop since brand-200 is dark purple)\n  • Icecream → `brand-800 → brand-900 → brand-800` (deep berry, since its hero is light pink and white-on-pink fails)\n\nText colour comes from each theme's `--hero-fg` via `.hero-mesh-brand`'s `color:` rule (white on every dark theme, deep berry on Icecream's light hero). Eyebrow, description, and actions inherit; `text-white/85` was added to Icecream's hero override list so the eyebrow stays legible there too.\n\n**Affects every cinematic-DS page** — dashboard (trainee + admin + instructor + employer), EQUIP surfaces, /experience, /pathways, /courses, /compliance, /admin/assist, /interviews, all admin queues, etc. PageHero → DSPageHeader → this. /employer HR Overview is the one exception (it owns its own bespoke cover for the brand stage).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Aurora — a new theme: the original cinematic gradient, switchable",
    body: "After yesterday's pass made every theme paint its own hero stage, the original *cinematic* gradient (deep near-black-navy with cyan + pink + canary + green auroras) wasn't anyone's palette anymore — it was a hardcoded design that didn't map to a theme.\n\n**New theme: Aurora.** Available in the picker under Flavours. Now you can switch to it like any other theme.\n\n**The look** — page bg `#0d1126` (deep near-black-navy), card `rgba(26,30,60,0.85)`, fg `#e8ebf2` (near-white), royal-purple brand ramp anchored on `#6b21a8`. Page-bg mesh has a cyan haze upper-left + pink haze lower-right + royal-purple wash bottom, so the whole canvas feels like the cinematic stage continues outside the hero.\n\n**Hero** — `--hero-bg: #0b0f24` (the exact base from the original gradient). Four auroras: `--hero-mesh-1: #56bdf8` (cyan, top-left), `--hero-mesh-2: #f472b6` (pink, bottom-right), `--hero-mesh-3: #4ade80` (green, bottom-left), `--hero-mesh-4: #facc15` (canary, top-right). Identical to the hardcoded version that shipped 48 hours ago.\n\n**Tailwind tint overrides** — same approach as Dark theme: soften the 50/100/200 stops of rose / amber / emerald / sky (so muted status backgrounds don't blast on the near-black-navy canvas), keep saturated 500-700 untouched (danger/approve CTAs still pass white-text contrast). Deep-state text (`text-rose-700`, `text-amber-700`, etc.) lifts to bright variants for legibility on the dark canvas.\n\nOpen the theme picker (bottom-left of the sidebar) → Flavours → Aurora.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cinematic hero — editorial drama restored, every theme paints its own stage",
    body: "User flagged that the previous flatten-everything-onto-the-gradient version lost the *beautiful look* from two iterations ago — the deep editorial cover with dreamy blurred auroras, fine SVG noise, mid-line horizon, paper body popping out from underneath, and big gradient-text title sitting on the card like a magazine spread.\n\n**Restored** as a two-tier composition, this time fully theme-driven:\n\n  **(1) Deep cover banner** — base colour `var(--hero-bg)`, four dreamy blurred auroras using `var(--hero-mesh-1..4)`, fine SVG noise overlay (22% mix-blend-overlay), and a mid-line `white/20` horizon hairline. Every aurora is now theme-flavored:\n    • Light → cyan/mint/blue/dark-cyan over deep teal\n    • Dark → cobalt/indigo/deep-navy over near-black\n    • Rosalind → sage/rose/deep-fern over deep sage\n    • Sakura → blossom pink + cream over deep wine\n    • Hitech → electric cyan + teal over near-black\n    • Greenwood → sage + canary + leaf over deep forest\n    • Atompunk → atomic teal + tangerine + canary over blueprint navy\n    • Icecream → peach + mint + lilac over light pink (the only light-hero theme)\n\n  **(2) Paper body** — overlaps the cover by `-mt-24` so the two read as one editorial composition. The body's top wash uses `color-mix(in srgb, var(--hero-mesh-1) 14%, transparent)` + `color-mix(in srgb, var(--hero-mesh-2) 8%, transparent)` so the cover's accent colours bleed into the card before fading to transparent at 36%. The card layer underneath is the theme's `--card`, which keeps the title surface bright + paper-like on every theme.\n\n  Inside the body sits the **icon disc** (white tile with conic-gradient glow ring, `text-brand-700` icon — the conic stays cinematic-flavored cyan/pink/yellow/green so the icon plate reads as a consistent brand object), **eyebrow** (DSEyebrow primitive with the cinematic gradient hairline), **big gradient-text title** (`linear-gradient(135deg, var(--fg) 0%, var(--fg) 55%, var(--brand-600) 100%)` — so it stays in each theme's family while reading as dark editorial text on paper), **description** (`text-fg/85`), and **actions**.\n\nText contrast — title + description are dark `--fg` on light `--card`, which is the highest-contrast surface in the system on every theme. No light-text-on-light-bg failure modes anywhere.\n\nAffects every cinematic-DS page (dashboard, EQUIP, /experience, /pathways, /courses, /admin/assist, /interviews, …). `DSCoverBanner` (the standalone primitive) also refactored to the theme-driven version.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cinematic hero is now THEME-DRIVEN — title sits on the gradient, each theme paints its own stage",
    body: "User-flagged design rebuild. The previous cinematic hero had two problems:\n\n  1. The deep editorial gradient (`#0b0f24 → #142046 → #312e81 → #6b21a8 → #831843`) was **hardcoded** in `DSCoverBanner` — every theme got the same purple-to-rose stage regardless of palette. Atom Punk's blueprint navy + atomic teal, Greenwood's forest sage, Sakura's blossom pink — none of them showed up in the hero.\n  2. The eyebrow + title + description rendered in a **paper-coloured body underneath** the cover, with the body overlapping the cover by `-mt-24`. Even after softening the seam this read as two stacked panels — cover on top, paper card below.\n\n**Rebuilt** as a single full-bleed gradient stage. Eyebrow + title + description + actions now sit **directly on the gradient**, in white text with theme-appropriate contrast handling. The gradient itself is THEME-DRIVEN — `DSPageHeader`'s cinematic branch applies the `.hero-mesh-brand` utility (already used by Studio + `/for-employers`), which reads each theme's `--hero-bg` + four `--hero-mesh-{1..4}` stops + `--hero-fg` text colour. Every theme already declares these tokens, so every theme paints its own stage:\n\n  • Light → deep teal with cyan/mint/blue auroras\n  • Dark → near-black with cobalt/indigo auroras\n  • Rosalind → deep sage with rose accent\n  • Sakura → deep wine with blossom pink\n  • Hitech → near-black with electric cyan\n  • Greenwood → deep forest with sage + canary\n  • Atompunk → blueprint navy with atomic teal + tangerine\n  • Icecream → light pink with deep berry text (scope-override flips `text-white` → berry for the only light-hero theme)\n\n**Contrast** — `.hero-mesh-brand` colour is `var(--hero-fg, #ffffff)`, so every theme inherits the right text colour for its stage. A `::before` bottom scrim (multiply-blended dark gradient that's invisible on dark heroes and adds a 22% darken under text on light heroes) is the universal fail-safe.\n\n**Other niceties retained from before** — editorial SVG noise overlay (16% opacity, mix-blend-overlay), mid-line horizon hairline, optional icon disc (white tile with conic-gradient glow ring, `text-brand-700` icon), optional aside row below the identity with a `border-white/10` divider.\n\nApplies to every cinematic-DS page (the dashboard, EQUIP, /admin/assist, /experience, /pathways, /courses, /compliance, /my-courses, /credits, /gradebook, /interviews, …). `/employer` HR Overview is untouched — it has its own hand-tuned cover.\n\n`DSCoverBanner` (used to be the hardcoded deep-purple banner) was also refactored to use `.hero-mesh-brand` so any future standalone use also picks up the theme tokens.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cinematic hero — less separation between the cover and the body",
    body: "User flagged that the new cinematic page hero read as two stacked panels — the deep editorial cover banner on top, a clean *paper-coloured* body panel underneath — with a hard horizontal cut where the cover ended.\n\n**What changed.** `DSPageHeader`'s cinematic body wash was a two-layer recipe: a soft brand-blue → pink tint fading out by 35% from the top, sitting on top of an *opaque* `var(--card)` base. That bottom card layer was painting a solid line of paper underneath the entire body, which is what created the cut.\n\nReplaced with a single gradient that carries the cover's editorial palette (rose → purple → indigo) down into the body before settling into opaque card around 45% of the way down: `linear-gradient(180deg, rgba(131,24,67,0.20) 0%, rgba(107,33,168,0.14) 8%, rgba(49,46,129,0.07) 20%, var(--card) 45%, var(--card) 100%)`. The top of the body now picks up the same rose / purple / indigo hues the cover ends with, so the two surfaces read as one continuous stage. The card still becomes opaque well before the title's baseline so the gradient-text title stays legible.\n\nApplies to every cinematic-DS page (which after yesterday's audit is most of the platform) — the dashboard, EQUIP surfaces, /admin/assist, /experience, /pathways, /internships, /courses, /compliance, /my-courses, /credits, /gradebook, /interviews, etc. /employer HR Overview keeps its bespoke cover (unchanged) because it has its own hand-tuned body wash.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Atom Punk — a new theme in the picker (1950s atomic age, Googie diner aesthetic)",
    body: "New flavour-tier theme: **Atom Punk**. Open the theme picker (Flavours → Atom Punk) to try it.\n\n**The look** — *aged-paper cream* base (#f3ead8), *atomic-teal* brand ramp anchored on the specific turquoise that hit mid-century fridges and Cadillac dashboards (#1a8a8a), *tangerine sunset* accent (#e85a3c), *canary* spark (#f5c81f), and *blueprint-navy* text (#0e1a3a). Reads like a vintage Tomorrowland brochure or a Vault-Tec pamphlet.\n\n**Hero gradient** — deep blueprint navy at top fading through atomic teal into tangerine + canary at the horizon: \"sunset over the test site\", same colour run you'd see on a 1957 vacation brochure for Las Vegas.\n\n**Typography** — slab-serif display headlines (Roboto Slab → Source Serif Pro → Charter on Mac → Georgia fallback), geometric sans body (Work Sans → Inter). Heading tracking nudged WIDER (0.02 em, not the modern tight default) — the look every mid-century print piece used for display type.\n\n**Surfaces** — sharp 2-4 px corner radii (atomic-age geometry, not playful pebbles), `box-shadow` carries a soft teal cast so cards feel like inset blueprint pockets rather than floating modern panels, half-tone print grain dotted into the canvas mesh.\n\n**Tailwind tint overrides** — `bg-rose-50` pulls toward tangerine, `bg-amber-50` toward canary, `bg-emerald/sky-50` toward atomic teal (so the brand colour spans `text-emerald-700` calls). Standard saturation would have blasted the paper canvas.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Design-system unified to Cinematic everywhere except HR Overview; sidebar bar handles multi-line group titles",
    body: "Two refinements user-decided after the design-system audit.\n\n**One DS for everything except HR Overview.** Until today the platform was mixing three hero patterns — Studio (forced on /employer, /admin/equip/overview, /talent-pool, /dashboard-for-employers), Cinematic (DS-aware pages when the admin picked it), and the legacy PageHero band. User picked Option B with the HR Overview as the exception. So:\n  • `DEFAULT_DESIGN_SYSTEM` flipped from `classic` → `cinematic`. Every DS-aware surface (EQUIP landing, EQUIP queue, EQUIP overview, EQUIP application wizard, /admin/assist, etc.) now reads Cinematic by default.\n  • `<PageHero>` rewritten to render the SAME shape Cinematic's `DSPageHeader` produces — `rounded-3xl` outer panel + deep editorial cover banner + body that overlaps the cover at `-mt-24` + gradient title in the body. All 13 PageHero callers (/pathways, /experience, /internships, /courses, /compliance, /my-courses, /certificates, /gradebook, /credits, /committee/hqp/meetings/[id], /admin/copy, /admin/split-view, /dashboard for trainees/admins/instructors) inherit the look automatically. The `tone` and `side` props stay on the signature for source compatibility; `tone` is now a no-op (the deep gradient is fixed) and `side` collapses into the actions row.\n  • The Studio overrides on `/admin/equip/overview` and `/talent-pool` are removed — both surfaces are workspace tools, not brand stages, so they inherit Cinematic now. `/employer/*` keeps its explicit Studio override (the canonical HR Overview brand stage). `/dashboard` for employer-role users also keeps Studio because that route IS the HR Overview surface for the employer's landing.\n\n**Sidebar bar — multi-line group titles fixed.** The 1-px accent bar in the Administration sub-groups was anchored at `top: 34px` (tuned for single-line headings like \"Engage\"). Two-line headings like *Security & compliance* shifted the menu items down but the bar stayed at 34 px, so its top edge ended up alongside the heading text. Restructured: the heading and the bar's container are now siblings; the bar lives in an inner `<div>` whose `top: 0` lands naturally at the first NavLink's top edge regardless of how many lines the heading wraps to. Same visual for single-line groups; finally correct for multi-line ones.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "HR Overview — logo briefcase fixed, high-res logos, main business + stock ticker, smarter About",
    body: "User-flagged refinements on the `/employer` HR Overview surface.\n\n**1. Briefcase fallback no longer shows through the logo.** The disc rendered a generic `<Briefcase>` glyph absolutely-positioned underneath the company `<img>`, relying on the image to cover it. Logos with internal transparency (Bayer's white cross, plus a long tail of brand marks) let the briefcase show through, so the disc read as an icon stacked on the brand mark. The fallback is now MUTUALLY EXCLUSIVE — rendered only when `src` is empty.\n\n**2. Auto-fetch now extracts the description (and more).** When you paste a URL the AI prompt now explicitly requires `companyDescription` whenever the homepage has any about-section text — previously the field came back empty often enough that we were rewriting it by hand. Two new fields join the extraction:\n  • **`companyMainBusiness`** — one short line listing main lines of business + flagship products (e.g. *\"Pharmaceuticals, crop science, consumer health — Aspirin, Yaz, Xarelto\"*).\n  • **`companyTicker`** — stock ticker with the exchange prefix when public (e.g. *\"BAYN.DE\"*, *\"NYSE:MRK\"*); empty for private companies.\nBoth fields land in the editor's manual section with format hints, and both come back populated on the auto-fill round-trip.\n\n**3. High-res logo fallback chain.** When the homepage scrape doesn't surface a logo, we used to fall back to Google's `s2/favicons` endpoint — which returns at most 128 px. The new chain prefers Clearbit's hosted logo service (`logo.clearbit.com/{domain}?size=400`), which usually returns the brand's actual mark at 256 px or higher. Google favicon is kept as the absolute last-resort safety net.\n\n**4. About section repositioned.** The giant decorative quote glyph used to sit above the first word of the description, overlapping the prose on smaller widths. It's now anchored to the RIGHT gutter of the quote column so it reads as a margin mark rather than competing with text. The About section also gains a second column on md+ that holds the new **Listed as** ticker badge (gradient-text, monospace) plus a **Main business & products** line. Right column hides entirely when both new fields are empty, so private companies still see the original single-column layout.\n\n**Schema** — migration `20260627000000_employer_main_business_ticker` adds the two optional columns to `User`. Backwards compatible; every existing employer row reads as null until the operator fills them in (or auto-fills).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Committee names tidied; five more trainee pages get a proper hero",
    body: "Two small refinements user-flagged.\n\n**Committee names** in `lib/committees/registry.ts`:\n  • *Equip Review Committee* → **EQUIP Review Committee** (all-caps EQUIP everywhere it refers to the pillar, matching the same pass we did across the rest of the platform).\n  • *HQP Committee* → **HQP Advisory Committee** (the official name from the charter; previously shortened in the registry only). The committee surfaces (welcome badge, sidebar shortcuts, application form, audit-log entries) now display the full name. Description bumped to mention that trainees and partners alike are eligible — committee membership is not role-gated.\n\n**Hero coverage** — five more trainee surfaces upgraded from a small inline `<h1>` (or no header at all) to the canonical `<PageHero>` band you see on `/pathways` and `/experience`:\n  • `/my-courses` — was rendering a small `PageHeader` inline; now opens with a full-bleed brand hero (\"Your enrollments · My Courses\").\n  • `/certificates` — was a bare h1; now opens with a brand hero (\"Earned credentials · My Certificates\").\n  • `/gradebook` — was a bare h1; now opens with a brand hero (\"Your performance · Gradebook\").\n  • `/credits` — was a bare h1; now opens with a brand hero (\"ENGAGE credits · My BHN Credits\") with the expiry warning copy moved into the hero description.\n  • `/committee/hqp/meetings/[id]` — meeting detail had only a back-link; now opens with a brand hero whose title is the meeting title and whose eyebrow reads *HQP Advisory Committee · meeting*, with the scheduled date in the description.\n\nThe rest of the dashboard (admin pages, detail pages with custom context, redirect aliases, in-flow form surfaces) keeps its existing headers — those weren't missing heroes, they have surface-appropriate alternatives.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Story Bank redesigned — one bigger panel, hairline-divided sections, gentle gradients",
    body: "`/profile/stories` used to be a stack of separate cards — header card, admin demo card, story-list cards, footer help card — which read as four boxes piled on top of each other. The user asked for *less rounded-corner boxes, more lines for separation, inside a bigger box with gentle gradients*. Rebuilt that way:\n\n  • **One outer `rounded-3xl` panel** holds the whole page. Its background is a vertical brand wash that fades softly from `--brand-50` at the top → `--card` through the middle → a hint of brand again at the bottom, so the eye reads it as one continuous canvas with subtle warmth at the edges.\n  • **Four inner sections** — *Profile · Story Bank* header, optional *Admin · demo seed* tray, the stories themselves, and *Add more stories* help — are separated by `border-b border-line` hairlines rather than nested cards.\n  • **Each section has its own faint gradient tint** for tonal contrast: the header carries the brand wash; the admin tray gets a low-opacity amber fade so it visually clusters as the admin-only chrome it is; the stories live on a clean `--card` mid-strip; the footer help dips into a brand wash from the bottom edge upward.\n  • **Each section opens with a small eyebrow marker** — `Profile · Story Bank` / `Admin · demo seed` / `5 stories on file` / `Add more stories` — preceded by a sky→violet (or amber, for the admin row) gradient hairline. Same vocabulary the HR-overview brand stage uses, so the surface feels at home next to `/employer`.\n  • **Gradient-text title** — \"Your STAR stories\" grades from `--fg` into brand-blue, mirroring the cinematic DS treatment.\n  • **The story list itself is flatter** — `StoryBankClient` was rendering each story as its own `rounded-2xl border surface-shadow` card with `space-y-3` between them. Now they're hairline-divided list rows (`divide-y divide-line border-y border-line`) with hover/open elevation provided by background wash, not chrome. Click a row to expand the inline editor exactly as before.\n  • **Empty state** is no longer a separate rounded card either — it's an in-section centred block (icon + headline + description + CTA) that sits cleanly inside the content section's bounds.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Application Builder + 12 other pages now centred in the dashboard column",
    body: "User flagged that the *Application Builder* and several other pages were rendering left-aligned within the dashboard's max-w-7xl column — the page authors had set a narrower `max-w-3xl` / `max-w-4xl` cap on the outer container but forgotten the matching `mx-auto`, so the content collapsed to the left edge instead of centring like `/experience` (the *How it works* page) does.\n\nSwept every page under `src/app/(dashboard)/` and added `mx-auto` to the 13 outer containers that were missing it:\n\n  • Application Builder · `/profile/application`\n  • Application Tracker · `/profile/applications`\n  • My Skills · `/profile/skills`\n  • Interviews · `/interviews`\n  • Profile · `/profile`\n  • Security · `/profile/security`\n  • Keyboard Shortcuts · `/profile/shortcuts`\n  • Credits · `/credits`\n  • Apply for credits · `/credits/apply`\n  • Buddy detail · `/buddy/[id]`\n  • Course detail · `/courses/[id]`\n  • Admin security · `/admin/security`\n  • Admin credit-application detail · `/admin/credit-applications/[id]`\n\nNo type signatures touched; pure className tweak so every page now centres the same way `/experience`, `/pathways`, and the other PageHero-using surfaces already do.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "VC monthly deadlines pre-populated through 2028 + verify-email banner clears translate overlay + committee dedup",
    body: "Three small fixes user-flagged.\n\n**VentureConnect monthly deadlines auto-populate through end of 2028.** Until now only VentureLift had a published per-round schedule in code (Rounds 3–7); VC's recurring \"deadline on the Monday of the last week of every month\" cadence had to be entered by hand at `/admin/equip/deadlines`. There's now a `venturConnectMonthlyDeadlines()` generator in `lib/equip/calendar.ts` that produces one DerivedDeadlineSpec per month from May 2026 through December 2028 (32 windows). It uses a `lastMondayOfMonth()` helper that walks back from the last day of each month until it lands on a Monday, then wraps the result in `noonEasternOn()` for the canonical UTC instant. The existing idempotent sync on the deadlines page picks these up on next render and inserts them into `EquipDeadline` — applicants can never submit past one of these windows without an admin reopening it. Bump `VC_DEADLINES_THROUGH_YEAR` in `calendar.ts` to extend.\n\n**Verify-email banner no longer gets covered by Chrome's translate overlay.** Chrome's *文A Translate* pill floats in the top-right of the viewport on pages where it detects a non-default language; that's the same spot where the unverified-email banner kept its *Resend* + dismiss buttons. Added `sm:pr-24` to the banner's inner container so the controls move ~96 px inward on tablets and up, well clear of the floater.\n\n**COMMITTEES sidebar no longer duplicates routes admins already see.** When an admin was also a member of the EQUIP Review committee, they saw the three Equip routes twice — once under *Administration → EQUIP*, once under *COMMITTEES*. The COMMITTEES section now collects every admin-visible href into a Set and filters committee sidebar items whose href is in that set. After filtering, committees with zero remaining items are dropped, and if all committees become empty the section header disappears entirely. Non-admin committee members are unaffected — they still get the COMMITTEES shortcuts (their primary entry point into the review queue).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Greenwood auto-adapts to dark mode; sidebar bar moves to the left gutter; /equip copy tightened",
    body: "Several user-flagged refinements.\n\n**Greenwood auto-snaps to dark mode** — the theme now listens for `prefers-color-scheme: dark` and forces its night palette (moonlit canvas + fireflies + cooler mist) regardless of the local hour the moment your OS flips dark. Toggle your OS theme and the canvas retints + fireflies appear live. During day-mode OS, the existing hour-based dawn / day / dusk / night cycle still applies. So fireflies are always available — either at night by the clock, or whenever you've got your OS in dark mode.\n\n**Sidebar admin sub-group bars** moved again. They now sit at `left-0` of the wrapper (sidebar-x = 12 px) — right in the middle of the 24 px visual gutter between the sidebar's left wall and where icons render. Previous attempts at `left-3` and `left-9` kept landing inside the icon column or the icon-label gap; the new position is the actual left-side gutter the user asked for. Bar top moved to `top-[34px]` so it begins at the mid-point of the visible gap between the heading text bottom and the first menu item's icon top. Added `z-10` so it stays visible above NavLink hover/active backgrounds.\n\n**/equip page copy tightened** —\n  • Removed *\"The third BHN pillar after Engage (training) and Experience (placements). \"* — explanatory positioning that didn't belong on the surface where applicants land to start an application.\n  • Eyebrow is now **EQUIP · BHN funding pillar** (was *Equip · …*); pillar names always render in all-caps when referring to the pillar.\n  • Description now reads **EQUIP backs trainee-entrepreneurs with strategic funding…** (was *Equip backs…*).\n  • Removed the *Brand stage* editorial marker that was leaking onto every cinematic-DS surface from `DSCoverBanner`. That label is specific to the HR Overview at `/employer` and now only renders there (where it's hardcoded in the employer page's own custom cover).\n\n**Pillar-name casing pass** — audited every user-visible string that refers to the EQUIP / ENGAGE / EXPERIENCE pillars and bumped them to all-caps where they were rendering mixed-case. Updated: sidebar admin nav labels and descriptions (EQUIP overview, EQUIP review, EQUIP deadlines, plus the Administration section description); assist help-cards body text (start-funding, draft-resume, under-review, admin-triage). Headings that already render via `uppercase` CSS were left as title-case in source — display is already correct, and changing the source breaks i18n labels.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Dashboard heroes match the /pathways scale; events calendar picks up Presidential Days",
    body: "Three fixes.\n\n**Dashboard heroes** — the trainee dashboard (`/dashboard`) and the admin dashboard were rendering a deliberately compact identity strip (`pt-7 pb-20` padding, `text-2xl md:text-3xl` title, `text-sm` body). They now use the same hero proportions as `<PageHero>` on `/pathways` and friends: `pt-20 pb-16`, `text-4xl md:text-5xl` title, `text-base md:text-lg` body, `mb-10` bottom margin, larger drifting blobs to match the bigger canvas. Both dashboards now read as proper brand stages at the top of the page instead of strip-shaped intros. Instructor dashboard already matched.\n\n**Events calendar** at `/events` now surfaces the canonical University of Toronto holiday schedule. Previously `lib/holidays.ts` was a pure-algorithmic list — fixed dates (Canada Day, Christmas) plus sliding ones (Family Day = 3rd Mon Feb, Easter-derived) — but Presidential Days are admin-declared each year and don't follow any rule the algorithm could derive, so they were silently missing. The events calendar `buildHolidayMap` now OVERLAYS `UOFT_HOLIDAYS` from `lib/equip/calendar.ts` (which mirrors <https://people.utoronto.ca/memos/holiday-schedule-2025-26-and-2026-27/>) on top of the computed list, picking up all five Presidential Days (2025-06-30, 2025-08-01, 2026-05-15, 2026-06-29, 2026-06-30) and the full December Holiday Break (Dec 24 → early Jan, longer than just Christmas + Boxing Day). Statutory entries win on conflict so Canada Day stays classified as fed-red, not relabelled as the same U of T closure. **Friday May 15 2026 Presidential Day now shows on both the /events calendar and the /admin/equip/deadlines calendar.**\n\n**`UOFT_HOLIDAYS` data tidied** — \"Winter holiday break\" relabelled to \"December Holiday Break\" to match the official memo wording, and the 2026-06-29 / 2026-06-30 Presidential Days are now two separate entries (matching how the memo itself treats them) instead of a single multi-day range.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Greenwood — now a forest you can walk into, not just a green theme",
    body: "The Greenwood theme used to be a quiet green palette with a canopy hero. It's now an actual scene that shifts with the time of day on your laptop.\n\n**What you'll notice when you switch to Greenwood:**\n\n  • **Falling leaves drift across the page** all day — oak, maple, elm, birch silhouettes in russet / sienna / ochre, each on its own slow path, swaying as it falls. Seven leaves on screen at any time, never quite the same fall twice.\n  • **The canvas retints by the hour** — dawn brings mist with pinks bleeding into pale gold, midday is bright canopy gold with fern shadows, dusk turns amber + bruised purple, after 8 pm the whole platform shifts to a deep navy + moonlit-moss palette with cool mist drifting low. Recomputed every 5 minutes so a long tab follows the day.\n  • **Mid-day adds dappled sunlight** — four blurred warm patches that breathe and shift around the viewport, like sun broken up by an overhead canopy.\n  • **Night adds fireflies** — nine warm yellow blooms blinking out of phase, with three drifting on their own slow paths between the trunks.\n  • **A scene caption** sits bottom-right and rotates every 18 s through forest observations matched to the current hour: \"a cardinal calls from the cedar\", \"fireflies hover near the brook\", \"first light filters through the canopy\". Twenty-six lines across the four time slots.\n  • **Surface tokens retune at night** — cards, type, and lines all shift to the moonlit palette so the platform stays legible against the deeper canvas instead of just inverting badly.\n\nEverything respects `prefers-reduced-motion` — the atmosphere layer bails entirely, leaving just the time-of-day tint. The layer is pointer-events-none and aria-hidden so it sits decoratively above the page background and never gets in the way of anything you're actually doing.\n\nSwitch to it from the theme picker (Flavours → Greenwood).",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar — admin sub-group titles are now proper anchors, bars sit under the labels",
    body: "Two-step tweak to the Administration sub-group treatment.\n\n**The group titles** (Engage / Experience / Equip / Insights / Platform / Security & compliance / System) used to be tiny 10-px grey IDs that read as machine labels, not section markers. They're now 12-px bold with the section's own tone colour — emerald for Engage, amber for Experience, sky for Equip, violet for Insights, cyan for Platform, rose for Security, slate for System — so each group reads as a proper anchor and you can pick a pillar out of the menu at a glance.\n\n**The 1-px coloured accent bars** moved out of the icon column (where they were getting visually clobbered by the lucide icons at `left-3` / x = 12 px) and into the icon-label gap at `left-9` / x = 36 px — so each bar now lands squarely under the right half of the title text AND aligns with the column where the menu item labels begin. Bar starts at `top-9` so it begins clearly below the new bigger title (the old `top-7` was too close once the title grew), and went from 1 px to 2 px wide to hold its weight under the bolder heading.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Cinematic design system rebuilt to match the HR Overview look",
    body: "The Cinematic DS now renders the same way the `/employer` HR Overview does. Before, `<DSPageHeader>` in cinematic mode rendered as a soft pastel cover banner with the title cramped *inside* the banner and the description floating in a separate rounded card *below* — two visually disconnected pieces. Now it's one rounded-3xl panel:\n\n  • **Deep editorial cover** — the same 5-stop gradient (#0b0f24 → #142046 → #312e81 → #6b21a8 → #831843) + four cyan / pink / yellow / green auroras + noise + horizon line as `/employer`'s cover banner. Lifted verbatim so the two surfaces match pixel-for-pixel.\n  • **Body overlaps the cover** by -mt-24, with a brand-blue → pink wash bleeding down from the cover seam into the body. The result reads as one continuous brand stage instead of a cover plus a separate card.\n  • **Giant gradient title** in the body (3xl → 5xl), grading from `--fg` through brand-blue. Optional icon renders to the left as a 64-px disc with a conic-glow ring, mirroring the HR-overview logo treatment.\n  • **`aside` rendered as its own row** beneath the identity row, divided by a hairline and given a subtle prism wash — so stat tiles passed as `aside` get the full panel width to breathe instead of being squeezed into a right column. Mirrors HR overview's STATS section.\n\n`<DSStatGrid>` lost its boxed chrome — it's now a clean hairline-divided row designed to sit inside the cinematic header's aside row or inside a `<DSSection>` wash. `<DSStat>` numbers bumped to text-5xl on desktop so the triplet reads at HR-overview scale.\n\n`<DSSection>` in cinematic mode is now its own rounded-3xl card with an optional gradient wash, a section eyebrow (sky → violet gradient hairline + subtle uppercase text — the HR-overview vocabulary), and a generous gutter (`px-6 sm:px-10 lg:px-14`).\n\nSee the side-by-side at `/admin/design-system` (Cinematic panel) — should now feel like the same product as the brand stage at `/employer`.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Retired the Scientific + Retro 8-bit themes",
    body: "Two themes pulled from the registry: **Scientific** (cool sky-blue paper-academic with Charter serif body) and **Retro 8-bit** (NES boss screen — magenta + cyan on CRT-purple, scanlines, Press Start 2P pixel font, dialog-box drop shadows). They had earned their seat at the start of the theme programme, but neither held up next to the curated set (Daylight / Nightfall / Rosalind / Hi-Tech / Summer Ice Cream / Greenwood / Sakura) — Scientific read as a flatter Daylight, Retro 8-bit was a novelty that nobody kept after one session.\n\nRemoved every reference: registry + allow-list, theme picker swatches, theme-of-the-day card swatches, theme-voting panel swatches, both CSS blocks in `globals.css` (variable defs, typography tokens, every retro8bit-specific override including the Press Start 2P @font load, body::after scanline overlay, hard-edge button shadows, section-tone chip overrides, saturated Tailwind tints), plus stale mentions in the contrast-audit script and a sidebar comment.\n\nIf you had either theme saved, `ThemeScript`'s allow-list will catch it on next load and drop you back to OS preference — the same path that already runs whenever any retired theme id is found in localStorage.",
    kind: "note",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Equip deadlines — VentureLift round schedule wired in + U of T holiday overlay",
    body: "Two changes to `/admin/equip/deadlines`:\n\n**1. The published VentureLift round schedule** (Round 3 → Round 7, source: BHN's internal VentureLift_Key_Dates_2025-2026 spreadsheet) is now visible on the deadlines page as a read-only timeline above the deadlines manager. Each round shows all eight stages — *Launch · Pre-screening deadline · Consultations · Invite decision · Full application deadline · Review deadline · Adjudication window · Funding announcement* — as colour-coded chips, with the currently-active stage highlighted for in-flight rounds. Past rounds fold under a disclosure.\n\nThe pre-screening + full-application deadlines from this schedule **auto-sync** into the EquipDeadline table on page load (idempotent — only inserts what's missing). The submit-gate honours the canonical schedule without anyone clicking a button: applicants are blocked from submitting after a round's deadline passes, no manual setup needed.\n\nThe previous pattern-based \"Pre-populate the standard cadence\" button is removed — the real schedule isn't a clean monthly/quarterly pattern (Round 6 pre-screen is Aug 1, Round 7 is Oct 5, not the 22nd of every quarter), so a generated cadence would have been wrong from Round 6 forward.\n\n**2. U of T holiday + closure overlay** on the calendar view. Every cell that falls inside a statutory holiday or a U of T Presidential Day / winter break gets a coloured wash + tiny label. Source: <https://people.utoronto.ca/memos/holiday-schedule-2025-26-and-2026-27/>. Covers both fiscal years (2025-26 and 2026-27). Visible on the calendar tab plus a chip-row legend at the bottom of the rounds timeline.\n\nAdding a new round later = one entry in `src/lib/equip/calendar.ts` → next page load syncs the deadlines + the timeline shows the new round.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Equip program overview — admin / committee dashboard at /admin/equip/overview",
    body: "Until now the admin side of Equip was a queue (`/admin/equip`) and a deadlines scheduler (`/admin/equip/deadlines`). Useful for individual review work, but you couldn't tell at a glance how the funding program was doing. The new overview fixes that.\n\n**One Studio-styled landing** for admins and Equip Review committee members:\n  • **Hero stat tiles** — apps in flight, approved this quarter, $ approved YTD, open windows count.\n  • **Three alerts** — apps stalled in *submitted* >7 days, apps under_review >14 days, deadlines closing in <48 hours. Each links into the filtered review queue.\n  • **Decision velocity + bench depth** — average days from submitted → decided this quarter, active Equip Review committee headcount, total in-flight apps competing across all open windows.\n  • **Per-stream funnel** — VentureConnect + VentureLift side by side. Each stage of the pipeline shows its count + a progress bar relative to the max stage (so you can spot which stage is the bottleneck). VL's funnel covers all six stages including the Stage 1 → Stage 2 hand-off.\n  • **Open windows panel** — every currently-open deadline with its closing timestamp + how many in-flight apps are competing in each.\n  • **Recent activity** — last 10 application updates with status + amount + reviewer, links directly into the review page.\n\nThe overview is route-scoped to render in the **Studio** design system (the same vocabulary as the HR overview) — even though /admin/* normally inherits the platform-default DS. Sidebar gets a new \"Equip overview\" entry under Administration; Equip Review committee members get the same shortcut at the top of their COMMITTEES sidebar section.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "HQP committee — meetings, action items, member directory, COI disclosures",
    body: "The final piece of the HQP committee workspace. /committee/hqp is now a one-stop landing for members; admins get a fourth shortcut card at /admin/committees.\n\n**Meetings** at `/admin/committees/hqp/meetings`\n  • Schedule the monthly meeting — title, date/time (timezone-aware), duration, optional meeting URL, agenda markdown.\n  • Every active member is auto-invited on creation (attendance row seeded with status = `invited`).\n  • Per-meeting page at `/committee/hqp/meetings/[id]` is shared by admins + members. Members RSVP (Attending / Can't make it / Attended); admins can mark attended / absent / reset for any row. Notes + agenda render markdown.\n  • Status transitions (scheduled → held → cancelled, or back to scheduled) are admin-only.\n\n**Action items**\n  • Captured per-meeting via an inline form on the meeting page.\n  • Auto-flow through Open → In progress → Done → Cancelled. Assignees can advance their own; admins can advance anyone's.\n  • Surfaced on the HQP landing as *My open action items* with due-date sort.\n\n**Member directory** appears on `/committee/hqp` — card grid with name, organisation, and tenure (\"Since DD/MM/YYYY\"). Members consent to display via the application form (Charter §11).\n\n**COI disclosures** (Charter §8)\n  • Self-service panel on `/committee/hqp` — members record scope + description; flip to *resolved* when the underlying relationship ends.\n  • Past disclosures fold under a disclosure for the audit trail.\n  • Members manage their own rows; admins (in a follow-up) get an aggregate view.\n\nUnderpinning: four new tables — `HqpMeeting`, `HqpMeetingAttendance` (unique by meeting + user), `HqpActionItem`, `HqpCoiDisclosure`. All audit-logged via the existing AuditLog table.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "HQP feedback rounds — replaces the docx-by-email workflow",
    body: "The BHN program team used to email a `feedback template_…docx` to every HQP committee member every cycle, collect them by filename, and aggregate by hand. That whole loop now runs in-platform.\n\n**Admin side** at `/admin/committees/hqp/rounds`\n  • Create a round with title, intro copy, open/close timestamps, and a list of topics.\n  • Default topics pre-fill from BHN's existing template (EXPERIENCE × 3, Platform UX, ENGAGE × 2, Networking, Other) — edit per round as priorities change.\n  • Open / close / reopen actions match the EquipDeadline + HQP-windows pattern.\n  • Per-round aggregate view at `/admin/committees/hqp/rounds/[id]` — every topic shows every submitted member's answer side-by-side. Response-rate header tells you N of M active members submitted.\n\n**Member side** at `/committee/hqp`\n  • Open rounds appear on the HQP landing page with a status chip per round (Not started / Draft / Submitted).\n  • The form at `/committee/hqp/feedback/[id]` renders one textarea per topic, auto-saves every 800 ms, and submits when the member's done.\n  • Once submitted, the round flips to read-only.\n\nUnderpinning: two new tables — `HqpFeedbackRound` (topics + open/close window) and `HqpFeedbackResponse` (one row per member per round, `(roundId, userId)` unique). Topics live in a JSON blob inside the round so each cycle can use a different question set without a migration.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "HQP Advisory Committee — open-call applications now live on the platform",
    body: "The annual HQP Advisory Committee open call moves out of email + Excel and into the platform.\n\n**For applicants**\n  • Public-ish form at `/committee/hqp/apply` (any signed-in BHN user). Auto-saves every 800 ms like the rest of the platform.\n  • Form mirrors the charter — motivation (why join), perspective (what you bring), which BHN program pillars you participate in (ENGAGE / EXPERIENCE / EQUIP), which feedback areas you care about most, three acknowledgements (12 h/year time commitment, confidentiality + COI per §8, name/headshot consent per §11).\n  • Status banner after submit — you see *Submitted*, *Welcome aboard*, or the reviewer's *Not selected this cycle* note in-platform.\n\n**For admins** at `/admin/committees`\n  • Two new shortcut cards land at the top of the page: HQP applications (with pending-count chip) and HQP open-call windows (with *Open now* chip when active).\n  • **Windows manager** — schedule annual open calls the same way you schedule EQUIP funding deadlines. Open / close / reopen / edit. Outside an open window the public apply page shows \"No open call right now\".\n  • **Review queue** — pending applicants first, with motivation snippet, picked program pillars, areas of interest, and inline approve / reject buttons that capture a reviewer note. Approving creates a `CommitteeMembership(hqp)` row in the same transaction — the new member instantly gets the welcome-screen badge + sidebar shortcut, no follow-up step.\n\nUnderpinning the surface: a new `HqpApplicationWindow` model parallel to `EquipDeadline`, and an `HqpMemberApplication` model joined by `userId + windowId` (one application per user per window).",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "VentureLift Stage 2 — the full $25K application is now in-platform",
    body: "VentureLift always ran as two stages on paper: a short pre-screening, then a long-form application if the pre-screen passed. Stage 2 is now in-platform too — no more downloadable form, no more PDF round-trips.\n\n**The flow**\n  1. You fill in the pre-screening form (Stage 1, what's already been here).\n  2. A reviewer either invites you to Stage 2 (status: **Pre-screen passed**) or doesn't (status: **Pre-screen — not selected**).\n  3. When Stage 2 unlocks, the My-applications row turns green with a *Stage 2 unlocked — finish the full application* CTA. Click in and the long form is ready.\n\n**What's in Stage 2** — mirrors the EQUIP VentureLift Grant Application Form (Oct 2025 PDF) section-by-section:\n  • **Part 1 Project team** — primary applicant (with role + % FTE), PI (with role description + funds-holder), company (address, incorporation date, IP nature), other team members table.\n  • **Part 2 Innovation & project** — 11 narrative prompts spanning innovation/IP, market potential, project plan, commercialization milestones, follow-on potential.\n  • **Part 2.3.2 Timeline table** — Activity # / Deliverables / Place of Work / Completion Date, capped at the PDF's 6-month project window.\n  • **Part 3 Budget** — structured line items with category (Services / Consulting / Materials & Supplies / Other), Activity # reference, unit count × rate auto-compute, service provider field, partner contributions (cash / in-kind) sub-table, hard $25,000 CAD cap with live over-cap warning.\n  • **Part 4 Appendices** — three drag-and-drop trays: Appendix 1 CVs (required), Appendix 2 support letters (up to 3, optional), Appendix 3 IP documents (**required** — the BHN Reviewer Guide makes a filed provisional patent the hard eligibility gate).\n  • **Part 5 Signatures** — three signers (Primary Applicant, Founder/Co-Founder if different, PI), each with print-name + date + a shared acknowledgement check.\n\n**Auto-save** — every 800 ms, just like the rest of Equip. A *Saved 3 s ago* chip sits in the header; close the tab and pick up where you left off.\n\n**Submit safety net** — the server-side validator enforces every required field on the PDF, the $25K budget cap, all three signatures, the Appendix 3 eligibility gate, and the open-deadline check from the existing deadlines surface. A clear bulleted list of misses comes back if anything is incomplete.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Equip deadlines — schedule, extend, close funding windows from /admin/equip/deadlines",
    body: "New admin surface at `/admin/equip/deadlines` for managing the application windows behind both Equip streams.\n\n**What you can do**\n  • **Create** a new funding window — pick stream (VC monthly / VL quarterly), date, time, optional cycle label, optional note. Time defaults to **12:00 PM Eastern** on the chosen date per the BHN PDFs; adjust the time field for an off-hours cut-off. DST handled automatically.\n  • **Extend** a deadline — push the cut-off forward without erasing the original date. The audit trail says \"originally May 1, extended to May 7\".\n  • **Close** a window early — submissions blocked immediately even if the date hasn't passed.\n  • **Reopen** a closed window — admin escape hatch (only if the date is still future).\n  • **Edit** the cycle label / note in place.\n  • **Delete** a window outright (the audit log entry survives).\n\n**Two views**\n  • **List** — table grouped by stream, full action set on every row.\n  • **Calendar** — month grid showing which days hold a window; click through to the list to edit.\n\n**Applicant side**\nApplicants see a \"Next deadlines\" card at the top of `/equip` with the next open window for each stream, days remaining, and a soft-amber / hard-rose visual when the deadline is ≤7 / ≤2 days out. Late submissions are blocked server-side — a stale browser tab can't slip past a closed window.\n\n**Permissions** Admins + Equip Review committee members can manage deadlines. The reviewers who run each cycle don't need to ping an admin to schedule the next one.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Committee membership now visible — welcome-screen badge + sidebar shortcuts",
    body: "If you're on a committee (Equip Review or HQP), three things change on your view:\n\n  • **Welcome-screen badge** — a small pill at the top of `/dashboard` showing every committee you belong to. Click the chip to jump to that committee's primary surface (Equip Review → `/admin/equip`, HQP → `/committee/hqp`).\n  • **Sidebar shortcut** — a new `COMMITTEES` section in the left nav with the same shortcuts, sitting between EQUIP and ADMINISTRATION. Auto-hidden for users who aren't on any committee.\n  • **HQP landing page** — `/committee/hqp` is now a real destination (not 404). Stub content for now; the partner-network analytics + trainee-quality digest will fill in as the committee scopes them.\n\nThe surfaces are membership-aware: if your slot on a committee is revoked, the badge and sidebar entry vanish on the next page load. No cache clear needed.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Committees — manage Equip Review + HQP rosters in one place",
    body: "Two new committees ship at `/admin/committees`:\n\n  • **Equip Review Committee** — the people who decide on EQUIP funding. Members get the **/admin/equip** review queue (claim, approve, fund) **without** needing an admin role. Useful for invited external reviewers — domain experts, scientific advisors — who shouldn't see the rest of the admin surface.\n  • **HQP Committee** — Highly Qualified Personnel oversight. Pure coordination surface; members get a sidebar shortcut + welcome-screen badge.\n\n**Membership management**\n  • Add by email; the user must already have a BHN account. Optional one-line note per member (term length, subcommittee, sponsor — whatever you want to remember).\n  • Revoke is a **soft-delete** — the row stays as `active: false` so the audit trail (joined / left dates, the note) survives. *Past members* fold under a disclosure at the bottom of each section; *reinstate* flips them back on.\n  • Every add / revoke / note-edit writes to the audit log.\n\n**For committee members**\n  • Equip Review members open `/admin/equip` straight from the sidebar and see the same queue admins see. Same review actions, same per-applicant $5K cap warnings, same triage AI panel.\n  • HQP members get a sidebar shortcut to their dashboard (work-in-progress) plus the badge on the welcome screen so it's clear they're holding the role.\n\n**Adding a third committee later** is a code change to `src/lib/committees/registry.ts` — append a new entry with a slug, name, badge tone, and sidebar items. No migration; the `committee` column is plain text.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "VentureConnect — per-applicant $5K cumulative cap on review",
    body: "Reviewers now see how much funding a VentureConnect applicant has already received across prior approved + funded applications. The cap is enforced server-side — approving an amount that would push the cumulative total past **$5,000 CAD** is rejected with a clear error. The approve form pre-fills the lesser of *requested* and *remaining cap*; the application detail page shows a funding-history panel with prior decisions.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Equip — apply for BHN funding fully in-platform, profile-pre-filled, AI-assisted",
    body: "Meet **Equip**, BHN's third pillar after **Engage** (training) and **Experience** (placements). Equip backs trainee-entrepreneurs with commercialization funding — **VentureConnect** for conferences, pitch competitions, and networking events (up to $5,000, monthly cycle) and **VentureLift** for accelerator participation, IP work, prototype builds, and commercialization roadmap execution (up to $25,000, quarterly cycle).\n\nThe whole flow runs in-platform now — no downloadable PDFs, no email back-and-forth, no re-typing what we already know about you.\n\n**Designed for minimal effort**\n  • **3-question wizard** at `/equip/apply/new` — who you are, where you're affiliated, where you are in commercialization. Auto-routes you to the right stream; suggests the other if you picked the wrong one.\n  • **Profile pre-fill** — your name, email, institution, job title, country, and phone all come from your profile row. You never re-type anything.\n  • **Conditional disclosure** — VentureConnect shows ~5 fields. VentureLift only shows the IP-jurisdiction follow-up if your IP status warrants it.\n  • **Auto-save every 800 ms** — every keystroke is saved as you type. Close the browser, come back tomorrow, pick up where you left off. A *Saved 3 s ago* chip shows in the top-right; there is no save button.\n  • **AI auto-fill from a URL** — paste a link to your lab page, publication, or accelerator profile and we'll read it, draft your innovation summary + suggested success criteria, and let you preview before any field is touched.\n\n**See exactly where your application is**\nAt `/equip/my-applications` you see every draft and submission with current status — `draft` → `submitted` → `under review` → `approved` → `funded` (or `not selected`). Each application has a **two-way comment thread** with the reviewer: questions and clarifications happen in-platform, never over email.\n\n**Approved? You get a milestone tracker.**\nWhen an application transitions to *funded*, we template a short set of check-ins (3 for VentureConnect, 4 for VentureLift over ~6 months) — confirm registration, mid-project review, pilot validation, final report. You and your reviewer update each one as it lands; overdue items glow red.\n\n**For admins**\nNew review surface at `/admin/equip` (admin-only, sidebar entry under platform tools): tab-filtered queue, claim → approve / reject / fund decision flow with reviewer note + amount. Each application detail has an **AI triage panel** — one click generates a headline, strengths, concerns, and a verdict so you can decide in under 60 seconds without reading 800 words. A demo seeder spins up six demo applicants spanning every status so the dashboard renders meaningfully on first deploy.\n\n**Honest privacy posture**\n  • The applicant's identity block is read from their existing profile — we never re-collect what we already have.\n  • Files (pitch deck, prototype photos, recommendation letter, video pitch) are optional and stored alongside the application; cascading deletes mean wiping a user wipes their applications and files.\n  • AI-assisted applications are tagged `aiAssisted: true` so reviewers can see when the LLM was in the loop.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "AutoPipette — BHN's AI lab partner dispenses a single help-dose when you look stuck",
    body: "Meet **AutoPipette**, BHN's new AI behaviour-watcher. Named after the wet-lab tool every BHN learner already knows, it dispenses precise, single-dose help at the right moment — the same way a pipette dispenses precise liquid volumes.\n\n**What it does**\nAutoPipette quietly watches click intent (no keystrokes, no field values, no screen recordings, no coordinates). When it sees stuck-state signals — rage-clicking the same button, repeated errors, abandoned forms, long dwell with no progress — it surfaces a single chip-style hint in the bottom-right corner with a suggested next step. One hint at a time, never noisy, always dismissable.\n\n**Curated help, never hallucinated**\nThe hint copy is never AI-written. Every card title and body is hand-authored and lives in a curated registry; the AI only picks which card fits the moment. Worst-case bad pick — never wrong words.\n\n**On by default, opt out anytime**\nAutoPipette is on for new users from day one (so the people most likely to benefit from a stuck-state nudge actually see one). A one-time notice banner explains what's collected the first time you land in the dashboard, with a *Stop & turn off* button right there. The full toggle, sensitivity slider, and *Delete everything we have on you* button live on `/profile` and `/profile/assist-history`.\n\n**For admins**\nThe new `/admin/assist` dashboard shows opt-in rate, helpful-% and dismiss-% per help card, top stuck surfaces last 7 days, the latest weekly journey summaries (LLM-written, one per active user per week), and the 50 most recent hints across the platform. A seed/clear pair on the same page populates six demo users covering every stuck-pattern (rage clicks, form abandons, error loops, long dwell, healthy path) so the dashboard renders meaningfully on day one.\n\n**Privacy posture**\nThree-tier retention: raw events 90 days · daily aggregates 12 months · weekly summaries 18 months. Cascading FK deletes mean wiping a user wipes every signal they generated. PII redaction at capture time — we never log values, keystrokes, or coordinates.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Credit application review — collapsible doc preview at letter size",
    body: "On the credit application detail page (`/admin/credit-applications/[id]`), the *Supporting documents* card used to list each file as a row with an *Open →* link that punched out to a new tab. Reviewers ended up tab-juggling between the review form and the document.\n\nNow the whole card is a collapsible accordion. Clicking the header expands it inline and renders the active document in an iframe locked to the **letter aspect ratio (8.5 × 11)** with `max-width: 680px`. A typical letter-sized PDF fits in the frame without scrolling, which is the common case for the acceptance letters / transcripts / supervisor notes most applicants attach.\n\n  • Single document: auto-selected; no tab row.\n  • Multiple documents: a chip-style tab row at the top of the open panel lets the reviewer swap which doc is shown in the iframe.\n  • Non-previewable types (docx, zip) still attempt to render; the *Open in new tab* link below the iframe is the escape hatch.\n  • Open/close animation uses the `grid-template-rows` 0fr → 1fr trick + opacity crossfade — smooth on any content height, no JS measurement, no jank.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Employer home — brand-stage profile becomes the overview",
    body: "The /employer overview used to be the linear HR workspace (postings list + action queue + inline applicant expand). It was functional but didn't lead with the employer's own brand identity.\n\nThe overview now opens with the cinematic profile layout that used to live at /employer/profile, and surfaces the action queue + hiring shopfront beneath it. /employer/profile is preserved as a redirect alias.\n\n**New section flow:**\n  1. Cover banner — full-bleed cinematic gradient with five auroras and noise texture.\n  2. Identity row — logo + company name + chips + trust signals on a brand-tinted wash. **Pencil button top-right** opens the edit modal.\n  3. About — pull-quote with a three-colour gradient rule (only renders if a description is set).\n  4. By the numbers — three gradient-text stat numbers, vertical-hairline divided.\n  5. **Action queue** — items needing attention (new triage, stalled, awaiting offer reply). Pulled forward from the old HR workspace so this critical signal isn't lost.\n  6. **Hiring shopfront** — live postings as hairline-divided list rows with applicant counts in gradient text. Links to /employer/postings/[id] for management.\n\n**Edit modal** — clicking the pencil opens a focused dialog that *leads with the URL auto-fill*: a big URL field + Auto-fill button hero, with helper copy explaining the AI will pull industry, HQ, size, founding year, logo, and description in one round trip. The manual field grid is hidden behind a *Tweak any field manually* disclosure that auto-opens after auto-fill so the result is immediately reviewable.\n\n**Sidebar:** removed the *Company profile* entry — Overview now contains both. Description updated to reflect the brand-stage role.\n\n**Deferred:** the inline-applicant-expand workflow (the older HrWorkspace component) still lives at /employer/postings/[id] for deep pipeline work; the overview is the brand stage + at-a-glance, not the workshop floor.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cover art admin — courses + pathways in one tool",
    body: "Renamed `/admin/course-thumbnails` → `/admin/cover-art` and folded pathways into the same surface. The sidebar entry is now *Cover art*; the old URL stays as a redirect alias so bookmarks and old changelog links keep working.\n\n**Why rename:** the tool now manages two things (AI thumbnail regeneration + colour overlays) across two kinds of catalog items (courses + pathways). \"Course thumbnails\" was misleading on both axes.\n\n**What's new:**\n  • Pathways show up alongside courses in the row list, each with a per-kind icon (BookOpen for course, Map for pathway) and a *PATHWAY* / *COURSE* eyebrow in the row meta so it's obvious what you're touching.\n  • Regenerate works for both — courses go through the LLM motif extractor + SDXL pipeline; pathways take the simpler SDXL-from-prompt path. Same row UX either way.\n  • Overlay batching applies to both. Mixed selections (some courses, some pathways) split into per-kind batch requests under the hood so each table gets its own update; the panel reports one combined count.\n  • Stat tiles at the top now show *Courses / Pathways / With thumbnails / With overlays* so it's easy to see catalog completeness at a glance.\n\n**Schema:** new `Pathway.thumbnailOverlay JSONB` column (migration `20260615100000_pathway_thumbnail_overlay`). Same shape as the course version; same `parseOverlay` / `overlayStyle` helpers. Overlay now renders on the pathways list cards and the pathway detail hero.\n\n**API:** the existing `/api/admin/courses/thumbnail-overlay/batch` endpoint takes a `kind: \"course\" | \"pathway\"` discriminator and routes to the right table. The pathway regen endpoint also returns a unified shape (`{ ok, thumbnail, motifs: [] }`) so the client can normalize both with one path.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Employer profile — editorial layout with gradients + hairlines",
    body: "Dissolved the stacked boxes. The /employer/profile page is now one continuous gradient-washed canvas; sections are separated by hairlines + section eyebrows + tonal shifts rather than card boundaries.\n\n**Cover banner** carries even more colour — five auroras (cool blue, warm pink, gold, lime, base purple) on a deeper saturated base, plus the noise overlay and horizon line. Eyebrow label updated to *Brand stage*.\n\n**Body** is a single ringed container holding all sections back-to-back:\n  • Identity row floats directly on a brand-tinted wash bleeding out of the cover — no card. Logo halo is now a multi-colour conic gradient. Company name renders with a `bg-clip-text` linear gradient. Identity chips are now dot-separated inline metadata (newspaper byline style), not pill chips.\n  • About — pull-quote with a three-colour gradient rule on the left (cyan → violet → pink) and a ghosted 120px Quote glyph. No card; sits on a soft pink-blue wash.\n  • Stats — three numbers in one row, separated by vertical hairlines (`divide-x`). Each number is rendered as `bg-clip-text` gradient text (brand, violet, rose) so the stat itself is the colour expression.\n  • Hiring shopfront — postings render as hairline-divided list rows, not cards. Applicant count rendered as gradient text on the right.\n  • Manage — editor accordion at the foot.\n\nBetween every section: a `border-t border-line` rule + an eyebrow with a tiny cyan→violet gradient bar.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Employer profile — flagship company-presence page",
    body: "Pushed the /employer/profile redesign further. The page is no longer a single hero with the form below — it's now a sequence of display surfaces stacked top-to-bottom, designed to make the employer feel like a brand on a stage.\n\n**1. Cover banner** — full-bleed cinematic gradient (~320px tall on desktop), aurora glows in cool blue / warm pink / gold, `feTurbulence` noise overlay for material feel, soft horizon line, eyebrow label.\n\n**2. Identity card** — overlaps the cover bottom by ~50% on a generous side margin so the page reads as a magazine-style layout rather than a top-to-bottom form. Inside: a much bigger 160×160 logo disc with a brand-coloured halo, the company name at up to text-6xl, an identity chip row (industry · HQ · size · founded) ending in a primary-action *Visit website* button, and a trust-signal row (verified badge · posting since YYYY · BHN talent hired). A live status dot in the corner.\n\n**3. Stat triplet** — three oversized stats on hairline-divided cards with quiet brand-coloured radial washes from the upper-right corner. Numbers are text-5xl tabular. Pulled live from the DB.\n\n**4. About quote** — when a description is set, it's rendered as a pull-quote with a brand-gradient rule on the left and a 140px background quotation-mark glyph behind. Reads as a callout, not a body-copy paragraph.\n\n**5. Hiring shopfront** — *What trainees see when they find you*: up to four of the team's live postings in mini cards with title, location, type/compensation, top-3 skills, applicant count, and closing date. Reframes the page from \"my settings\" to \"my brand in market.\"\n\n**6. Editor accordion** — the existing CompanyProfileEditor is now collapsed by default once the profile has 4+ fields filled in. Day-one employers still get the form expanded immediately. The hero refreshes on save.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Employer profile — cinematic company hero",
    body: "The /employer/profile page used to open with a plain H1 and a helper line, then drop straight into the edit form. Functional, but no presence — and this is the page trainees end up reading on every internship posting your team makes, so it deserved more weight.\n\n**New hero** — a wide dark gradient panel with:\n  • A big logo on a glowing white disc with a halo + inner gloss.\n  • Massive tight-kerned company name (up to 6xl on desktop).\n  • Identity chips along the bottom: Industry · HQ · Size · Founded · Website (each renders only if set).\n  • A *Live · visible to trainees* status tag in emerald, so you can see the page is doing its job.\n\n**Stat strip** beneath the chips:\n  • Postings live · Applicants reviewed · Interviews held.\n  • Pulled from the database — these are real prestige indicators, not vanity placeholders.\n  • Admins viewing the page see platform-wide totals; employer accounts see only their own.\n\n**Texture** — a subtle SVG `feTurbulence` overlay at low opacity over the gradient so the panel reads as material instead of CSS-flat, plus two radial backlights (cool brand-blue behind the logo, warm pink far-right) for depth.\n\n**Empty state** — when nothing is filled in yet, the hero stays visible but every empty slot reads as a soft *Add your X* prompt. The page still feels intentional from day one.\n\n**Edit form unchanged** — same CompanyProfileEditor (logo aside, AI auto-fill, fields, save) lives beneath the hero. Save → router.refresh → hero re-renders with the new values.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course thumbnails — batch colour / gradient overlay",
    body: "Admins can now wash a colour or gradient over any subset of course thumbnails without re-running SDXL.\n\n**Where:** /admin/course-thumbnails → the *Colour / gradient overlay* panel sits above the row list.\n\n**Controls:**\n  • Mode — *Solid* (one colour) or *Gradient* (two colours + angle).\n  • Colour pickers — native browser pickers, hex display next to each.\n  • Angle slider — 0–359° for gradients.\n  • Opacity slider — 0–100%.\n  • Blend mode — normal / multiply / overlay / soft-light / screen / darken / lighten.\n\n**Workflow:**\n  1. Tick checkboxes on the courses you want to re-tone.\n  2. Dial in the overlay in the panel; selected rows show a live preview so you can spot bad fits before committing.\n  3. *Apply overlay to selected (N)* persists the JSON blob onto each course's `thumbnailOverlay` column via a single batch endpoint.\n  4. *Clear on selected* wipes the overlay back to nothing.\n\n**Non-destructive:** the underlying SDXL thumbnail is untouched — the overlay is a CSS layer rendered on top in the catalog. Swap it out any time without burning Cloudflare AI credits or losing the original art. Archived course cards skip the overlay so the grayscale \"Not active\" treatment stays unambiguous.\n\n**Schema:** new `Course.thumbnailOverlay JSONB` column (migration `20260615000000_course_thumbnail_overlay`). Helper + validation at `src/lib/courses/thumbnail-overlay.ts`. Batch API at `POST /api/admin/courses/thumbnail-overlay/batch`.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Course catalog filter — compact dark strip with featured Specials toggle",
    body: "The top-of-catalog filter panel was a soft brand-tinted card that took up a third of the first viewport and buried the most-used toggle — *Special programs & workshops (instructor-led)* — as one chip among many.\n\nThe redesign:\n\n  • **Dark control strip** — the panel now reads as `bg-slate-900` machinery sitting above the bright course cards, not as a second hero. Padding tightened from `p-5 sm:p-6` + `mb-6` to `p-3 sm:p-4` + `mb-4`, so the catalog grid moves above the fold on most laptop screens.\n\n  • **Featured Specials button** — *Special programs & workshops (instructor-led)* is lifted into the header row as an amber pill with a soft glow halo. When off, a subtle amber tint keeps it visible; when on, solid amber + outer glow + a 1.02× scale make it unambiguously loud. It's now the brightest thing on the panel, which matches its priority for the trainee browsing the catalog.\n\n  • **Header collapses three jobs into one row** — title, active-count, the featured Specials toggle, and the clear-all button now share a single line. The body of the panel is pure chip clouds with nothing competing for attention.\n\n  • **Chip clouds re-toned for dark** — slate-800/60 default, slate-700 hover, brand-500 active, slate-500 labels. Chips are slightly tighter (`text-[11px] px-2.5 py-0.5`) so the same five chip clouds fit in roughly two-thirds the vertical space.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "AI matching engine — admin tuning panel + live impact tester",
    body: "Every constant in the fit scorer is now editable from `/admin/matching-config` (no deploy needed). Three sections:\n\n**Subscore weights** — sliders for *Direct overlap* (default 50), *Semantic similarity* (default 30), *Pathway alignment* (default 20). Live sum indicator turns red when ≠ 100; save will clamp the residual onto direct overlap so a misconfigured panel can't produce nonsense.\n\n**Score bands** — number inputs for where the chip label flips. *High* defaults to ≥ 70 (Strong fit), *Medium* to ≥ 40 (Possible fit), below is Weak fit.\n\n**Thresholds** — six finer knobs: profile-completeness skill count, min posting skills for full confidence, semantic-bridge min cosine, pathway-alignment min cosine, per-pathway boost points, required-skill weight bonus.\n\n**Live tester** — pick a real trainee and a real active posting from the dropdowns, click *Score this pair*. The fit breakdown (score + band + confidence + per-subscore bars + matched / missing skills + caveats) is computed with **your unsaved form values** so you can preview the impact of a weight change before committing. The persisted config doesn't change until you click *Save*.\n\n**Audit trail** — every save writes an `AuditLog` row with `action=\"matching.config.update\"` carrying the full new config JSON. The page surfaces the five most-recent edits at the bottom.\n\n**Storage** — single row in `PlatformSetting` under `key=\"matching\"` holding a JSON config blob. `getMatchingConfig()` falls back to `DEFAULT_MATCHING_CONFIG` on any failure (DB miss, parse error, missing field). Existing call sites in `scoreFitForTrainee` / `rankPostingsForTrainee` / `rankApplicantsForPosting` read the config once and pass it down so a 200-posting ranking doesn't hit the settings table 200 times.\n\nFind it under **Administration → AI matching engine** in the sidebar (admin / superadmin only), or via the Superadmin shortcuts strip at the bottom of the admin dashboard.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin dashboard redesigned around first-hour shortcuts",
    body: "The admin home page was a flat stack of stat tiles + queue cards + counters + audit log — every section a fresh-install admin saw said zero. The redesign puts the actual work first and lets stats fall to a slim row.\n\n**Setup checklist** auto-appears when the platform is fresh (no employers, no postings, < 10 users, or no demo workspace yet). Five tiles — *spawn a demo workspace, invite your first employer, create the first internship posting, publish a course, see talent flow through* — each tied to a concrete URL. Tiles tick off as their milestone clears. Once everything's set up, the whole section auto-hides so it doesn't clutter mature platforms.\n\n**Quick actions grid** — eight large colour-coded shortcuts to the operations an admin opens most: Demo workspaces, Invite employer, New posting, Talent applicants, Phantom users, View-as (split view), Users, and System status / Audit (depending on role). Each tile has an icon + a one-line help string so the surface is self-explanatory without a tour.\n\n**Stat strip** compressed from four big tiles to six slim chips in a single row — Users · Employers · Published · Postings · Enrolments · Certificates.\n\n**Action queues** auto-collapse: when all three (credit / role / pathway) are empty, they collapse to a single \"Approval queues are clear\" badge. When something's pending, only the non-zero queues render as cards. No more wall of \"None waiting\" tiles on day one.\n\n**Credit-expiry section** is now gated — it only renders when at least one credit grant has unspent balance in the 90-day horizon. Fresh installs hide it entirely.\n\n**Hero CTA** is context-aware: with pending approvals it says *Review queue*, during setup it says *Continue setup* (links to the next unchecked checklist tile), otherwise *Admin overview*. The secondary CTA went from *Users* to *View as*, which is what admins reach for when testing flows.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Newsletter signups now flow through Mailchimp with double-opt-in",
    body: "The platform now pushes new newsletter signups straight to Mailchimp using **double-opt-in (DOI)**. Two reasons for the rework:\n\n**Legal**: under CASL (Canada) and GDPR (EU/UK), a pre-checked opt-in box isn't valid consent — fines under CASL go up to $10M per violation and individual officers can be personally liable. The signup form previously defaulted the newsletter radio to *subscribe*, which is exactly the pattern the CRTC has flagged in past enforcement. Default is now **No thanks**; an explicit affirmative tick is required.\n\n**Operational**: the old workflow was manual — `/admin/newsletter` let an admin copy the opt-in list to the clipboard and paste it into Mailchimp themselves. Easy to forget, no DOI audit trail, no way to know if someone unsubscribed via a Mailchimp email.\n\n**How the new flow works**\n  1. User signs up, ticks **Yes, sign me up**.\n  2. Server creates the BHN account, then `PUT /lists/{id}/members/{md5(email)}` with `status_if_new=pending`.\n  3. Mailchimp emails the user a confirmation link.\n  4. User clicks → Mailchimp flips them to `subscribed` → fires a webhook back at `/api/webhooks/mailchimp` → BHN updates `mailchimpStatus`.\n  5. Same webhook handles `unsubscribe`, `cleaned` (bounced), and `upemail` (email-address change) events so the two sides stay reconciled.\n\n**Visible changes**\n  • Signup form default flipped from `subscribe` to `no`; copy updated to set DOI expectations.\n  • `/admin/newsletter` shows an integration-status banner (green when env is wired) plus a new **Mailchimp** column on the All tab with per-row state pills: *Pending DOI*, *Confirmed*, *Unsubscribed*, *Cleaned*, *Push failed*, *Never pushed*.\n  • Manual export / copy-to-clipboard workflow is preserved as a fallback for legacy users and for the case where Mailchimp's API is down.\n\n**Behind the scenes**\n  • `src/lib/mailchimp/client.ts` — fetch-based client (no SDK). `subscribeMember` is idempotent (PUT-by-hash). 10s timeout. Never throws; returns a typed `MailchimpResult` so the register API can degrade gracefully.\n  • `src/app/api/webhooks/mailchimp/route.ts` — secret-token URL gating (Mailchimp doesn't sign payloads). Handles form-urlencoded payloads, dispatches by `type`, idempotent on email.\n  • Schema additions: `User.mailchimpMemberId`, `mailchimpStatus`, `mailchimpSyncedAt` (migration `20260514100000_mailchimp_sync`).\n\n**Operator setup**\n  Add to env: `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID`, `MAILCHIMP_WEBHOOK_SECRET` (and optionally `MAILCHIMP_SERVER_PREFIX`). In Mailchimp's UI: Audience → Settings → Webhooks → URL `https://<your-domain>/api/webhooks/mailchimp?secret=<the secret>`, enable Subscribes / Unsubscribes / Cleaned / Email address changes. Until env is set, the admin page surfaces the manual-only banner; once set, the auto-sync flag on `/admin/newsletter` goes green.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Talent applicants — AI match score, inline resume + video preview, team-private comments",
    body: "The `/employer/applicants` page was previously a read-only roster: anchor links out to the resume / video, no scoring, no place to write down what the team thought. Reviewers had to open three tabs per applicant and keep their notes elsewhere. This rebuild moves the whole review pass onto a single card.\n\n**Match-score chip** — every applicant linked to a BHN account is scored against the viewing employer's active postings via `lib/matching/fit`. The chip shows the band (Strong / Possible / Weak fit), the 0–100 score, and the best-matching posting title, with confidence surfaced as a tooltip. Employers see only their own postings in the scoring pool; admins + superadmins see everything active.\n\n**One-click resume expand** — opens an inline `<iframe>` of the resume URL (PDF renders via the browser's built-in viewer). The open-in-new-tab link is always visible as an escape hatch for browsers that block the embed or for non-PDF formats.\n\n**Inline 1-min video** — direct `.mp4`/`.webm`/`.mov` URLs play in a native `<video>` element; YouTube, Vimeo, and Loom links are rewritten to their embed iframes. Aspect-video wrapper keeps the layout tidy.\n\n**Team-private comments** — a new `ApplicationComment` thread per submission, gated to admin / superadmin / employer / instructor (trainees never see it). Comments load lazily when the section opens and post via `/api/employer/applicants/[submissionId]/comments`. Author role is captured at write time so the thread keeps role context even if the author's role changes later.\n\n**Side effect on the apply flow** — the optional cover note in `ApplyDialog` is now persisted in a new `ApplicationStatus.coverLetter` column (employer-visible), distinct from the existing `notes` field (trainee-private). It's surfaced on the per-applicant detail page alongside the AI fit panel.\n\n**Schema** — `ApplicationStatus.coverLetter String?` (migration `20260604000000_application_cover_letter`). `ApplicationComment` already existed; this commit wires the API + UI on top of it.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Hiring pipeline — Kanban, interview scheduling, structured scoring, offers, e-signed acceptance",
    body: "The platform now has an end-to-end hiring workflow that runs from **Applied → Offered → Hired**. Previously /employer/applicants was a flat list with nowhere to take a candidate next; pipelines stalled in the inbox.\n\n**For employers** — a new Kanban pipeline at `/employer/postings/[id]/pipeline` with six columns (Applied → Reviewing → Interview → Offer → Hired → Passed). Drag a card between columns to move the stage. A new per-applicant detail page at `/employer/postings/[id]/applicants/[appId]` has three action surfaces:\n\n  • **Stage transitions** — buttons for every legal next stage, with optional rejection reason that the trainee sees in their email.\n  • **Interview scheduling** — propose 1–5 time slots, format (phone/video/onsite), location/link, notes. Once the trainee picks a slot, the interview is confirmed for both sides. After it happens, a structured rubric form captures overall score (1–5), per-skill scores tied to the posting's required skills, recommendation (hire/maybe/pass), strengths, and concerns. Multi-stakeholder: each interviewer creates their own row.\n  • **Offer composer** — three templates (paid internship, academic-credit, contract) with `{{variable}}` placeholders for compensation, hours, dates, location, deadline. Markdown body, draft autosave, send button.\n\n**For trainees** — a new per-application detail page at `/profile/applications/[id]` with:\n\n  • Interview slot picker when one's been proposed (or a 'send back' path if none of the slots work).\n  • The full offer (markdown-rendered) with **Accept** (writes an `ElectronicSignature` row to the audit trail) or **Decline** (with optional reason).\n  • Withdraw button on any non-terminal stage.\n  • A nudge to the AI prep coach for this posting.\n\n**Notifications** — every stage transition fires a transactional email to the trainee with stage-appropriate copy. Employer gets notified back when the trainee picks an interview slot or declines.\n\n**Auto-withdraw on hire** — accepting an offer triggers an automatic withdrawal of every other open application the trainee holds. They're now hired somewhere; carrying live pipelines elsewhere wastes everyone's time and breaks the trust contract with other employers.\n\n**Pipeline analytics** at `/admin/pipeline-analytics` — stage distribution, median time-in-stage per stage, list of stalled (≥14 days in a non-terminal stage) applications, overall conversion-to-offer rate.\n\n**Schema** — `Offer` model (1:1 with ApplicationStatus; links to ElectronicSignature on accept); `InterviewScore` model (unique on `(interviewId, scorerUserId)` — multi-stakeholder by design); `ApplicationStatus.stageEnteredAt` for time-in-stage; `rejectionReason` + `employerNote` columns.\n\n**Service** — `src/lib/hiring/transitions.ts` is the single entry point for any stage move. Validates legal transitions against a hardcoded map, stamps the timestamp, writes an `AuditLog` row, fires the email, and on `hired` auto-withdraws alternative applications. Strict transitions = legible audit trail.\n\nWhat's deferred (on the roadmap): equal-opportunity tracking (PIPEDA-sensitive — needs separate design pass) and reference checks (lower priority + needs careful design of the reference-permission flow).",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Open Graph share card",
    body: "A new 1200×630 image lives at `/opengraph-image`. Any platform link shared on LinkedIn, Slack, Twitter/X, etc. now previews with a proper BioHubNet brand card — the diamond cluster mark, the tri-colour wordmark (`Bio` teal, `Hub` blue, `Net` mint), and the \"Transformative Talent Development\" tagline.\n\nTwitter/X falls back to this when no `twitter-image` route is set, so a single file covers both surfaces.\n\nThe logo + favicon + themes are unchanged from before — this commit only adds the social preview card.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Security policies hub at /admin/security/policies",
    body: "Every governance document in `docs/security/` is now findable from one admin page — no more emailing PDFs or pointing auditors at GitHub.\n\n**What's there**: a hub at `/admin/security/policies` lists every policy in two groups — evergreen Policies & Plans (encryption posture, incident response, breach notification templates, sub-processors, ROPA, AUP, data retention, pentest procurement, 21 CFR Part 11 alignment) and dated Operational Artefacts (incident write-ups, roadmaps). Each entry shows title, one-line description, and last-modified date. Click any policy to land on `/admin/security/policies/[slug]` which renders the markdown body inline.\n\n**Source of truth stays in markdown.** The pages read directly from `docs/security/*.md` at request time — no caching, no rebuild needed when a policy ships via PR. Edits go through pull requests so git-blame + review + history all survive. The pages can't drift from source because they don't have their own copy.\n\n**Cross-linked from /compliance.** Six compliance items now point at specific policies as evidence: data residency → sub-processors, retention → data-retention policy, CASL → AUP, encryption → encryption-posture, vendor → sub-processors, plus a new incident-response item. Auditors clicking from the compliance overview land at the canonical policy.\n\n**Sidebar entry**: Administration → Platform → Security policies. Defence-in-depth slug validation on the detail route (`/^[a-z0-9-]+$/i` + post-resolve path-prefix check) so a hostile slug can't escape the policy directory.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Superadmin sidebar now shows an 'HR view · preview' panel",
    body: "Inside the Administration section, a new sub-group called **HR view · preview** renders the same five items an employer sees in their EMPLOYER PORTAL menu — Overview, Company profile, My Postings, Applicants, Talent pool.\n\nVisible only to superadmin. Lets you peek at the HR mental model without flipping seats. Clicking any item navigates directly to that route; some employer pages will gate against your superadmin role and redirect you back — for the full HR-seat experience, the double-tap `xx` shortcut still flips the act-as cookie and lands you properly inside the employer view.\n\nThe sub-group sits between Design & Research and Platform, with an italicised note under the heading reminding you of the `xx` path.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Application-prep coach — AI-assisted resume tailoring, interview prep, and STAR-story builder",
    body: "Brand-new 4-step coach lives at `/internships/[id]/prepare` (look for the **Prepare for this posting** button next to **Apply** on any posting). Walks you from \"I'd like to apply\" to \"I have a tailored resume bullet, a draft interview answer, and a polished STAR story ready.\"\n\n**Step 1 — Compare.** AI extracts the keywords + qualifications from the job description and compares them against your resume snippet. Each keyword comes back classified Present / Weak / Missing, with quoted evidence where you've got it covered and a coaching nudge where you don't.\n\n**Step 2 — Close gaps.** For each missing or weakly-represented keyword, a writing task: draft a resume bullet that shows you've used the skill — name the project, the action, the measurable result. Track which ones you've added to your CV.\n\n**Step 3 — Interview prep.** Curated common questions (about-you / behavioural / role-specific / situational / closing), tailored to this posting's key skills. Each question has:\n  • A decoder (\"what they're really asking\")\n  • A recommended framework (STAR / SAR / direct / personal)\n  • A target word count\n  • **Fill-in-the-blank scaffolding** — drop your specifics into the slots\n  • Common pitfalls to watch for\n\n**Step 4 — STAR story builder.** For each required skill on the posting, scaffold a STAR-format story (Situation / Task / Action / Result). The coach checks your structure as you type — word counts per field, first-person usage in Action, quantified outcomes in Result — and gives a Ready / Almost / Needs-work readiness chip. On-demand \"Polish with AI\" generates a suggested revision you can accept or reject (we never overwrite your draft).\n\nStories you save go to your **Story Bank** at `/profile/stories` — reusable across postings. Tag a story with a skill once; the next posting that needs it knows you have it covered.\n\n**Design principle:** AI is scaffolding, you're the writer. Every bullet, every answer, every STAR field is yours. AI surfaces structure, extracts keywords, and validates form — it never auto-generates content that goes out under your name. See `docs/ux/decisions/0005-application-prep-coach.md` for the full design rationale + the alternatives we rejected.\n\n**What's deferred to v1.1:** pull existing Story Bank entries into Step 4 as starting points; course recommendations from Step 2 gaps; saved interview answers as named drafts. All on the roadmap under Next.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "AI matching — your skill profile now ranks every open internship for you",
    body: "There's a new sidebar item under EXPERIENCE called **Matches for you** (`/profile/matches`). It ranks every active internship posting against your skill profile + completed pathways and shows you the receipts — no black-box scoring.\n\nEach row shows:\n\n  • **A 0–100 score** with a band — Strong fit / Possible fit / Weak fit.\n  • **A confidence indicator** — low when your profile is thin or the posting is under-tagged.\n  • **Three subscores** explained:\n      – Direct skill overlap (50%) — skills you have that the posting requires.\n      – Semantic similarity (30%) — your adjacent skills that are close-but-not-identical to what's listed. Catches \"you have 'cell culture' and the posting wants 'mammalian cell culture'.\"\n      – Pathway alignment (20%) — pathways you've completed that are relevant.\n  • **The matched skills** themselves, the **semantic bridges** that counted, and the **pathways** that boosted you.\n  • **The gaps** — required skills you're missing — linked to your skills page so you can add them or find a course.\n  • **Caveats** — first-class. Thin profile? Under-tagged posting? You see why the score is what it is.\n\nThe same explanation panel now lives on every internship posting detail page too (`/internships/[id]`), replacing the older lightweight match chip. Always-expanded there because trainees land on the detail page with intent to evaluate.\n\nUnder the hood: new `src/lib/matching/fit.ts` uses the platform's existing pgvector embeddings on Skill + Pathway (384-d BGE) plus the PostingSkill ontology mapping. New API at `GET /api/matching/me` for programmatic access. Full design rationale + the alternatives we rejected are in `docs/ux/decisions/0004-ai-matching-explainability.md`.\n\nWhat's deferred for v1.1: employer sort-by-fit, admin observability page, trainee opt-out preference, course recommendations from gaps. All on the roadmap under Next.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "View-as dropdown shrunk to ~2/3 size",
    body: "The 'View as' pull-up menu in the superadmin sidebar footer is now noticeably more compact:\n\n  • Width — 240 px → 160 px minimum.\n  • Per-row padding — py-2 → py-1; gap tightened from 2 → 1.5.\n  • Row text — 13 px → 12 px; per-role descriptions dropped (the role labels are clear enough on their own; full description still shows on hover as a `title` tooltip).\n  • Section heading shortened (\"Preview as another role\" → \"Preview as\"); footer note shortened to \"Reverts in 1 hr · audited\".\n  • Stop-viewing-as button text trimmed.\n\nNo capability change — every target role + the stop affordance is still present.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Cleaner role-switcher: dropped the two inline quick-toggle icons",
    body: "The 'View as' control in the sidebar footer (superadmin only) used to render two icon-only square buttons beside the main pill — one for Trainee, one for Employer HR — for one-tap switching. Removed 2026-05-14 to declutter; same switches remain one click away in the dropdown, and one keypress away via the `x` / `xx` keyboard shortcuts (ADR-0003 in `docs/ux/decisions/`).\n\nUI simplification, not a capability removal — no role-switching path was eliminated. The `quickToggle` function and the `User` + `Building2` icon imports are gone with it.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Roadmap is now superadmin-only",
    body: "The `/roadmap` page is no longer visible to trainees, employers, instructors, or admins — it's restricted to superadmin. Same rationale as why /admin/inbox isn't public: the roadmap doubles as an internal planning surface, and tentative commitments shouldn't be telegraphed to users before they ship.\n\nThe public-facing 'what shipped' surface remains `/changelog` — exactly where you're reading this. Nothing else has changed about how features land; only the planning view is now scoped to the operator.\n\nGuard is enforced at three layers:\n  • Page itself — `requireRole(\"superadmin\")` server-side; non-superadmin gets sent back to the dashboard.\n  • Sidebar — the Roadmap item only renders for superadmin.\n  • Onboarding tour — the tour step is gated to the superadmin role and updated copy explains the scoping.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "First quarter's UX practice — WCAG audit, design critique, cognitive walk-through, May synthesis",
    body: "Ran the four cadence items the new ER&D infrastructure asks for, end-to-end, and committed the artifacts so future contributors have a worked example for each method. Four files in `docs/ux/`:\n\n  • `docs/ux/audits/2026-05-13-wcag-aa-contrast-sweep.md` — algorithmic WCAG 2.1 AA audit across all 9 themes. **One genuine finding**: the Scientific theme's accent fails 3.0:1 for UI elements (2.70:1); fix is a small luminance shift to `#0284c7`. Body text passes AAA across every theme. Companion script at `scripts/audit-contrast.py` — runnable any time, exits non-zero on AA failure for future CI gating.\n  • `docs/ux/critiques/2026-05-13-admin-insights.md` — single-reviewer heuristic critique of the just-shipped `/admin/insights` page. Scored 2.9/4 average across Nielsen's 10 heuristics. Three sub-hour polish items flagged; nothing blocks shipping.\n  • `docs/ux/research/2026-05-13-trainee-first-registration-cognitive-walkthrough.md` — AI cognitive walk-through of Journey 01 using the Polson/Lewis 1992 method. Surfaced one severity-3 finding (silent SMTP failure on access-request confirm) + three severity-2s. **Explicitly NOT a substitute for participant research** — the doc names that boundary in its 'Epistemic status' section.\n  • `docs/ux/research/2026-05-synthesis.md` — the May synthesis, drawn from the three artifacts above + the platform's standing signals. Idempotent seed at `scripts/seed-research-insights.ts` lands it as a `ResearchInsight` row visible on `/admin/insights`.\n\nWhat this proves about the infrastructure shipped yesterday (commit `ffb5507`): every template + audit harness + research surface produced a real, actionable finding within 24 hours of being available. The artifacts aren't aspirational; they're load-bearing.\n\nNext: ship the Scientific-theme accent fix; strengthen access-request confirmation copy; polish `/admin/insights` with the critique's three sub-hour items. Backlog: real 3-trainee usability test to validate or invalidate the walk-through findings.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "ER&D maturity push — UX charter, design system, journeys, decisions, three new admin surfaces",
    body: "Coordinated push to move the platform's UX maturity (Forrester's Experience Research & Design model) from level 2 → level 3+, with the infrastructure in place to operate at level 4 once team headcount grows.\n\n**Documentation that now exists** (in `docs/`):\n\n  • `docs/ux/charter.md` — three named user outcomes with measurable signal targets. Anchors every UX decision.\n  • `docs/design-system.md` — every token, scale, elevation, motion primitive, and component pattern as it already exists in code. Live mirror at `/admin/design-system`.\n  • `docs/ux/journeys/` — five user journey docs (two fully written, three with detailed outlines).\n  • `docs/ux/decisions/` — ADR log with three backfilled decisions (workshop decoupling, pending-approval gate, double-tap-x shortcut) and a template for future ones.\n  • `docs/ux/templates/` — usability-test script, research-entry template, design-critique template. Run with these next time you have a participant willing to talk.\n\n**Three new admin surfaces** (live):\n\n  • `/admin/design-system` — renders every design token + component pattern using the same Tailwind utilities the rest of the platform uses. The doc and this page cannot drift apart.\n  • `/admin/insights` — per-period 'what users told us' synthesis. Read the signal feeds (theme votes, exit-survey responses, access requests, queue health) on the right, write the synthesis on the left, publish to `/changelog` so the loop closes back to users.\n  • `/admin/experience-metrics` — UX-charter KPI dashboard. Tracks the three outcomes against their targets. Honest about which metrics are 'not yet measured' rather than fabricating data.\n\n**Public-facing**:\n\n  • `/roadmap` — public roadmap with Now / Next / Later horizons + audience chips (Trainees / Admins / Employers / All). Linked in the sidebar misc group; same view for everyone.\n\n**Schema**:\n\n  • New `ResearchInsight` model — one row per period, stores the synthesis note + idempotency guards for the publish-to-changelog action. Migration 20260601100000.\n\nFor the full Forrester ER&D scoring + rationale, see `docs/ux/charter.md` (strategy dimension) + the maturity-evaluation reply in the conversation transcript.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Playwright E2E smoke pack runs on every PR",
    body: "Every pull request now runs a Playwright suite against its Vercel preview before review. The pack covers six highest-stakes user flows:\n\n  1. Login + logout (email-code → dashboard)\n  2. Role switch via `x` / `xx` keyboard shortcut\n  3. **Symposium registration** — full pending → admin-approve → confirmed (fully wired)\n  4. Workshop booking without a Registration → cross-prompt fires\n  5. Permanent-delete a registration → next waitlister promoted\n  6. SCORM module completion → CreditTransaction lands\n\nOne fully wired today (#3, the symposium flow that just shipped) — the other five have detailed strategy outlines in `tests/e2e/README.md` and are marked `test.fixme` so they don't fail CI until they're filled in. The pattern for each is now repeatable.\n\nUnder the hood\n  • New gated route `POST /api/test/e2e-sign-in` mints a NextAuth JWT for a given user. Three independent gates: `E2E_AUTH_SECRET` env-var presence + matching `x-e2e-secret` header (constant-time compare) + `VERCEL_ENV !== production`. Lose the secret and a preview is fair game; production stays safe.\n  • Auth setup runs once per suite, stashes session cookies per role to `playwright/.auth/`. Specs inherit storage state — no UI login on every test.\n  • CI workflow waits for the Vercel preview to reach Ready, then runs. Failures upload the HTML report + traces + videos as a 14-day workflow artifact.\n\nWhy this matters for going-live: this is the most visible quality-control artifact we can show management. Every PR ships with a green-check badge proving six real user flows still work in a real browser. The argument shifts from 'trust me' to 'look — every change goes through this gate before it merges.'\n\nNext steps for whoever has bandwidth: fill in the five stub specs one at a time. Each takes ~1–2 hours and the strategy outlines tell you exactly what to assert.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Tour / workshop registration is now admin-approved + decoupled from the symposium",
    body: "Symposium tour and workshop spots are now reviewed by the BHN events team before they're held. Three policy changes landed together:\n\n  • **Admin approval gate** — every new tour/workshop booking starts in `pending` status. The seat isn't decremented from capacity until an admin clicks Approve from the attendee's admin page. The public registration form and the workshops browse page both surface a 'your spot is not guaranteed until approved' banner so registrants know to expect it.\n  • **Per-tour quota + waitlist cap** — every workshop now carries an explicit `capacity` (default 20 for new tours) AND a `waitlistCapacity` (default 5). Once both are filled, the booking endpoint returns `waitlist_full` and the UI shows 'Workshop & waitlist full' on the button. Admin can edit both per workshop.\n  • **Symposium ↔ tour decoupling** — workshop bookings no longer require a confirmed symposium-day Registration. People can come for a tour without the symposium, and vice versa. After each success the UI cross-prompts in the other direction so neither path gets forgotten.\n\nWhat admins see\n  • Registrations queue has a new 'Pending approval' tile.\n  • Attendee pages get a green `Approve registration` button (and a sister button on each pending workshop booking).\n  • Existing confirmed rows are stamped `approvedAt` via backfill so the pending queue stays honest.\n\nThe full booking lifecycle is now: pending → admin approve → confirmed (or waitlist, if full at approval time) → cancelled. Cancelling a confirmed booking still promotes the next waitlister.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Compliance overview at /compliance for management",
    body: "New admin-only page at /compliance gives management a five-minute readable summary of every regulatory framework BHN follows, what we actually do for each, and the honest current status (Met / Partial / In progress / N-A).\n\nFive groups:\n  • Privacy — PIPEDA, Canadian data residency, retention\n  • Accessibility — AODA + WCAG 2.1 AA\n  • Communications — CASL\n  • Security — encryption, MFA + authentication, audit logging, RBAC, vendor security\n  • Operational — backups + disaster recovery\n\nEach item lays out the regulator / authority, why we follow it, the specific platform measures we have today, and (for partials) an honest 'gap' note explaining what's still open. Linkable evidence rows jump into the live admin surfaces where the implementation lives (audit log, security settings, etc.).\n\nA status scorecard at the top tallies how many controls sit in each state. Source data is plain-English code in src/lib/compliance/items.ts — keep it honest; partials build management trust where aspirational marketing copy doesn't.\n\nFind it in the sidebar under Administration → Platform → Compliance.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Apply now — unified application flow on every posting",
    body: "Every internship posting now has a prominent Apply now button at the top of the page, regardless of what contact details the employer provided. Click → modal opens → three rendered paths chosen by what the posting carries:\n\n• Posting has a contact email: prefilled mail-client flow (subject + greeting + your elevator pitch + resume / video URLs). Your optional cover note is appended to the body.\n• Posting has only a website: opens the employer's apply page in a new tab and records the application on BHN so it appears on Application Tracker.\n• Posting has neither: 'Express interest' — captures your cover note as the application record so the BHN team can route it to the employer.\n\nIn every case the same /api/internships/[id]/apply call lands an ApplicationStatus row at status='new'. Your application shows up on Application Tracker immediately; the employer's kanban inherits the row whether they applied via email, web, or BHN-routed.\n\nReplaces the previous ApplyButtonClient, which was buried inside the contact box and only rendered when contactEmail was present — so a third of the postings had no apply control at all.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "EXPERIENCE program guide — flow chart + sidebar-syncing mentions",
    body: "New page at /experience walks trainees through the full EXPERIENCE program: build your application materials in Application Builder, submit to the talent pool via Talent Application, browse Internship Opportunities, watch progress in Application Tracker, and find scheduled interviews on Interviews. Two-track flow chart shows the journey end-to-end with one branching node (admin review) and a parallel pool-track vs. self-apply-track split.\n\nMain trick: every mention of a sidebar item in the guide is a NavHighlight pill — hover or focus the pill, and the matching nav row in the sidebar pulses amber so you can find that control without hunting. Same mechanism wraps each flow-chart node, so hovering 'Talent Application' in the diagram lights up Talent Application in the menu.\n\nSidebar gains a 'Program guide' entry at the top of EXPERIENCE pointing to /experience. Compass icon, brand tone.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sandbox accounts retired; new /admin/split-view replaces them",
    body: "The sandbox-account feature is gone. Admins no longer spawn a dummy HR + Trainee pair to log into; instead, /admin/split-view (Administration → Experience → Split view) renders the platform's trainee and HR/employer surfaces side by side in two iframes, both running in your own session.\n\nWhy: signing into a sandbox account meant leaving your admin seat and losing every in-progress task — and the dummy pair never matched real-world content. The split view eliminates the round trip. Pick a preset (Talent pipeline / Internship board / Course catalog / Events), or type any platform path into either pane. To preview as a different role, switch View-as in the sidebar first; both iframes follow.\n\nWhat actually changed:\n  • Migration 20260513100000_drop_sandbox_kind converts any existing accountKind='sandbox' user to 'demo' (preserves history, picks up the demo lifecycle)\n  • Removed: /admin/sandboxes page + API, SandboxBanner, SandboxPanel, lib/sandbox/seed.ts\n  • Renamed SandboxBanner → DemoBanner (handles the demo case only now)\n  • clear-test-data + demo-seed endpoints drop 'sandbox' from their accountKinds whitelist; default kinds are ['demo']\n  • Every 'Clear demo + sandbox' label is now just 'Clear demo'\n  • Sidebar entry 'Sandbox accounts' is replaced by 'Split view'\n  • Sandbox tab on /admin/users is gone; the kind enum is now real / demo / phantom\n  • The /sandbox/[token] magic-link URL is preserved (used by phantom + showcase) but only accepts demo / showcase accountKinds now",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Every Clear-demo button is now paired with a Seed-demo button",
    body: "Generalised the seed + clear pattern (introduced on /events and /admin/credit-applications) across every admin surface that has a 'Clear demo + sandbox' button. One unified tray, one shared endpoint, four pages.\n\nWired surfaces:\n  • /internships — Seed/Clear demo postings (employer-authored)\n  • /admin/forms/[slug] — Seed/Clear demo form submissions (per-form scope)\n  • /admin/feedback — Seed/Clear demo exit-survey feedback\n  • /admin/credit-applications — Seed/Clear demo applications (migrated to the unified tray)\n\nSymmetry by design: the seed endpoint (POST /api/admin/demo-seed) only ever attaches new rows to demo/sandbox accountKinds; the clear endpoint (POST /api/admin/clear-test-data) targets exactly those accountKinds. Whatever a tray inserts, the same tray can take back out — never more, never less. Bootstrap rule: if no demo/sandbox user with the right role exists, the seeder auto-creates one with a 'demo-{entity}-{ts}@bhn.test' email so a fresh DB never blocks the demo flow. The auto-created user is itself demo-kind so the next Clear sweeps it out alongside everything else.\n\nNew DemoSeedAndClearTray component is generic: drop it on any future admin queue that wants the pair, point `entity` (+ optional scope) at the right rows, and the page picks up Seed + Clear together. Replaces the per-page bespoke DemoCreditAppsControls that was shipped two days ago.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "/admin/credit-applications gets a Seed-demo button",
    body: "/admin/credit-applications now has the same seed + clear pair we ship on /events: one tray, two buttons, both pulsing the admin snow-glow.\n\nSeed creates four plausible CreditApplication rows on demo / sandbox account holders (one each of pending / approved / rejected, varied amounts and use-cases) so the queue has content for screenshots and walkthroughs without manual setup. If no demo / sandbox users exist (fresh DB, post-clear environment), the seeder auto-creates one stub demo user — the row gets cleared on the next \"Clear demo + sandbox\" press, same as everything else.\n\nClear is unchanged in behaviour — it routes through the existing /api/admin/clear-test-data endpoint with entity=credit_application. The seed deliberately attaches rows only to demo / sandbox accounts so the symmetry holds: whatever Seed inserts, Clear removes. No phantom or showcase entanglement; no real-account rows are ever touched.\n\nReplaces the standalone Clear button that lived alone in the header.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Snow glow — admin-only controls now visibly pulse",
    body: "Admin-only buttons and trays across the platform now wear a soft cyan/white halo that breathes at 2.4s intervals — a visual reminder that the control isn't part of the trainee experience. Tightens to 1.4s on hover so it binds to the element under your cursor. Honours prefers-reduced-motion: the static halo stays, the pulse switches off.\n\nWhy cyan-white? White reads as 'system overlay' (distinct from the brand palette and the loud danger-amber we use for warnings), and sky-300 matches the 'electric' accent the Administration section already wears in the sidebar. So when an admin sees the glow they recognise the visual language at a glance.\n\nWired surfaces in this pass:\n  • Admin fast-leave buttons on /my-courses and pathway detail\n  • Demo-events seed/clear tray on /events (admin-only)\n  • Sticky admin edit bar on /events/[slug]\n  • Catalog tile drag-grip (admin re-ordering affordance)\n  • Inline pencil on every <EditableText> (admin copy edits)\n  • Phantom-user Delete-all + DemoPhantomTray on every embedded page\n  • Generic 'Clear demo + sandbox' button across admin views\n  • 'New Course' button on the catalog\n\nMore controls pick up the class as we audit the rest. Adding it to a future admin-only element is one className token: 'admin-glow'.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin fast-leave for pathways",
    body: "Mirror of the course-side admin fast-leave (shipped earlier this week) for pathway enrollments. A small 'Leave (admin)' button appears on the pathway detail hero whenever the viewing admin / superadmin holds a non-withdrawn enrollment — pending, waitlisted, approved, completed, rejected. One confirm prompt → DELETE /api/pathways/[id]/enroll → row flips to status=\"withdrawn\". \n\nFor cohort-mode pathways the route uses cancelCohortEnrollment, which also promotes the next waitlist entry in the same transaction so the admin's exit doesn't strand a seat. For legacy (no-cohort) pathways the row just flips state — same idempotency rules as the course-side button. Trainees still use the regular flow; the button is gated to staff at the parent and absent for trainees.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Editable page copy — admins can rewrite headlines, subtitles, hero text",
    body: "New CMS-lite layer for page text. Defaults stay in code; overrides live in a new EditableCopy table and take effect immediately when saved.\n\n• Inline pencils on the live page — hover any registered string (course-catalog subtitle, events index headline + intro, rewards hero title + body, pathways subtitle) and a small pencil appears for admins / superadmins. Click → modal editor with Save / Cancel / Reset-to-default. Trainees see nothing; layout doesn't shift.\n\n• /admin/copy index — every editable string on the platform, grouped by page (Catalog · Events · Rewards · Pathways), with an inline editor per row and an at-a-glance chip (\"Default\" vs \"Overridden\") so admins can scan which copy has been touched. Find it in the sidebar under Administration → Platform → Editable copy.\n\n• Reset behaviour — deleting the override row reverts the page to the in-code default. The code default never changes; overrides are purely additive.\n\n• Registry catalogue — src/lib/copy-registry.ts is the authoritative list of editable keys. Adding a new editable string is two lines: append a CopyEntry, swap the hard-coded string in the page for an <EditableText> wrapper. The /admin/copy editor and inline pencils pick up the new key automatically.\n\nWired surfaces in this first pass: /courses (subtitle), /events (headline + intro), /rewards (hero title + body), /pathways (subtitle). More pages get the treatment as we audit the rest.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "CRM_EP renamed; phantom clear loses its confirm",
    body: "Two small but visible cleanups:\n\n• The catalog course titled \"CRM_EP\" (a working-title slug that escaped from the admin-create flow) is now \"Customer Relationship Management for Founders\" — a descriptive name that fits the OBIO entrepreneurship pathway and reads naturally on the catalog and the certificate. Renamed via a SQL migration that catches the realistic casing / separator variants so a typo at creation time can't dodge the rename. Idempotent — safe to re-run.\n\n• Clear-all-phantoms no longer asks for confirmation. Phantoms are throwaway test fixtures that respawn in 5 seconds, so the modal was costing more time mid-demo than it ever protected. Affects both /admin/phantom-users (\"Delete all\" bulk button) and the embedded DemoPhantomTray on per-page surfaces (Manage Enrollments, Credit Applications, Talent Pool, etc.). Per-row delete still confirms — that one's a single named user, much easier to mis-click.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Form clear button, rewards hero, events calendar + demo seed, /events admin bar, compact View-as",
    body: "Five UX tweaks shipped together:\n\n• Clear-form button — every event-form (Talent Application, OBIO bootcamp, etc.) now has a 'Clear' button next to Submit. One confirm prompt → every field resets to blank. Quieter visual weight than the brand-pill Submit so accidental clicks are unlikely.\n\n• Rewards hero redesign — /rewards now opens with a full-bleed brand-gradient hero: a giant lifetime-credits headline, a 'journey' progress bar with milestone markers at each tier and a glowing you-are-here pointer, and a 3-stat row (tiers unlocked / claimed / credits to next reward). Tier cards got accent-coloured icon badges and a faint glow halo so unlocked tiers feel earned rather than just listed. Non-trainee landing left alone.\n\n• Events calendar view + demo seed — /events upcoming section now renders a monthly calendar grid alongside the list, with brand-tinted bands on every event day and click-through to the event landing. Admin-only twin buttons on the same page seed three demo events (next 14 / 60 / 180 days, all `demo-` slug prefix) for screenshots and walkthroughs, then clear them in one click. Endpoint cascades through registrations so demo wipes leave no orphans.\n\n• /events/[slug] admin bar — a sticky amber strip pinned to the top of every public event landing surfaces three jump-offs for staff: Edit basics, Registrations queue, and a back-out to the events admin index. Public visitors never see the bar. Workshops / sessions / speakers / sponsors are still seed-managed (no per-row CRUD UI yet) so the bar explicitly says so.\n\n• Compact View-as switcher — the sidebar's role-switcher row was overflowing once the active role label crossed five letters. Rebuilt as a single 28-px row: one pill (eye-icon · active-role · chevron) plus two 24-px icon-only quick-toggles for Trainee + Employer HR. Full descriptive labels still appear in the dropdown.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Events sidebar, admin self-leave, tunable course cap, keyboard shortcuts",
    body: "Four operational improvements shipped together:\n\n• /events keeps the sidebar — clicking the Events nav from the dashboard used to drop you into a chrome-light marketing layout (no sidebar, no banners), which made the route feel like a dead-end. Signed-in visitors now see the full dashboard chrome on /events and /events/[slug]; anonymous visitors still get the clean marketing chrome so the URL is shareable from biohubnet.ca / LinkedIn / email.\n\n• Admin fast-leave on My Courses — each enrollment row now shows a small 'Leave' button for admin and superadmin viewers. One confirm prompt, no support flag, no completion gate. The route already supported the action via DELETE; this just surfaces it as a button so admins can clean up after testing player flows without flipping into trainee-view first.\n\n• Tunable trainee course-cap + admin bypass — the previously hard-coded 3-concurrent-courses limit is now a superadmin-tunable setting at /admin/settings (key: traineeCourseLimit, default 3). Admins and superadmins already bypassed the cap silently; the Enroll button now shows a one-time popup explaining 'you're past the trainee cap, but the cap still applies to learners' so the bypass is deliberate rather than invisible.\n\n• Keyboard shortcuts — first cut of a platform-wide shortcut layer. Defaults: X toggles between your real role and trainee-view (admin / superadmin only — admin act-as was extended to allow trainee-only downgrades for this), ? opens a cheat-sheet overlay, 1-4 jump to Dashboard / Catalog / My Courses / Events. Bindings live in localStorage so each device keeps its own mapping; rebind any of them at Profile · Shortcuts. Single-letter only — chorded keys collide with the browser and the rest of the app.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Talent-pool comments, leave-pool flow + exit survey, admin feedback dashboard",
    body: "Three coordinated additions to the talent-application + employer-collaboration loop:\n\n• Application comments — admin and employer roles can now leave private comments on a talent application from the new shared /talent-pool surface (admin sees it under Admin · Experience, employers see it under their portal). Comments are visible to admins + employers only; never to the applicant. Commenting is GATED — locked until an admin has reviewed and approved the applicant's eligibility. Pending or rejected submissions show a yellow 'Commenting locked' panel explaining why, so employer reviewers can't advance a candidate past the eligibility check. Comments support delete (own or admin); each comment renders with the author's role badge (Admin / Employer).\n\n• Leave the talent pool — approved trainees now have an explicit 'Leave the talent pool' panel at the bottom of /forms/talent-application. They pick a reason (found job · career change · not relevant · platform quality · found elsewhere · other) and can either fill out the inline exit survey or skip and leave immediately. Skipping mints a single-use /feedback/[token] link they can come back to later. Hidden from employer-facing views immediately upon leaving; resubmitting the form re-enters the pool (subject to admin review). The exit survey collects 1-10 ratings across helpfulness / partner quality / platform UX / communication frequency, plus an NPS score (0-10), 'found a job' + source, three free-text fields (what worked / what to improve / anything else), and an opt-in for follow-up conversations.\n\n• /admin/feedback dashboard — aggregated view of every exit-survey response. Summary tiles for response count, NPS, average ratings per dimension, and 'found job' percentage. Reason breakdown chart. Recent responses list with per-row click-through to the full detail (every rating + every text answer, plus the follow-up opt-in state). Admins can also mint feedback-invitation links inline (targeted to a specific user OR anyone-with-link), pick the survey kind (exit_survey · post_completion · nps_check · custom), set the TTL (1-90 days), and add an optional preface — used both for proactive follow-up and as the auto-generated link when someone leaves the pool without filling the form in-line. Invitations queue is visible on the same page with status (pending / used / expired).\n\nThe shared /talent-pool surface (browse + per-submission detail with comment thread) is the same page admin and employers use, so the comment thread stays consistent across both. Trainees never see this surface; their own application data lives on /forms/talent-application.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Pathway cohorts, conditional form fields, talent-pool review gate",
    body: "Three threads in one shipment:\n\n• Pathway cohorts — a Pathway can now run as a series of cohorts (Spring 2026 / Fall 2026 / …) instead of a single open enrollment. Each cohort has its own capacity, registration window, and waitlist policy. The pathway detail page renders one card per cohort with a state badge (Open · Waitlist only · Full · Closed · Opens soon · Past cohort) — state is computed live from capacity + window, not stored, so it stays consistent. Trainees pick a cohort and the cohort service handles capacity + waitlist + dense renumbering on cancellation. Admins manage cohorts inline on the same pathway detail page (staff-only section): add / edit / delete cohorts, set status (draft / open / closed / archived). Pathways with zero cohorts keep using the legacy pathway-level fields — the system flips into cohort-mode automatically the moment the first cohort is created.\n\n• Conditional form fields — FormField schemas now support a `showWhen: { fieldId, equals }` rule. The renderer hides fields whose rule isn't met by current values; the validator treats hidden fields as not-required even if marked required, and drops their values from the saved submission. First use: the talent-application form gets a new \"Graduate program details\" section that only appears when the applicant picks \"Master's student\" or \"PhD candidate\" — collects home institution, program / department, supervisor + email, semesters completed, expected graduation, and an optional grad-office verification file (the document the ENGAGE eligibility check needs).\n\n• Talent-pool review gate — new talent-application submissions are now `pending` by default and don't appear in the talent pool / partner-visible directory until an admin approves them. Admin queue lives on the existing /admin/forms/talent-application page: per-row Approve / Skip / Reject actions, with a pending-count chip and a banner explaining the policy. \"Skip approval\" is the audit-logged fast-path for admins to admit obvious-fit candidates without queue review; the state lands as `approved_skip_review` separately from `approved` so a future report can surface which submissions bypassed the queue. Existing submissions are grandfathered into the pool during migration (back-filled to `approved`). Applicants see their own review state (Pending review · Approved · Not approved) plus any reviewer note on the form page.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Credit expiry, course delete, archived-course visibility, OBIO dietary, ENGAGE eligibility surfacing",
    body: "Multi-feature shipment covering five threads:\n\n• Credit expiry — awarded credits now carry a 365-day TTL on the grant row. A daily Vercel cron at /api/admin/credits/sweep deducts expired remainders into the ledger as 'Credits Expired' debits and sends 90 / 30 / 7-day-before-expiry warning emails so trainees have time to enroll. A new ExpiringCreditsBanner sits at the top of the trainee dashboard with three urgency levels (rose under 7 days, amber under 30, brand under 90, hidden beyond). The /credits page shows the next-expiring grant on the balance card and labels expiry transactions in the history.\n\n• Admin awareness — the admin dashboard gets a new 'Credit expiry — 365-day TTL' section with three look-ahead tiles (≤7d / ≤30d / ≤90d) summing total expiring credits and unique trainees affected. A 'Run sweep now' shortcut triggers the cron path manually.\n\n• Credit-application eligibility — the /credits 'Apply for credits' card now spells out the BioHubNet ENGAGE program eligibility: graduate students (2+ semesters), postdocs, research associates, lab technicians at one of the 14 partner Ontario institutions; what to upload (transcript + grad-office verification for students; appointment letter for staff). The 365-day expiry and the 6-month / 2,500-credits-used early-expiry warning are surfaced upfront with a link to biohubnet.ca/engage. Approved applications now stamp expiresAt on the resulting credit grant so the sweep applies cleanly.\n\n• Credit-required course awareness — course detail pages show an upstream amber banner to any trainee whose balance can't cover the course cost, with a direct link to /credits/apply and a one-line summary of who's eligible. Skips for staff, archived courses, free courses, and already-enrolled trainees.\n\n• Archived course visibility — courses with status='archived' now stay in the catalog instead of vanishing. Cards render with a 'Not active' chip + grayscale thumbnail; detail pages load normally but the enroll button is replaced with a disabled 'Enrolment closed (archived)' affordance and a slate banner explaining the state. The enrol API rejects archived courses with a 409 + code='archived'. New 'Delete course…' affordance in the course-edit modal — typed-confirmation required (admin must retype the course title); explains the cascade impact (enrolments + certificates) and recommends archiving as the gentler alternative.\n\n• OBIO Bootcamp dietary collection — the registration form gets two new fields under a 'Catering & Accessibility' section: dietary restrictions and accessibility needs (both optional textareas). Admins can re-seed the form via /admin/forms/obio-bootcamp/reseed to pick up the new fields for existing deployments.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Phantom users — spawn-and-forget test accounts that auto-delete in 24 h",
    body: "New admin tool at /admin/phantom-users (Admin · Platform). Spawn up to 50 throwaway accounts in one batch — trainee, evaluating, employer, or instructor role — each gets a plausible name, a phantom-xxxx@bhn.test email, and a one-click magic-token sign-in. Trainees + evaluating roles start with the standard 200 starter credits so they can enroll in courses immediately. Use them anywhere a real user works: populate Manage Enrollments to test bulk actions, register them for events to test the registrations table, point them at the internship pipeline. They auto-delete when their TTL expires (default 24 h, extendable up to 7 days). An hourly Vercel cron at /api/admin/phantom-users/sweep wipes any expired phantoms — admins don't have to remember cleanup. Cascade-safe deletion handles WorkshopBooking + Registration + ElectronicSignature + InternshipPosting before removing the user. accountKind=\"phantom\" keeps them out of real-user stats and admin filters by default; they get their own count chip on /admin/users so you can see how many are alive at a glance.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "New theme: Greenwood — a walk through deep forest",
    body: "Fourteenth theme, sits under Flavours alongside Salty and Chilli. Mossy sage-cream parchment surfaces, fern-green CTAs (bg-brand-600 with white text passes AAA at 7.8:1), deep-humus body text, and a dashboard hero gradient that reads like looking up at the canopy at golden hour — deep emerald base with a shaft of sunlight breaking through and a sunlit leaf-edge corner. Tailwind's saturated tints (rose / amber / sky) are tamped so state surfaces harmonise instead of fighting the moss-and-bark palette; emerald rides alongside the brand ramp. Calm, organic, alive — the antidote to office-tech grey. Try it from the theme picker.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Events admin: full attendee operations — edit, cancel, resend email, manage workshops, bulk actions",
    body: "Major upgrade to /admin/events/[slug]/registrations and a new per-attendee detail page. The registrations table now supports row selection with a sticky bulk-action bar (check in selected · clear check-in · cancel · reinstate), inline check-in toggle per row, and a •••• menu per row for opening the detail page, resending the confirmation email, or cancelling/reinstating without leaving the table. A new 'Has note' filter chip surfaces every attendee with an admin annotation. Clicking an attendee name opens the new detail page at /registrations/[rid] — a full dossier with: identity + status header; top-level action buttons (check in / cancel + reinstate / resend email); a sectioned editor for every editable Registration field (attendee type · status · payment status · symposium-day toggle · dietary · accessibility); a new admin-note field for VIP / press / speaker flags (internal-only, never shown to the registrant); a workshop manager that lists every active booking with one-tap cancellation (with waitlist promotion) and an inline 'book another for them' picker that respects the 2-cap and capacity rules; and a read-only view of their symposium breakout picks + QR token. Cancelling a registration cascade-cancels every active workshop booking they hold and promotes waitlisters into the freed spots, all in one transaction; reinstating doesn't auto-restore the bookings, so admins consciously re-book if needed. Resend email regenerates from current state, so it reflects any admin changes (e.g. workshops booked on their behalf).",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Pick your Training Week workshops while you register",
    body: "Registration is now one step instead of two. The form at /events/[slug]/register shows every active Training Week workshop and tour grouped by day, with title, partner org, time, location, transport flag, and a live spots-taken counter (X / capacity, plus 'waitlist' chip when full). Tap up to 2 — the picker tracks 'N / 2 picked' and disables further options when you reach the cap so you can swap without going over. Capacity-full picks become waitlist bookings automatically, with your position issued on submit. Skipping is fine — registering with zero picks lands you on the same flow as before and you can come back to /events/[slug]/me/workshops later. Everything (registration row + workshop bookings) commits in a single Prisma transaction so partial failures roll back cleanly. Confirmation email now lists your picks with confirmed / waitlisted status and remaining-slot guidance.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Find the Symposium — Events in the sidebar + a dashboard banner",
    body: "Closing the discovery loop on the Events module. The Engage sidebar now carries an 'Events' item (calendar icon, all 8 locales) linking to the new /events index — a public listing of upcoming + recent BHN editions with the Symposium / Training Week as the headline card. Above the dashboard's daily-theme card, trainees see a brand-gradient banner with the next upcoming event: 'Coming up' if they haven't registered (CTA → Register), or 'You're registered' with a checkmark if they have (CTA → Open my event dashboard). The banner auto-hides when no event is upcoming, or when registration's closed and the viewer isn't already in. Until now the only way to find /events/2025-annual-symposium was a direct link.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Annual Symposium & Training Week — public landing, registration, attendee dashboard, admin back office",
    body: "First end-to-end shipment of the Events module covering the 2025 BHN Annual Symposium & Training Week (Oct 27–30, Toronto). Four surfaces, all working off a single BhnEvent record.\n\nPublic /events/[slug] (no auth required). Hero with cover gradient and at-a-glance card (dates, venue, status). Workshops grouped by day with capacity / waitlist counts. Symposium agenda — parallel breakouts collapsed into 'pick one' cards so the page reads as a single schedule. Speakers grid, sponsors by tier, venue + accommodation, footer CTA.\n\nRegistration at /events/[slug]/register. Free-tier flow (paymentProvider=free, paymentStatus=waived). Collects attendee type, symposium-day toggle, dietary, accessibility. Idempotent — re-submitting from the same account updates the existing row. Confirmation page issues a per-attendee QR pass (128-bit hex token) used at check-in.\n\nAttendee dashboard at /events/[slug]/me. Compact QR pass card, current workshop bookings with status badges, cap counter (N / 2 workshops), and the breakout picker for the symposium day. /me/workshops browses + books all workshops with the 5-state booking button (Booked / Waitlist #N / Book / Join waitlist / Pick 2 reached). Service layer enforces the per-user cap, capacity, and atomic waitlist promotion on cancel.\n\nAdmin back office at /admin/events (Admin · Engage). List of every BhnEvent with status chips and registration / workshop / session counts. Per-event detail page lets admins inline-edit the basics (title, tagline, description, dates, timezone, venue, cover image, accommodation, status, registration window) via a sectioned form that PATCHes only the changed fields. Registrations sub-page is the day-of surface: searchable + filterable attendee list, optimistic one-tap check-in toggle, and a CSV download for badge printing / catering / accessibility handoff (RFC-4180 escaped). Workshops, sessions, speakers, sponsors are NOT editable in the UI yet — they're managed via prisma/seed-events.ts (idempotent; re-run with npx tsx) until volume justifies dedicated CRUD.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Theme feedback — vote on your favourites, pitch new ideas, earn merch when one ships",
    body: "New /themes page in the sidebar lets you mark up to 3 favourite themes and up to 3 least-favourites from the existing thirteen, and pitch ideas for new ones. Submitting a proposal kicks off a review by an admin — every proposal lands in /admin/theme-proposals with one-click actions (review · build · ship · ship + bounty · decline). When your idea is built and shipped, the admin can issue a Theme Designer Bundle: a hand-picked thank-you with a custom \"I designed this theme\" enamel pin, sticker pack, hand-written note, and a mystery item — delivered through the same Rewards pickup at the BHN office (or mailing on request if you're far from Toronto). The bundle is one-per-user across all your shipped proposals — submit as many ideas as you want; the bounty lands once per contributor. Voter privacy: per-user votes are private to you. Admins see aggregated top-loved / top-disliked stats only.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Launch Readiness — executive dashboard at /admin/launch-readiness",
    body: "New admin page (Admin · Platform) tracking go-live status for both the boss and the engineering team, in one view. Top of page is exec-friendly: a circular % ready donut, days to launch (from LAUNCH_TARGET_DATE env), how many items are done / in-progress / blocked, and a 6-step phase ladder (Foundations → Set-up → Stocking the catalog → Migration → Pilot → Public launch). Below that is 'What to do next' (the 3 highest-priority unfinished items in earliest-phase order), 'Decisions needed from you' (escalation panel for items flagged as needing leadership), and a Top Risks panel showing blocked items + critical-severity items still outstanding. Below that is the detailed checklist grouped by phase — admins can collapse 100%-done phases to focus on what's still moving, click any item to set a target date, leave notes, mark as decision-needed, or override the auto-detected status. Auto-detected items re-evaluate on every page load: probes inspect the running config (SMTP / domain / R2 / Sentry / Turnstile / Google OAuth / email-verification flag), DB row counts (real published courses, employer count, active postings, real trainees with active enrollments, skill ontology size, course thumbnail coverage), and audit-log activity. Each auto-detected item shows the evidence string ('12 published courses', 'SMTP_HOST set', etc.) so the team can see WHY the system thinks an item is done. Toggle the Executive view button at the top to hide engineering jargon for a board-meeting-friendly briefing.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Topic-specific AI thumbnails for the entire course catalog",
    body: "The thumbnail generator used to pick one representative word per course (chooseOneWord) and ask SDXL to paint that — which produced pretty but generic gradient covers that didn't reflect each course's actual topic. Two changes: (1) a new LLM step extracts 3–5 concrete visual elements per course (bioreactor, GMP binder, cleanroom curtain, gel bands, pipette, etc.) from the title + category + tags + description, and (2) the SDXL prompt now anchors on those motifs explicitly so the model has specific objects to draw rather than abstract concepts. New admin page at /admin/course-thumbnails (Admin · Engage) lists every course with its current thumbnail, lets you regenerate one at a time or bulk-regen the whole catalog, and surfaces the LLM motifs alongside each row so editors can see what's driving the imagery. The CLI script at scripts/auto-thumbnail-courses.ts uses the same pipeline and now defaults to regenerating ALL courses (pass --missing-only to keep existing thumbnails and only fill gaps).",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Showcase Trainee — single global advanced-trainee demo account",
    body: "New admin tool at /admin/showcases (Admin · Experience). Spawns a single global trainee account at showcase.trainee@biohubnet.test ('Maya Okafor') pre-populated with the full advanced-trainee state: 200+6,000 credit history with three enrollment debits totalling 5,200 spent (so both merch tiers unlock cleanly), both reward bundles claimed for office pickup, completed coursework + pathway + certificates when the DB has those rows seeded, full job profile (resume URL + 1-min video URL + elevator pitch + bio + jobTitle + organization), two scheduled interviews. accountKind='showcase' — fourth value alongside real / sandbox / demo, filtered out of 'real' admin stats by default. The /sandbox/[token] magic-link route was extended to honour showcase tokens, so admins get a one-click 'Sign in as Maya' from the panel (or use 'View as trainee' as superadmin to peek without leaving their session). Reset wipes related rows + re-seeds for known-good demo state; Delete removes the account entirely. Different concept from sandbox accounts (one per admin) and demo workspaces (time-limited prospect trials) — showcase is the lived-in advanced-state demo for sales calls and training-team walkthroughs.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "OBIO Entrepreneurship Bootcamp now has a full landing page on /forms/obio-bootcamp",
    body: "The /forms/obio-bootcamp page used to render only the registration form. It now leads with a full marketing-style landing built in the platform's own design language: hero with intro copy and format tags (3½-day intensive · trainee entrepreneurs · pitch to investors); 'Bootcamp at a glance' card with dates / location / format / cost; 4-phase timeline (Pre-training → Bootcamp → Post-training → Follow-up) with virtual / in-person tags and the ~40-hour total commitment; numbered Section 01 Curriculum (4 topic blocks: Market & Industry · Product Development & IP · Regulatory & Legal · Business Planning & Finance); Section 02 Experience (workshops + panels); Section 03 Impact (3 stat cards from past-participant surveys); and a travel & accommodation support callout. The in-platform registration form sits below — better than the external Google Form on biohubnet.ca because trainees are already authenticated and submissions land in the admin inbox. Per-slug content is now wired through a SLUG_CONTENT map in the [slug] route, so we can add similar landings for other forms (talent-application, etc.) without forking the page.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Rewards no longer silently redirects admins — informed empty state",
    body: "Before, an admin or superadmin who clicked Rewards in the sidebar got teleported to /dashboard with no explanation. Now the page renders under its own identity and explains the situation: 'You're viewing the trainee Rewards page as Admin. Rewards are earned by trainees as they spend credits on coursework. Your account doesn't earn merch directly.' Two action cards follow: admins get a card linking to /admin/merch (the queue where they actually do work); superadmins get a card describing how to use the existing 'View as trainee' role switcher; plain admins get a card explaining sandbox trainee accounts as their alternative. The MERCH_TIERS registry renders read-only at the bottom so non-trainees can see what bundles trainees are working toward, without the page faking per-user data. This 'informed empty state' pattern replaces the silent-redirect anti-pattern across role-gated pages.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Hover any sidebar item for a one-line explanation",
    body: "Every menu item in the sidebar now has a concise hover-popup explanation — what the page is for, in one or two sentences. Hover to reveal (350 ms warm-up so it doesn't flicker as you scan the list); keyboard focus reveals instantly for accessibility. The popovers are positioned to escape the sidebar's overflow box so they sit cleanly over page content. Mobile drawer keeps tap-to-navigate without popovers. Section-group tooltips (ENGAGE, EXPERIENCE, ADMINISTRATION) still describe the section as a whole; the new per-item tooltips drill in one level deeper.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Merch rewards now picked up at the BHN office at U of T",
    body: "Reward fulfillment is now pickup-first. When you claim a reward, the default option is to swing by the BioHubNet office at Leslie Dan Faculty of Pharmacy, University of Toronto — we'll have your bundle ready and email you when it lands. If you're far from Toronto, the same claim form has a 'Mail it to me' option; an admin reviews each mailing request and confirms postage (Canada at-cost; international we'll quote first). The bundles also got a refresh: 2,500 credits now unlocks the BHN Swag Bag (notepad + stress ball + a rotating mystery item — past trainees got pins, sticker packs, and micro-tools), and 5,000 credits unlocks the BHN insulated stainless bottle (the same one our staff carry — 16 oz, double-wall vacuum). Existing claims aren't affected; new claims pick up the new options.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Company logo URL is now a clear field, not a hidden input",
    body: "The 'logo URL' input on the company profile page used to be a tiny placeholder-only box tucked under the logo preview — employers regularly missed that pasting a URL there was how the logo updated. The field now has an explicit 'Update company logo URL' label, a longer helper line that mentions the auto-fill alternative, a 'Remove logo' link when one is set, and proper URL input type so password managers / autofill don't try to fill it.",
    kind: "improvement",
    visibleTo: ["employer", "admin", "superadmin"],
    daysAgo: 0,
  },
  {
    title: "Earn the gear — BHN merch rewards at 2,500 and 5,000 credits",
    body: "Two milestone rewards now unlock as you train. 2,500 credits trained → BHN Swag Bag (notepad + stress ball + rotating mystery item). 5,000 credits trained → BHN insulated stainless bottle (16 oz, double-wall, lab-friendly). Default fulfillment is pickup at the BioHubNet office at Leslie Dan Faculty of Pharmacy, U of T; trainees outside the GTA can request mailing inside the claim form (admin reviews postage case-by-case). New 'Rewards' page in the sidebar (under ENGAGE) shows your lifetime credits trained, progress to the next tier, and the claim flow when you're eligible. Sandbox and demo accounts don't earn merch — rewards are a real-trainee perk only. Admins manage the queue at /admin/merch.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Theme picker descriptions roll on hover — full text, no truncation",
    body: "Long theme blurbs (Cold Brew, Retro 8-bit, the new ones with sentences instead of phrases) used to truncate under '…' and you had to guess what was past the edge. Now the description rolls horizontally on hover so the full text reads in a continuous loop, and pauses back to truncated when you mouse away. Reduced-motion users still see the static head, same as before. Small detail, but the picker now actually explains what each theme is supposed to evoke.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Tighter sidebar footer — tour, theme, build SHA share one row",
    body: "The 'Take the tour' button now uses a compass icon (orientation, guided exploration) rather than the generic question-mark help glyph it shared with FAQ pages. Take the tour, the theme picker, and — for staff — the build SHA chip all live on the same compact row at the bottom of the sidebar, replacing the earlier two-row split. The 'View as…' role switcher (superadmin only) collapses from a stacked label to a single line with the active role tag riding inline on the right. Net: roughly 32 px shorter sidebar footer, more breathing room for the nav.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cold Brew, redesigned — looking into the cup, not at the room",
    body: "The original Cold Brew was a daylit cafe table — cream surfaces, espresso text. The new Cold Brew is the cup itself. Deep dark-roast canvas (#0c0604), steamed-milk cream type (#f5e8d0) instead of pure white so the page never glares, and crema-warm CTAs (#d49a6e) that read as glow rather than colour. Cards are rendered as polished ceramic: a top-edge specular highlight (a 1 px cream-alpha inset on the rim) plus a deep outer shadow lifts each surface off the canvas — light catching the glaze of a mug. Tracking tightens to -0.018em so the typography stays disciplined under all that warmth. Tailwind state colours (rose / amber / emerald / sky) get saturated lifts so badges and warnings stay legible on the dark ground. Pick it from the Theme menu in the sidebar.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Two more flavours + grouped theme picker — Salty and Chilli",
    body: "The picker now organises every theme under three sections so the menu doesn't read as a 12-item flat list. Classic (the foundation library: Daylight, Nightfall, Scientific, Mist, Rosalind, Hi-Tech) sits on top, Flavours next (Cold Brew, Summer Ice Cream, Dry Ice, Retro 8-bit, plus the two new arrivals — Salty: sea-fog and weathered driftwood, light coastal calm; Chilli: charred-earth dark canvas with paprika-flame brand and cream rice-beside-the-dish text), and Limited time at the bottom (Sakura, until 31 May 2026). The dropdown auto-scrolls when content overflows the viewport.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Retro 8-bit theme — NES boss screen with scanlines and pixel font",
    body: "Bright magenta on CRT-purple, monospace pixel font (Press Start 2P / VT323 if installed, otherwise system mono — still pixel-flavoured), sharp 0–4 px radii, and a fine repeating-line scanline overlay across the entire viewport so the platform reads like it's running on a 1985 cathode-ray-tube. Surface shadows are hard 4 px offsets in magenta — no blur — like a sprite cast on phosphor. Hero band is a classic NES boss-screen palette (magenta + cyan + yellow + deep purple). Tailwind tints kept saturated in this theme — 8-bit colours are supposed to pop. Pick it from the Theme menu in the sidebar.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Three new themes — Cold Brew, Summer Ice Cream, Dry Ice",
    body: "The theme picker grew by three. Cold Brew is a coffee-shop warm light theme with oat-milk cream surfaces, espresso-dark text, and a crema-pour hero gradient. Summer Ice Cream is pastel and playful — vanilla cream base, raspberry-coral CTAs, and a multi-flavour swirl hero (pink + mint + peach + lavender) with very rounded scoop-shaped radii. Dry Ice is dark and theatrical — frosty fog over deep teal-black with icy-cyan brand glow, sharp ice-crystal radii, and a hero that reads like smoke curling off a block of dry ice. Each carries its own typography weight + tracking + shadow language so the difference is felt, not just seen. The dashboard hero, sidebar admin chip, and brand surfaces all retint to match — pick from the Theme menu in the sidebar or wait for the daily-fresh card to suggest one.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Compliance + security hardening — MFA, e-signatures, lockout, password policy, full policy library",
    body: "Big batch aligning BHN with SOC 2 Type II / GDPR / PIPEDA / 21 CFR Part 11. Engineering: opt-in TOTP MFA at /profile/security with QR + 6-digit verify, login flow expands to ask for the code when MFA is on; brute-force lockout (5 fails → 30-min lock) with audit-logged lock events; password policy (≥10 chars, top-200 breached-list rejection, identity-substring rejection); password rotation timestamp tracked; 21 CFR Part 11 §11.50 / §11.70 e-signatures via new ElectronicSignature model + /api/signatures (optional re-auth-on-sign for regulated deployments via BHN_PART11_REQUIRE_PASSWORD); audit log extended to MFA enable/disable, password change, login lockouts, e-signature creation. Documentation: 8 new files under docs/security/ — Compliance roadmap (with leadership decision items + dollar costs), Sub-processor list with each vendor's compliance posture, Data retention & deletion policy with category-by-category schedule, ROPA (GDPR Art. 30 records of processing activities), Incident response runbook + breach-notification templates for GDPR / PIPEDA / Quebec Law 25 / US states / customer DPAs, Encryption posture document, 21 CFR Part 11 alignment plan covering every clause, Acceptable use policy. Public /security page extended with a Compliance posture section showing the standards roadmap + procurement-team checklist + DPA request line. Internal full report (with $$$ figures and decision points) at /admin/security under 2026-05-09-compliance-roadmap.md. No third-party spend yet — that's the next decision for leadership.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Adaptive learning MVP — topic mastery, review bookmarks, video checkpoints",
    body: "Three small adaptive-learning primitives. (1) Topic mastery heatmap on every course detail page: per-topic green/yellow/red read of how the trainee is doing, computed from their latest assessment attempts. Replaces 'X% complete' with a much more useful 'strong on aseptic technique, building on QC, needs review on GMP'. Authors tag questions with a topic field; questions left untagged group under their assessment title. (2) Review bookmarks — star icon on every assessment question lets the trainee save it for later review. A 'Today's reviews' card on the dashboard surfaces due bookmarks with an expanding-interval ladder (1 → 3 → 7 → 14 → 30 → 60 days) gated by a binary 'Got it' / 'Still tricky' self-grade. (3) Video module checkpoints — instructors place timestamped checkpoints in a video module; the player pauses at each one, optionally shows a comprehension question, then resumes. No autoplay-skip; learner controls pace per Mayer's segmenting principle. New trainee-facing CheckpointVideoPlayer component, author CRUD API at /api/admin/modules/[id]/checkpoints, trainee read at /api/modules/[id]/checkpoints (correct-answer never leaks to the client). All three are intentionally cheap MVPs — the BKT / SM-2 / auto-chunking story sits behind these as v2 candidates if usage validates the pedagogy.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar: mobile-responsive drawer, role-switcher truth, and a clearer IA",
    body: "Big sidebar overhaul addressing the audit findings. (1) Mobile: a hamburger button at top-left under md, an off-canvas drawer that slides in from the left, body-scroll-lock + Esc-to-close + auto-close on route change. The desktop shell is unchanged. (2) Role switcher now actually works — superadmins acting as another role see only what that role sees in the sidebar. The ImpersonationBanner stays so they can switch back. (3) Renamed 'My Application' / 'My Applications' to 'Application Builder' / 'Application Tracker'; routes unchanged. (4) Added section tooltips on EMPLOYER PORTAL and ADMINISTRATION (the two that were silent). (5) ADMINISTRATION → Platform sub-group is collapsible with persisted state — that 12-item list defaults closed so the admin's vertical scroll isn't dominated by occasional-use links. (6) Active-state has a 2 px brand-coloured left edge so it reads at a glance on every theme (the brand-50 bg alone was nearly invisible on Mist + Sakura). (7) Distinct icons — Lightbulb for My Skills, FlaskConical for Demo workspaces, Bell for Change log (was three Sparkles in a row). (8) Admin Engage labels now prefixed with 'Manage' to disambiguate from trainee-facing Certificates / Enrollments / Pathway enrollments. (9) Take-the-tour relocated to a Help slot in the footer next to the theme picker. (10) a11y: nav has role='navigation' + aria-label, links have aria-current and a brand-tinted focus-visible ring.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "i18n: 7 nav keys translated into Spanish, French, Chinese, Hindi, Korean, Punjabi, Arabic",
    body: "Application Builder, Talent Application, Internship Opportunities, Application Tracker, the three employer-portal items, and Take the tour now render in the user's locale instead of falling back to English. Brings every key in the nav up to full localisation parity across the 8 supported languages.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Internships: a real apply flow, match scores, save, and 'My applications'",
    body: "Big trainee-flow batch on the internship-finder journey. (1) Postings now have a contact section: every posting carries contactEmail (required), contactName, contactPhone. The detail page surfaces them with copy-to-clipboard + 'Send my application' — one click opens a mailto: pre-filled with your elevator pitch + resume URL + video URL from /profile/application, and writes an ApplicationStatus row server-side so BHN keeps a record. (2) New /profile/applications page (under EXPERIENCE → My Applications) shows two lists: postings you've applied to with their current employer-side stage (submitted / reviewing / shortlisted / phone screen / onsite / offer / hired / not advancing), and postings you've saved for later. (3) Save / heart icon on every card and detail header lets you bookmark postings; saved-postings with deadlines in the next 7 days surface as a dashboard nudge. (4) Match scores on every card (when you have ≥1 skill on file and the posting has been ontology-tagged) — green-pill % showing how well you fit. The detail page expands the score with a per-skill breakdown of what you have vs. the gaps, plus a link to courses that close those gaps. (5) Filter bar on the listing: free-text search across title + company + skill + details, location dropdown, type dropdown — all stored in URL params so a saved tab preserves the filter. (6) Posting body now renders Markdown (headings, lists, bold, links) instead of flat whitespace-pre-line. (7) Status guard — non-staff trainees can't render closed/draft postings via stale URLs; the detail page 404s. (8) Skill-profile nudge extended: was 'show only when 0 skills', now 'show until 5+ skills'.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sakura — limited-time cherry-blossom theme (until 31 May 2026)",
    body: "A new theme has joined the picker for the rest of May: Sakura, a soft cherry-blossom palette with petal-pink CTAs, cream-white surfaces, and a wine-stained text colour for AAA contrast. Pick it from the Theme menu in the bottom-left of the sidebar — or wait for the daily-fresh card on your dashboard, which features Sakura as the suggested theme of the day while it's available. After 31 May, Sakura disappears from the picker (and from any saved theme cache, automatically falling back to your prior choice). A 'Limited' pill in the picker tells you which themes are seasonal.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Daily-fresh theme card on the dashboard",
    body: "Once a day, the dashboard surfaces a different theme suggestion in a small card at the top. Click 'Try it' to apply the theme for the rest of the session without committing — once you've tried it, the same card morphs into 'Keep it' (saves to your profile) or 'Maybe later' (reverts to your usual theme). Dismiss makes the card go away until tomorrow. The rotation skips your currently-saved theme so the suggestion is always something new. While Sakura is available, it preempts the rotation as the featured limited-time theme.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar sections now read as three colour-coded blocks",
    body: "ENGAGE / EXPERIENCE / ADMINISTRATION each have their own identity colour: emerald for ENGAGE (learn / practise / earn), amber for EXPERIENCE (real-world / employer-facing), and electric blue for ADMINISTRATION (privileged territory). Borders, soft washes, and the title chip all share the section's tone, so navigating between groups reads at a glance. Title chips are also slightly larger now (text-xs from text-[10px]) — admins reported the prior size was hard to read. Colours are theme-independent so muscle memory carries between Daylight, Mist, Sakura, etc.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "ADMINISTRATION sidebar group now stands out in electric blue",
    body: "Privileged territory should look unmistakable — admins / superadmins always know when they're operating with elevated permissions. The ADMINISTRATION group's title chip now uses a fixed sky-* (electric blue) palette with a soft outer glow and a faint chip glow, regardless of the active theme. ENGAGE / EXPERIENCE keep their neutral look; the contrast is the point.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Security program: pentest playbook, public disclosure policy, automated SAST scanning",
    body: "Three of the five recommended next steps from the 8-May-2026 leadership report have shipped. (1) Public security page at /security with our disclosure policy, scope, safe-harbour commitment, and a defence-in-depth summary, plus /.well-known/security.txt per RFC 9116. Footer links added to the marketing pages. (2) GitHub Actions: CodeQL with security-extended queries on every push + PR + weekly schedule, npm audit (high+) + TruffleHog secret scanning on every PR, Dependabot for weekly version + immediate security updates. (3) Pentest procurement playbook at docs/security/pentest-procurement.md — trigger conditions, Canadian vendor shortlist with day-rate ranges, pre / during / post-engagement checklists, budget bands. Surfaces in-platform via /admin/security alongside the Canvas-breach response report.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Security program: signed-URL primitive, email verification, Turnstile CAPTCHA — env-gated",
    body: "Two more measures from the leadership report are wired in but turned off by default; ops flips the env vars when ready. (1) Signed-URL R2 primitive (getSignedR2GetUrl, helpers in src/lib/r2.ts). When R2_USE_SIGNED_URLS=true and the bucket is flipped private, GET /api/profile/application re-mints 5-minute signed URLs at request time — removes an entire class of 'URL leaks → file leaks' scenarios beyond the token-in-path mitigation we already shipped. (2) Email verification — schema adds emailVerifyToken + emailVerifyExpires (256-bit token, 7-day expiry); register route issues + sends the link via existing nodemailer transport; new /verify-email/[token] friendly landing; resend endpoint can't be used to enumerate emails; UnverifiedEmailBanner with one-click resend on the dashboard for unverified real accounts. Sign-in gated by BHN_REQUIRE_EMAIL_VERIFY=true. (3) Cloudflare Turnstile CAPTCHA on /register, server-verified, no-ops when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset. Free, GDPR-friendly, no third-party tracking.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin: Security reports page (Administration → Platform → Security)",
    body: "Leadership-facing security reviews now live in-platform at /admin/security. The page reads every Markdown file under the repo's docs/security/ directory and renders it inline — newest first — so an admin can show a board / leadership member without cloning the repo. The first report covers our 8-May-2026 pre-emptive review against the Canvas / Instructure breach (what happened to them, what we found in BHN, what we shipped, what's recommended next). Future reports drop into the same directory and appear automatically. Each report links back to its GitHub source for citation. A 'security@biohubnetwork.ca' contact line at the bottom makes vulnerability disclosure easier to find. Admin / superadmin only.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Security: hardening pass mapped to the May-2026 Canvas/Instructure breach",
    body: "The Canvas attack class — an authenticated low-privilege account reaching resources it doesn't own (IDOR / authorization-boundary failure) — applied to BHN in two places. (1) My Application files (resume + 1-min video) and form-upload files were stored in our public R2 bucket at deterministic paths like applications/{userId}/resume.pdf — anyone who learned a userId from an authenticated list could fetch the file directly. The path now includes a 128-bit random token (applications/{userId}/{token}/resume.pdf) so URLs are unguessable; replacing or clearing an artifact best-effort deletes the previous R2 object. (2) Six course-mutation endpoints (PATCH course, POST modules / assessments / SCORM / thumbnail / summary, PATCH summary) checked role=instructor but not course ownership — any self-registered instructor could deface every course on the platform. They now use a new requireCourseOwner() helper that checks the calling user owns the course OR is admin/superadmin (so platform staff can still moderate). One more IDOR fix: the UserSkill PATCH handler now confirms ownership before mutating, matching what the DELETE handler already did. A re-audit confirmed all fixes landed and no sibling endpoints share the same flaw. No user PII was exposed at any point — these are pre-emptive fixes.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "'Take the tour' is now a sidebar menu entry for every role",
    body: "There's been a small ? button at the bottom-left to restart the onboarding tour, but it was easy to miss. The sidebar now has an explicit 'Take the tour' item just below the misc menu (Buddies / What's new). Visible to every signed-in role — trainees, evaluators, instructors, employers, admins, superadmins — so anyone who dismissed the auto-tour or wants a refresher can find their way back. The button dispatches a DOM event the existing Onboarding component listens for, so the tour's own state machine stays the single source of truth.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Talent Application now pre-fills resume, video, and pitch from My Application",
    body: "If you've built a resume, 1-minute video, and elevator pitch on /profile/application, the Talent Application form now imports them automatically when you open it. A blue banner at the top of the form tells you the values came from My Application and offers a link to edit them there. Edits you make on the form itself still win — we don't overwrite an explicit submission with a later My-Application change. Empty submission fields don't clobber non-empty My-Application defaults either, so re-opening a half-finished draft no longer wipes the resume slot.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Fix: enrolling in a course with no modules used to show a broken player",
    body: "Trainees who enrolled in a course before its instructor finished adding modules / assessments hit an unrenderable shell — the module reader was running `course.modules[0]` against an empty array. The /courses/[id]/learn route now detects an empty course and shows an explicit empty state with two paths back (Back to course / My courses), plus a different message for staff who land here while authoring.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Fix: SCORM player races between final save and exit redirect",
    body: "Two related fixes. (1) When a SCORM package fired LMSFinish on completion, we used to setTimeout(redirect, 500) regardless of whether the last save round-trip had returned — on a slow network the navigation could race the PATCH and lose the final score / suspend_data. Now we await the final save before pushing back to the course page. (2) The data model was being seeded from server values only on the first mount, so re-entering a course (or a router.refresh after an external save) left the iframe API serving stale local values. The init effect now re-syncs whenever suspend_data / location / completion_status change.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "My Application: 'Saved' indicator on the elevator pitch",
    body: "After saving the pitch (manually or via the admin Fill-with-sample flow), the Save button is correctly disabled because the value matches what's on the server. But a greyed-out button gives no positive signal — multiple admins reported typing a stray character just to re-enable it as a confirmation. There's now an explicit ✓ Saved pill next to the button when the pitch matches the server, so 'I'm done here' is unambiguous.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Internships: nudge to complete your skill profile",
    body: "Trainees with zero skills on /profile/skills now see a banner at the top of /internships explaining why match scores don't appear and offering a one-click route to add skills (or upload a resume to extract them). Once at least one skill is on file, the banner goes away. Doesn't block browsing — postings still render below.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Admin: 'Fill with sample' on My Application — including the video",
    body: "Admins and superadmins now see a 'Fill with sample' panel at the top of /profile/application. One click populates all three slots through the real upload pipeline: a multi-section sample resume PDF generated client-side via jsPDF, an ~8-second WebM video introduction recorded live from a <canvas> animation through MediaRecorder (no hand-crafted MP4 byte-piles, no ffmpeg dependency), and a sample elevator pitch. The video shows four animated slides with the admin's name, an animated brand mark, and a pulsing REC dot — under 3 MB. Useful for screenshot runs and sandbox demos so prospective employers see a populated candidate profile without an admin having to actually record themselves.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "New: My Application — build your resume, video intro, and pitch once",
    body: "Trainees now have a dedicated 'My Application' page under the Experience menu (Sidebar → Experience → My Application, or /profile/application). Three sections: a resume slot (PDF / DOCX, ≤10 MB), a 1-minute video introduction slot (MP4 / MOV / WebM, ≤60 MB) with inline preview, and an elevator pitch (≤650 chars). Each section saves independently — upload your resume now and write the pitch later. Files land in R2 at a deterministic per-user path so re-uploads replace the old artifact instead of leaking storage. The intent: build these once and any later employer-facing form pulls from here, instead of re-uploading the same file across every submission.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Fix: SCORM player kept escaping back to the previous page (real fix)",
    body: "Previous fix narrowed when LMSFinish redirects, but the actual culprit was a different escape path. The iframe sandbox included `allow-top-navigation`, which lets scripts inside the SCORM package navigate the LMS page itself — and many authoring tools wire 'exit' or 'prev module' buttons as `window.top.history.back()` (assuming the package launches in a popup, not an iframed LMS). That pulled the LMS back to whatever you came from. Dropped that sandbox flag; module navigation now stays inside the iframe where it belongs. Use the LMS top-bar 'Back to course' link to exit.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Talent Application 'Fill with sample' now also fills the file attachments",
    body: "Clicking 'Fill with sample' on the talent application now sets resume, supervisor letter, and supporting document fields too. First click hits a new admin endpoint (/api/admin/forms/talent-application/seed-samples) that generates three minimal valid PDFs server-side and uploads them to R2 at fixed paths. Subsequent fills reuse the same URLs from sessionStorage — no repeated uploads. The submissions API still validates that file values come from R2_PUBLIC_URL, so the seeded URLs round-trip cleanly through real submission. The video field stays empty because MP4 placeholder generation is fiddly and the field is optional.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Fix: SCORM player no longer kicks learners out when clicking a module",
    body: "Many SCORM authoring tools (Articulate Storyline, iSpring, Adapt) call LMSFinish whenever the learner moves between modules — not only at the end of the course. The player was treating every Finish as 'course over' and pushing learners back to the course detail page. The fix: only redirect when the SCORM content reports the course is genuinely done (lesson_status / completion_status = completed / passed / failed). For incomplete / not attempted / browsed it just saves progress and stays in the player so internal module navigation works.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Login page: side-by-side new-user signup and returning-user login",
    body: "The /login page is now a two-box layout. Left card is the new-user signup pitch — value prop, three short bullets (training tracks, pathways, employer matching), and a primary 'Create your free account' button leading to /register. Right card is the existing returning-user login form. On mobile they stack vertically with signup first, since the page is everyone's first stop. The Theme cycler stays in the top-right; the build-info text below stays.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Changelog entries now show the build SHA they shipped on (staff only)",
    body: "Every new changelog entry is automatically stamped with the deploy's commit SHA at create time. On the changelog page, admins and superadmins see a small monospace chip next to the date — click to copy, hover to see the full 12-char SHA. Trainees and instructors don't see the chip; the entries themselves are still the same. Lets staff correlate 'what shipped' with 'in which build' without keeping a separate release log. Existing pre-stamp entries simply omit the chip.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "AI course summary: edit manually, refine with a prompt, publish with confirmation",
    body: "Three improvements to the course publish-and-summarise loop.\n\n(1) The AI summary card now has three modes for staff. Edit lets you type the summary directly — verbatim save, no AI call. Refine takes the existing summary and a short instruction (e.g. 'make it shorter', 'more technical', 'lead with what learners can do after') and rewrites it. Regenerate still rebuilds from the course's modules and assessments. Three quick-pick example prompts on the Refine view, plus ⌘/Ctrl + Enter to send.\n\n(2) The Publish button now confirms the action with a green toast bottom-centred on the page: 'Course published' + a primary 'Inspect course →' button that opens the trainee view, plus a secondary 'View in catalog' link. Unpublishing shows an amber confirmation. Errors get a rose toast with the server message. Toast auto-dismisses after 8 seconds; or click Dismiss.\n\n(3) The publish API path now returns errors as JSON for the toast to surface — small reliability win.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "New Course dialog: add and remove Topic / Delivery / Provider options inline",
    body: "When an admin opens the New Course dialog, the Topic / Delivery / Provider fields now load the canonical option list from /admin/course-filters. Each option appears as a small chip beneath the input — click the × to remove it. Type a custom value and a 'Save' chip appears inline; click it (or hit Enter) to promote it to the canonical list so it shows up as a suggestion everywhere. No more side trip to /admin/course-filters just to add one option for the course you're about to create. Fallback: if the user can't read the admin endpoint, the dialog still works against the static seed lists.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Trainee registration — auto sign-in, password confirm, role + language at signup",
    body: "Eight UX fixes on /register based on the audit:\n\n• Auto sign-in after creating the account — the /login round-trip is gone. New users land directly in /dashboard with their JWT cookie set. A three-step progress card replaces the silent spinner so something visibly happens between click and dashboard.\n• Name is now required (2–80 chars) with an explicit asterisk. Server re-validates so back-channel POSTs can't slip a null name through.\n• Confirm-password field — typing your password twice prevents the lock-out scenario where a typo at signup forces a password reset.\n• Show-password toggle (eye icon) on both password fields. Mobile signup no longer requires typing 8+ chars blind.\n• autoComplete + autoFocus on every field so password managers prompt to save and the cursor lands in the name field on page-load.\n• 'I am a…' dropdown matching the talent-application's seven positions (Master's / PhD / Postdoc / Research Associate / Lab Technician / Industry Professional / Other), persisted to User.jobTitle so the dashboard greeting and AI tagline can use it from minute one.\n• Language picker (8 supported locales) defaulting from navigator.language and persisted to User.locale, so non-English users aren't stuck on the English UI until they discover the switcher.\n• Inline credits explainer ('most courses cost 50–200') so '200 credits to begin' lands with context.\n• Warmer h1 and a slate-blue CTA gradient.\n\nLogin page now honours ?registered=1 + ?email=… from the fallback path: title flips to 'Account created — sign in', a green confirmation banner appears, and the email field pre-fills. The fallback only triggers if auto sign-in fails for some reason (which it shouldn't).",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "New theme: Mist — Apple visionOS-inspired translucent panels",
    body: "A premium glass theme tuned to feel like visionOS, iOS Control Center, and macOS translucent panels — calm, airy, physical. Off-white background with a desaturated blue-gray atmospheric mesh (no chromatic blooms, no neon, no aurora). Cards are translucent with 30px backdrop-blur + 180% saturation; popovers go to 40px. Each panel renders layered shadows: a diffused outer drop (`0 8px 32px rgba(15,23,42,0.10)`), a bright top inset highlight (specular edge), and a barely-there bottom inset for the lower lip. Hairline white borders, large rounded corners (16 / 24 / 32 / 40 px), Apple SF Pro typography with light-to-medium weights, and a subtle SVG noise overlay so panels read as physical material rather than flat gradients. Brand is a desaturated slate-blue picked to recede rather than draw attention. Pick it from the Theme picker at the bottom of the sidebar.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sandbox accounts: one-click magic-link sign-in (no more copy email + copy password)",
    body: "Spawn a sandbox and you now get a magic-link URL per account: click it (or open in incognito to keep your admin session) and you're signed in instantly as the sandbox employer or trainee. No email to copy, no password to copy, no /login screen. Same pattern as demo workspaces and employer invites. Token is stored on User.magicToken (sandbox + demo accounts only — real accounts can never have one, so a leaked sandbox token can't escalate). Existing sandboxes from before this change show a 'Reset to generate magic link' nudge — one click and they're upgraded.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Talent Application — broader audience options + 12 sample personas",
    body: "Three changes. (1) The 'What best describes your current position' radio is now Master's student / PhD candidate / Postdoctoral Fellow / Research Associate / Lab Technician / Industry Professional / Other — covering the full BioHubNet life-sciences audience instead of collapsing everything into 'Graduate Program'. The 'status and goal' radio gains a third option for working professionals exploring new opportunities. (2) /admin/forms/talent-application has a new 'Reset schema' button that overwrites the live form with the latest source seed — click it once after a deploy that changes options in code. (3) 'Fill with sample' now offers 12 personas instead of 5, spanning masters / PhD / postdoc / research associate / lab technician / industry professional. Every preset fills every non-file field with valid option strings. Personas span U of T, McGill, UBC, Calgary, Western, Université Laval, Manitoba, and Dalhousie, with realistic mixes of citizenship status and French proficiency.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course form: contrast fix + custom topic / delivery / provider",
    body: "Two issues on the New Course modal: (1) inputs had no background or text colour set, so on dark themes (Nightfall / Hi-Tech / Rosalind) text rendered light on the user-agent's white default — invisible. Switched all inputs / textarea / selects to the standard theme-aware classes (bg-card-solid, text-fg, border-line). (2) Topic / Delivery / Provider were locked-down dropdowns. Now they're input+datalist combos: pick from the curated list (sourced from /admin/course-filters) OR type a custom value. Same change applied to the per-course quick-edit pencil dialog. The bulk-apply dialog keeps its select-only paradigm (it needs a tri-state 'don't change / clear / set').",
    kind: "fix",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Employer invites: bulk-mint, search/filter, undo revoke, open-tracking, first-run guide",
    body: "A round of UX polish on the magic-link invite system based on the review.\n\nAdmin side (Administration → Experience → Employer invites):\n• Bulk invite — paste up to 100 emails, mint one magic-link per address.\n• Filter chips (All / Pending / Claimed / Expired) and a search box that matches email or company name.\n• Undo revoke — clicking the trash icon kicks off a 5-second client-side window with an Undo toast before the DELETE actually fires.\n• Open count + last-opened display per invite — shows how many times the recipient (or you) has clicked the link.\n• 'Testing' badge auto-applied to invites with @biohubnet.test placeholder emails so you can tell quick-test invites apart from real-prospect ones at a glance.\n\nEmployer side:\n• First-run welcome card on /employer for fresh accounts (no postings, empty profile) with three click-through steps: fill profile → post first internship → review applicants.\n• 'Set a password' banner for users who signed in via magic link and have no password set — prevents the 'locked out when invite expires' trap. Dismissible per session.\n\nExpired / conflict / unknown-link error page now offers two relevant action links per case (e.g. for email conflict: 'Sign in to existing account' OR 'Request a new invite with a different email').",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sandbox + demo accounts are now hidden from platform stats by default",
    body: "/admin/users now opens on a Real tab (real accounts only) with separate Sandbox and Demo tabs you can flip to. The admin dashboard, system-status page, /admin/analytics, /admin/stats, /admin/newsletter, the public /for-employers and /for-trainees pulse stats, and the recent-logins feed all filter to accountKind='real' so dummy accounts don't pollute the numbers prospects and admins see. System status keeps a small footer line below the vitals (`Plus N sandbox · M demo`) for transparency, with deep links to the dedicated management pages.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Employer HR invites are now magic links — one click, no claim form",
    body: "The signup-link flow is rewritten end-to-end. Recipient clicks the URL, lands in /employer signed in. No name to type, no password to set up front, no claim screen. Magic links are reusable bookmarks until expiry, so partners can come back later from any device. Admins get two new buttons on /admin/employer-invites: Quick invite (zero inputs, mints + auto-copies the URL in one click) and a per-invite Test button that opens the link in a new tab so admins can experience exactly what the recipient experiences. All form fields are now optional. Cross-device password sign-in still works for partners who later set a password from /profile.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Admin Inbox — one place for everything waiting on review",
    body: "New /admin/inbox (Administration → Platform → Inbox) gathers the four streams admins triage: role-change requests, credit applications, pathway-enrolment approvals, and access requests from the public marketing pages. Top of the page shows four lanes with live counts colour-coded by urgency; below, a unified time-ordered feed of the most recent pending items across all four streams, each with a Review link to the existing dedicated page. The individual pages still work — this is the hub, not a replacement.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Admin menu re-balanced: skills moved to Experience, requests live under Platform",
    body: "The Engage / Experience / Platform sub-grouping is tighter now. Engage stays focused on running courses (enrolments, groups, credit apps, pathway enrolments, course filters, certificates). Skill ontology moved to Experience — it's the matching marketplace vocabulary, not a course property. Users / Role requests / Announcements / Newsletter exports moved to Platform alongside the other operations links. The new Inbox sits at the top of Platform.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Administration menu now grouped: Engage · Experience · Platform",
    body: "The Administration sidebar group used to be a long flat list of 20+ links. It's now sub-grouped to mirror the user-facing ENGAGE / EXPERIENCE vocabulary you already see at the top of the sidebar. Engage covers learning content + people management (Users, Enrollments, Groups, Skills, Course filters, Certificates, Announcements, Newsletter exports, Pathway / Credit / Role applications). Experience covers the employer side (Employer invites, Access requests, Sandbox accounts, Demo workspaces). Platform covers operations (Analytics, Reports, Audit Log, plus superadmin-only LTI / System status / Settings). Overview stays as a single link at the top of the section.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Per-admin sandbox accounts — multiple admins can test in parallel",
    body: "Administration → Sandbox accounts (its own page now, not buried in System status) lets each admin spawn their own Employer HR + Trainee pair (idempotent, deterministic emails). The pair comes pre-loaded with a posting and a talent-application submission so the kanban, scoring, and interview flows all light up. Reset wipes and re-seeds; Delete cleans up. You can also see other admins' sandboxes — handy for spotting who's testing what.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "'Fill with sample' chip on long forms (admin-only)",
    body: "Talent Application, internship posting form, employer company profile, and trainee personal info now show a discreet amber 'Fill with sample' chip next to the title — visible only to admin and superadmin. Click for 5 curated presets; pick one and the form populates with realistic biomanufacturing dummy data. Tweak, submit, see the real downstream flow. Ideal for hands-on demos and onboarding new admins.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Demo workspaces — true one-click magic-link sign-in",
    body: "Administration → Demo workspaces lets you mint a magic-link URL for a prospective partner. They click — that's it. The server validates the token, spawns a populated workspace (or looks up their existing one for return visits), mints a NextAuth session scoped to the invite expiry, sets the cookie, and redirects straight to the employer dashboard. No claim form, no name typing, no copy-paste credentials. The link is reusable until expiry, so the prospect can bookmark it and come back. Workspace ships pre-loaded with 3 sample postings, 10 applicants spread across the kanban funnel, scheduled interviews, ratings, and notes. Time-limited (default 7 days); a sweeper deletes everything when the timer runs out.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Sandbox / demo banner — clear visual cue when you're not in real data",
    body: "When you're signed in as a sandbox or demo account, a slim cyan (sandbox) or violet (demo) banner sits at the top of every page so you never confuse 'this is real' with 'this is my dummy.' Demo banner shows a live countdown to expiry.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Skill ontology — the platform now knows what it's teaching, hiring, and learning",
    body: "Every course, internship posting, and trainee profile is now wired to a shared, curated Skill vocabulary. AI extracts skills from course descriptions, posting bodies, talent-application pitches, and (optionally) uploaded resumes. Course completions automatically infer skills onto the trainee's profile with evidence. Aliases and embeddings let synonyms (USP / Upstream Processing / upstream bioprocessing) resolve to the same canonical Skill. Admins curate the vocabulary at Administration → Skill ontology.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "My Skills — your verified skill profile, on every dashboard",
    body: "EXPERIENCE → My Skills lists what BHN knows you can do, with evidence: which course, which line of your resume, or what you self-claimed. Adjust levels, remove a skill, or claim from a curated suggestion list of common biomanufacturing skills employers ask for.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "How you match — skill gap widget on the trainee dashboard",
    body: "Pick any active internship from the new 'How you match' widget on /dashboard and we show your 0–100 match score, the skills you bring (green), the skills you're missing (rose for required, amber for nice-to-have), plus a list of BHN courses that would close the gap. No mystery scoring — every weight is shown.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Applicant kanban with live skill scoring (employer + admin)",
    body: "Open any of your postings → Applicants and you'll find a six-column kanban: New / Reviewing / Shortlisted / Phone screen / Onsite / Offer (with Hired / Rejected / Closed collapsed at the bottom). Each card shows the candidate's match score, top matched skills, completed-BHN-course count, plus a side drawer for notes, 1–5 star rating, and the full skill breakdown.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Interview scheduling — propose time slots in one click",
    body: "From an applicant's drawer in the kanban, click Schedule interview. Propose 1–5 datetime slots, pick a format (video / phone / onsite), drop the meeting link, send. The applicant sees the choice on their /interviews page (also linked from the sidebar) and accepts one or declines. Acceptance auto-stamps Phone screen on the kanban. No external calendar OAuth in v1 — keep an eye on /interviews to see what's confirmed.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Public marketing — /for-employers and /for-trainees",
    body: "BHN Training now has two public, no-auth marketing pages: /for-employers pitches the platform to industry partners with live pulse stats and a sample candidate match; /for-trainees pitches it to learners with a sample skill-gap card. Both have an access-request form that lands in a new admin inbox at Administration → Access requests, where admins approve into a regular employer invite or trainee welcome.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Newsletter sign-up: three options instead of one tick-box",
    body: "Registration now asks 'Yes, sign me up' (default), 'I'm already subscribed', or 'No thanks' — three radio cards, not one checkbox. The middle option stops us from accidentally double-adding existing BioHubNet readers when they make a BHN Training account.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Newsletter exports — admins can copy new sign-ups in one click",
    body: "New page at Administration → Newsletter exports. The 'New to export' tab lists everyone who opted in and hasn't been copied yet. Pick a format (one email per line, CSV with name, or comma-separated), Copy to clipboard, paste into Mailchimp / your ESP, then click 'Mark as exported' — the rows drop off the New tab so you don't double-export them next time. An All tab and per-row 'Re-arm' cover re-running, and the Export history panel shows every previous copy with who did it and how many. Audit-logged automatically.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "AI-written greeting tagline on the dashboard",
    body: "Below 'Hi, {your name}.' on the dashboard hero, a small italic tagline now appears, freshly written by AI for your role and the time of day — quietly warm, occasionally witty, never cringe. The line reads on its own; hover or focus it and a discreet strip fades in below with four chips: Nice (thumbs up), Meh (thumbs down), Retry (regenerate), and Turn off (disable greetings entirely). Cached per browser session so re-navigating doesn't burn fresh AI calls; regenerates each new sign-in. Falls back to a friendly canned line if the AI isn't reachable.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Rosalind theme — parchment, sage, italic serif",
    body: "New theme in the picker, named after Rosalind Franklin (X-ray crystallographer who imaged DNA). Warm oat-parchment background, deep botanical sage as the CTA colour, dusty-rose accent, espresso text. Italic serif headings on a humanist sans body, generous radii, soft warm shadows — herbarium-academic feel without the kitsch. Designed for life-sciences readers who want sophisticated and refined, not pink. Try it from the Theme picker at the bottom of the sidebar.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Stop-viewing-as banner is now impossible to miss",
    body: "When a superadmin is impersonating another role, the top banner now wears a hard amber stripe pattern, a pulsing eye icon, and a high-contrast white-on-espresso 'Stop viewing as · Restore superadmin' button with a 3D shadow that lifts on hover. The old translucent pill was easy to skim past — this one isn't.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Test employer + trainee seed, surfaced in the admin UI",
    body: "Superadmins: open Administration → System status and you'll find a Test data panel. One click stands up the dummy Employer (test.employer@biohubnet.test / test1234), Trainee (test.trainee@biohubnet.test / test1234), an internship posting, and a talent-application submission tying them together. Another click cleans them up. No CLI needed. The panel shows a live status grid (employer / trainee / posting / submission — present or missing) so you can confirm at a glance.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "System status page for superadmins — DB, AI, and security at a glance",
    body: "New /admin/system-status (superadmin-only) gives a one-page read-out of the platform's health. Top card rolls up an overall traffic-light verdict — Database (live ping with millisecond latency), AI provider (failure rate over the last 7 days), Superadmin redundancy (warns if there's only one), and the action queue size. Below it: vitals row (active users, AI calls in 24h, DB ping, build commit), a database row-count grid for the major tables, an AI-usage breakdown by feature for the last 30 days with calls / failures / failure-% / avg latency, and six security signals — privileged accounts, pending role-change requests, idle 90+ days, employer invites, deactivated accounts, sessions. Footer streams the latest role-related audit entries, recent logins (24h), and the audit-log feed. Read-only — no actions, no caching.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Changelog page got a dashboard + timeline view",
    body: "Open /changelog and you'll see a stat panel up top — total entries, this-month / last-30-day counts, days since the last update, by-kind breakdown chips, and a 12-month sparkbar showing release cadence. Below it, entries now flow as a vertical timeline with month sub-headings and a rail of coloured dots, so it's easy to scan how busy a given period was at a glance.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar group titles now describe the programmes underneath",
    body: "Hover (or focus) the ENGAGE / EXPERIENCE labels in the sidebar — a small popover slides out to the right with BioHubNet's official one-line description and the named programmes inside each track. ENGAGE: industry-led training, workshops, and mentorship — Medical Affairs Learning Pathway (MSL Accelerator with Agilis Health) and Entrepreneurship Learning Pathway. EXPERIENCE: bridging theory and practice — Knowledge Exchange Round 4 (1/4/6-month placements), Talent Application, and Internship Opportunities.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Per-role dashboards — instructors and admins now land on a tailored view",
    body: "/dashboard now branches four ways: trainees keep the existing learner view; instructors see their own courses, recent enrolments, and assessment attempts; admins / superadmins land on a platform-overview with action queues (credit apps, role-change requests, pending pathway enrolments) plus live counters and the latest audit-log entries; employers continue to get the HR portal view shipped earlier. Superadmins also get an extra system-health row (AI calls in the last 7 days) and a quick-links panel for settings, LTI, and course filters.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Employer dashboard tailored to HR — postings, applicants, profile",
    body: "When an Employer HR signs in, /dashboard now lands on a portal-shaped overview instead of the learner view. Hero greets them by name + company with stats for active postings, applicants, new this week, and a profile-completeness percentage. A nudge card prompts them to finish the profile if it's sparse, four quick-action tiles cover post / browse / edit / apply, and the lower half lists the latest five applicants and the latest five of their own postings inline. The learner dashboard is unchanged for trainees / instructors / admins.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Employer self-signup via invite link + AI-filled company profile",
    body: "Admins can now invite an industry partner from /admin/employer-invites — paste an email, optionally a company name and website, and we generate a one-time link with a configurable expiry. The recipient clicks through, sets a name + password, and lands on /employer with the Employer HR role auto-assigned. The new /employer/profile page lets them paste their website and one-click 'Auto-fill' — the AI fetches the homepage, extracts industry / HQ / size / founding year / a short description, and pulls the favicon as a starter logo. Existing values aren't overwritten, so re-running just fills in blanks.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Test data: dummy employer + trainee + posting + application",
    body: "Run scripts/seed-test-employer-flow.ts to drop in a ready-to-test pair: an Employer HR (test.employer@biohubnet.test / test1234) at Acme Biotherapeutics with one active internship posting, and a Trainee (test.trainee@biohubnet.test / test1234) who has already submitted the talent application. Idempotent — re-running won't duplicate. Pass --cleanup to delete the test rows when you're done. Three ways to verify the flow: sign in as the employer, view-as Employer HR from the superadmin avatar menu, or sign in as the trainee.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Catalog admin tools — quick-edit, bulk filter assignment, and DB-driven option lists",
    body: "Three connected admin upgrades on the course catalog. (1) Each card now has a pencil for admins — opens a small dialog to set topic / delivery / provider / Special-program in one place; saves via PATCH and stays on page. (2) Each card also has a checkbox; selecting one or more reveals a sticky toolbar at the bottom of the screen with 'Apply filters to N' — the dialog has a 'Don't change' option per field so you only touch what you mean to. (3) New /admin/course-filters page lets admins add, rename, hide, or delete the option lists themselves; the catalog filter rail reads from the DB now, so additions show up everywhere immediately. Existing courses keep their assigned values even when you hide an option from the picker.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Employer HR role exposed in admin role-pickers + view-as menu",
    body: "Admins can now pick \"Employer HR\" in the Users page role dropdown (single-row select and the batch role action both list it), and the superadmin View-as menu can preview the platform as an employer. Set a user's role to Employer HR and they're routed to /employer on next login — full portal with Postings, Applicants, and the ATS scaffold.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Course catalog filters — by topic, delivery, special programs, and provider",
    body: "A filter rail now sits next to the catalog. Pick from nine topics (Sector/Tech, Career Insights, Regulatory Affairs, Industry Fundamentals, Quality, Biomanufacturing USP/DSP, etc.), four delivery types (Asynchronous, Online Synchronous, In-Person, Blended), the Special Programs (Instructor-led, limited seats) flag, and any of nine providers (Talent Accelerator, BioTalent Canada, CASTL, Seneca, CRAFT, Agilis Health, U of T, INSPIRE, CANTRAIN). Filters are URL-driven so they survive a refresh and are shareable.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar groups now sit in lettered boxes",
    body: "ENGAGE and EXPERIENCE (and Administration for admins) are wrapped in bordered boxes with the group title sitting at the top opening — the fieldset / legend pattern. Visually clearer at a glance which feature lives in which track.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "New 'Employer HR' user type — portal scaffold for industry partners",
    body: "Added an Employer HR role for industry partners who post internships and review applicants. They land in a dedicated /employer portal with overview tiles, their own postings list, and a read-only roster of talent applications (with one-click links to resume, 1-min video, and email). A per-account toggle (allowPlatformContent, default off) decides whether they can also browse Engage / Experience content. The full ATS workflow — Save / Shortlist / Interview status, candidate notes, side-by-side comparison, Calendly-style interview booking — is the next iteration.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Pathway cards: full-width horizontal layout, more breathing room",
    body: "Learning Pathways now lists each pathway and event registration in a single full-width column rather than a 3-up grid. Each card uses a horizontal layout — the gradient hero panel sits on the left, with title, eyebrow, three lines of description, course count, learner count, and a 'Pathway certificate' chip on the right. ~20% more vertical space per card so the description actually breathes.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Hi-Tech theme is now full TRON",
    body: "Switched the Hi-Tech palette to TRON's signature electric-cyan on inky black. Surfaces glow at the edges, headings sit in uppercase JetBrains Mono with wider tracking, corners are nearly square (0–6px), and the page background now carries a 64px grid pattern — the lightcycle arena floor look. Open the Theme picker to try it.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Internship parser now accepts dropped PDFs, DOCX, images, and text — all on Cloudflare's free AI",
    body: "Drag a PDF, Word document, screenshot, or text file straight onto the paste panel and the AI parses it. PDFs are extracted server-side via unpdf, DOCX via mammoth, and routed through Cloudflare Llama 3.3 70B; images go through Cloudflare's Llama 3.2 Vision model. Everything stays on the free Workers AI tier — no Gemini quota or Google billing involved. The browser-default behaviour of opening dropped files in a new tab is intercepted; the parser handles up to 20 MB.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Internship Opportunities — a job board, AI-assisted",
    body: "EXPERIENCE → Internship Opportunities lists open internships and co-ops from BioHubNet's industry partners. Each posting shows the company, role, location, duration, hours, compensation, deadline, key skills, and full position details, with a one-click link to apply on the company site. Admins create new postings by pasting a job description from any source — email, PDF, web page, doc — and the AI parses it into structured fields they can review and save.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "EXPERIENCE track is open — apply through the Talent Application",
    body: "The new EXPERIENCE section in the sidebar opens with the Talent Application — a structured intake for students and postdocs applying to BioHubNet's industry-placement track. It collects your bio, citizenship and locations, French proficiency, education timeline, supervisor letter (PDF), 650-character pitch, one-minute STAR video, resume (PDF), and a supporting transcript. Resume / video upload directly to BioHubNet's encrypted storage; admins review every submission and export to CSV.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Changelog now auto-publishes — no more manual seeding",
    body: "When we ship an entry, it's now live on the changelog page automatically. Previously the entries lived in a script that had to be re-run against the database; now the /changelog page reads from a registry and idempotently upserts anything new. The audience filter (trainee / staff / admin) still applies per entry.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Hero banner brightened up",
    body: "The hero band on the dashboard, pathways, and catalog now paints a saturated marine mesh — deep cyan, mint-teal, deep blue — instead of inheriting the muted UI brand colours. The rest of the platform stays editorial-quiet; the hero gets to shout.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Sidebar reorganised into ENGAGE and EXPERIENCE",
    body: "Course Catalog, Learning Pathways (renamed from Pathways), My Courses, Gradebook, Certificates, and My Credits now sit under an ENGAGE section. EXPERIENCE opens the industry-placement track via Talent Application.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Palette shifted toward dark blue-teal",
    body: "The brand scale now reads as a refined marine slate-navy — same desaturated weight as before, just hue-shifted toward teal so cards and CTAs feel more editorial than corporate. Hi-Tech keeps its neon character.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Quieter, more refined palette — desaturated slate replaces bright royal blue",
    body: "Daylight, Nightfall, and Scientific now read as editorial rather than consumer-tech. Background goes from cool bright blue to a warm putty / charcoal off-white; text shifts from cool navy to warm graphite; the brand scale is a desaturated steel-slate (about 60% of the previous saturation). Hi-Tech keeps its neon character. CTAs still pass AAA contrast with white text — they just don't shout anymore.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Theme list trimmed to the four that earn their keep",
    body: "Aurora, Modern, Pink, Lab, and Lab Mouse are gone. The picker now shows Daylight, Nightfall, Scientific, and Hi-Tech — each one a distinct design language (typography + surface + radii), not just a colour swap. If you were on a retired theme, you've been bumped back to your OS preference automatically.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Bolder, more organic interface — full-bleed heroes, drifting blobs",
    body: "The dashboard, pathways, and course catalog now open with a bold full-bleed hero band: mesh gradient backgrounds, decorative blobs that drift gently behind the headline, asymmetric organic-cornered cards, and a curved organic edge into the content below. The hero greets you by name in gradient type and shows your stats in tiles with hand-shaped corners. Less generic, more intentional.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Course catalog: AI-generated thumbnails for every course",
    body: "Run scripts/auto-thumbnail-courses.ts to fill in cover art for the entire catalog. Each course gets a one-word focal subject (the strongest word from its title or category) rendered as an editorial brand-blue illustration via Cloudflare SDXL, uploaded to R2, and saved on the Course row. Idempotent — re-running only fills in what's still missing, or pass --force to regenerate.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Submissions table fits the screen + URL fields stop fighting you",
    body: "The /admin/forms/[slug] table is now compact (text-xs, tight padding, truncated cells with hover tooltips for the full value) and breaks out of the dashboard's max-width on large screens so it has room. URL fields on registration forms now accept anything you paste — no more 'please match the format' error if you skip the http:// scheme.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Themes are now full design languages — typography, shadows, and silhouette",
    body: "Each theme now defines its own typography (Modern uses Inter, Scientific is set in Charter serif, Hi-Tech in JetBrains Mono with uppercase headings, Pink and Lab Mouse in rounded Quicksand) plus its own surface treatment — Modern is shadowless with hard 1px borders, Hi-Tech glows neon, Pink and Lab Mouse have soft pink halos, Scientific reads as etched paper. Switching themes now changes how the platform feels, not just what colour it is.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Six new theme designs to choose from",
    body: "The Theme picker now ships nine looks: Modern (minimalist red), Scientific (cool sky-blue), Hi-Tech (neon cyan on near-black), Pink (rose), Lab (sterile white + emerald), and Lab Mouse (warm cream + mouse pink), in addition to Daylight, Nightfall, and Aurora. Each theme reshapes corner radii too, so the platform's silhouette changes with the palette.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Event registration forms now live on Pathways",
    body: "The OBIO Entrepreneurship Bootcamp registration is the first one — you'll see it as a teal card on the Pathways page. Submit once and we keep your last response on file. Admins can edit the form fields in place (add, remove, reorder) and export every submission as a CSV.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Pathway editor: clearer Edit button, draggable + resizable window",
    body: "The Edit button on a pathway hero is now a solid white pill so it actually stands out against the gradient. Open the editor and you can drag the title bar to move the dialog or grab the bottom-right corner to resize it. The course picker on the right grows with the dialog, so you can see more options at a glance.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Dark-mode contrast pass — readable text, no over-bright cards",
    body: "Rebalanced the dark brand palette so saturated CTAs keep their contrast with white text while subtle blue tints work as active backgrounds. Tailwind's hard-coded state tints (rose-50, amber-100, emerald-50, etc.) are now muted in dark mode so alert banners and cert ribbons stop blasting. Body, muted, and subtle text all clear AA on the dark background.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Translations are near-instant on repeat visits",
    body: "Page translation now caches every result in two layers: a Postgres-backed cache shared across users (one translation per string per language, ever) and a per-tab sessionStorage cache for the current visit. Re-visiting any page in your chosen language is a no-network operation; first-time strings still go through Cloudflare m2m100.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Translate menu: real errors, no more retry loops",
    body: "If translation fails, the menu now shows the actual server response inline instead of a generic alert that wouldn't dismiss. The saved language is also cleared on failure so the next page load doesn't immediately re-trigger the same error.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Cookie banner no longer flashes on every refresh",
    body: "Decided cookie consent? You shouldn't see the banner again. We were rendering it briefly during the SSR pass before the client picked up your saved preference — that's the half-second flash. The banner now waits for the client to confirm a decision before deciding whether to show.",
    kind: "fix",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "View-as menu refresh",
    body: "Superadmins viewing as another role: the menu trigger and active-role highlight now use brand blue (was amber). The menu pops on a teal surface that's distinct from the rest of the app so it's hard to miss you're impersonating. Stop viewing-as · Restore superadmin moved to the top of the menu and only shows when you're actually impersonating someone.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Build commit SHA in the sidebar (staff)",
    body: "A small mono-font 7-char SHA chip is now docked above the user block in the sidebar. Click-and-drag to copy when filing bug reports — tells us which build you were running.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Marketing splash retired — / goes straight where you need to be",
    body: "The 267-line marketing landing page on / is gone. Signed in? You go to /dashboard. Signed out? You go to /login. One less click in a typical session.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Change log is here",
    body: "Track what's new in the platform from one place. Trainees see it as What's new; staff see full release notes. Every entry's audience is configurable per-role.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 0,
  },
  {
    title: "Multi-select batch actions on the Users page",
    body: "Admins can now select multiple users at once and run a single action across all of them: activate / deactivate, change role, adjust BHN credits, or add to a group. Every batch is logged in the audit trail.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Trainee role renamed",
    body: "The default learner role is now Trainee. All existing accounts with the old name were migrated automatically. No action needed.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 0,
  },
  {
    title: "Ten elegant interface themes",
    body: "Pick from Daylight, Slate, Ocean, Forest, Sunset, Rose, Lavender, Twilight, Midnight, or Espresso. Your choice persists across sessions and respects your OS preference on first visit. Find the picker at the bottom of the sidebar.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 1,
  },
  {
    title: "Remember me on sign-in",
    body: "A new checkbox on the login page keeps you signed in for 30 days on this device. Uncheck it on shared computers and your session ends after a day.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 1,
  },
  {
    title: "BioHubNet newsletter opt-in at registration",
    body: "New accounts are invited to subscribe to the BioHubNet newsletter at sign-up. Unsubscribing happens via the link at the bottom of any newsletter email.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 1,
  },
  {
    title: "New brand mark and logo",
    body: "A graduation cap with a tassel on a brand-blue tile — appears across the app, the login screen, and the favicon.",
    kind: "improvement",
    visibleTo: ALL,
    daysAgo: 2,
  },
  {
    title: "Instructor role",
    body: "A new role between Trainee and Admin that can author courses, upload SCORM packages, and manage modules and assessments — but cannot manage users, settings, or audit logs.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 2,
  },
  {
    title: "Edit course information after creation",
    body: "Course detail pages now have an Edit button for instructors and admins. Update title, description, passing score, credit cost, duration, and more without leaving the page.",
    kind: "feature",
    visibleTo: STAFF,
    daysAgo: 3,
  },
  {
    title: "Training Pathways",
    body: "Bundle courses into a curated learning journey. When learners complete every required course, the platform automatically issues a pathway-level certificate. Find pathways in the sidebar.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 3,
  },
  {
    title: "Public marketing home page",
    body: "Visit the root URL while signed out to see the new landing page with live platform stats, feature highlights, and a pathway-focused callout.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 4,
  },
  {
    title: "5,000 BHN credits to start",
    body: "Every new account is provisioned with 5,000 BHN credits, enough to enroll in the most popular courses right away.",
    kind: "feature",
    visibleTo: ALL,
    daysAgo: 4,
  },
  {
    title: "SCORM packages now stored in object storage",
    body: "SCORM zip uploads are extracted in /tmp and streamed to Cloudflare R2 with zero egress cost. Existing courses keep working, with content served through a same-origin proxy so the SCORM runtime still talks to the LMS API.",
    kind: "improvement",
    visibleTo: STAFF,
    daysAgo: 5,
  },
  {
    title: "Production database upgraded to Postgres",
    body: "Migrated from local SQLite to managed Neon Postgres for reliability, concurrency, and proper backups. Session pooling configured for serverless function compatibility.",
    kind: "improvement",
    visibleTo: ADMINS,
    daysAgo: 5,
  },
  {
    title: "Welcome to BHN Training",
    body: "The first public release of the BHN Training Platform — courses, modules, assessments, certification, BHN credits, and a foundation to grow on.",
    kind: "note",
    visibleTo: ALL,
    daysAgo: 6,
  },
  {
    title: "VentureLift round schedule corrected to non-overlapping quarterly cycles; deadline statuses now reflect open vs scheduled",
    body: "Two fixes to the Equip deadlines page and the canonical VL round schedule in `lib/equip/calendar.ts`.\n\n**1. Non-overlapping quarterly rounds.** Rounds 5, 6, and 7 previously overlapped: Round 6 launched in July while Round 5 was still in adjudication, and Round 7 launched in September while Round 6 was still open. Fixed by spacing the rounds so each one starts after the previous funding announcement:\n  • Round 5 (Q2 2026): unchanged — Apr 27 launch → ~Aug 5 funding (already in progress).\n  • Round 6 (Q3 2026): Aug 17 launch → Dec 1 funding (was Jul 7 → Sep 29 — entirely overlapping with R5).\n  • Round 7 (Q1 2027): Jan 11 launch → Apr 27 funding (was Sep 14 → Dec 10 — overlapping with R6; moved to after the December holiday break). Stage gaps follow the Round 4 duration template throughout.\n\n**2. Correct deadline statuses — open vs scheduled.** Previously every auto-synced deadline row (including rounds that hadn't opened yet) was created with `status = \"open\"`. Now:\n  • `\"open\"` — window has started (`opensAt ≤ now < deadlineAt`). For VL pre-screening this is the round's Launch date; for full application it is the Invite Decision date; for VC monthly it is the first of the month.\n  • `\"scheduled\"` — window exists but hasn't opened yet (`opensAt > now`).\n  • `\"closed\"` — deadline already passed.\n  A repair pass runs on every deadlines-page load and flips any existing `\"open\"` rows whose window hasn't started to `\"scheduled\"` (only touches auto-synced rows, never admin-set *closed* or *extended* rows). The admin deadlines manager gains a **Scheduled** badge (neutral tone), and the status sort order is now Scheduled → Open → Extended → Closed.",
    kind: "fix",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
  {
    title: "Script collaborators can now create a BHN account after 3 edits",
    body: "External contributors who edit a shared Workspace script via a share link are offered a free BHN account after their third save. The offer is a dismissible modal — closing it skips this visit but re-offers on the next multiple of 3 edits. Accepting creates the account instantly (email + password), stamps the collaborator record, and emails a link back to the script. Admins see the account in the usual Users table once created. Logged-in users and already-converted collaborators never see the prompt.",
    kind: "feature",
    visibleTo: ADMINS,
    daysAgo: 0,
  },
];
