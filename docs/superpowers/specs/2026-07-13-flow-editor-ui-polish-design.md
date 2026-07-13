# Flow editor (React Flow) UI polish — design

Date: 2026-07-13. Follow-up to the automation/scheduled-flows work; owner asked
to "complete the automation and work on the React Flow UI".

## Goal

Make the canvas a full editor instead of a viewer: everything you can do to an
action (reorder, retype, duplicate, remove) happens on the node itself, plus
orientation helpers (minimap, tidy-layout).

## Changes

### Action node toolbar (nodes/ActionNode.tsx)

- **Real step numbers**: badge shows `3 + index` (trigger = 1, condition = 2),
  not a hardcoded "3".
- **Type select in the header**: the title is now a grouped `<select>` — change
  an action's type in place, keeping node id/pos; `text`/`target` carry over
  when both types have the field. No more delete + re-add.
- **Reorder (← / →)**: swaps the action with its chain neighbor; canvas
  positions swap too so the nodes trade places instead of edges crossing.
  The canvas key includes the ordered action ids, so the remount rebuilds edges.
- **Duplicate (⧉)**: inserts a copy (new id, offset pos) right after; disabled
  at the 5-action cap, like the add-select.

### Canvas chrome (FlowCanvas.tsx)

- **MiniMap** (bottom-right, 140×90, node colors by type).
- **Tidy-up button**: lays out trigger → condition → actions on the existing
  320px grid. Because the canvas is uncontrolled, the button lives inside
  `<ReactFlow>` and writes the new positions into the internal store via
  `useReactFlow().setNodes` *and* persists them through the normal change path,
  then refits the view.
- **Grouped add-action select**: optgroups messages & AI / voice / moderation
  (`ACTION_GROUPS`, exported and shared with the node type select).

## i18n

10 new keys (`commands.action.group.*`, `changeType`, `duplicate`, `remove`,
`moveEarlier`, `moveLater`, `max`, `commands.canvas.arrange`) in all six
locales; the existing i18n-keys parity test covers them.

## Testing

CommandsTab tests: chain numbering + reorder flips select order; duplicate
inserts after the source; in-place type change keeps the shared text field.
