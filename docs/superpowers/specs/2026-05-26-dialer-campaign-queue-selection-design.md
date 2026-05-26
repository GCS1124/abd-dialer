# Dialer Campaign Queue Selection Design

## Goal

Add a campaign selection gate to `/dialer` so the dialer queue always loads against a specific campaign scope instead of the current generic queue. When multiple campaigns are active, the user must choose one every time they open the dialer before any leads load.

The feature should feel native to the existing CRM and should prevent paused campaigns from feeding the dialer queue.

## Scope

- Add a campaign picker gate to the `/dialer` entry path.
- Require a selection every time `/dialer` loads when more than one campaign is active.
- Auto-select the only active campaign when there is exactly one.
- Block queue loading entirely when no active campaigns are available.
- Remove paused campaigns from dialer queue loading.
- Make the queue scope campaign-specific instead of the current generic `default` scope.
- Preserve legacy campaign labeling through `leads.source` so older records still work.
- Clear the current queue and force a re-selection if the selected campaign becomes paused.

## Non-goals

- No campaign CRUD workspace in this change.
- No campaign performance analytics in this change.
- No remembering the campaign choice across page loads.
- No change to the call disposition flow.
- No change to call recording or incoming call behavior.
- No new campaign-specific report pages.

## Key Assumption

This feature uses a hybrid campaign model:

- an authoritative campaign status source provides `active` / `paused`
- `leads.source` remains the legacy fallback for campaign labels and older records

That means the dialer can continue to label and group older data even if a full campaign entity is not present for every historical lead.

## Placement

Primary placement:

- Keep the behavior inside the existing `/dialer` route.

UX placement:

- Render a blocking campaign selector modal above the dialer content before the queue loads. On small screens, the modal can adapt to a full-height sheet.
- The selector should appear every time the page loads if there is more than one active campaign.

## Data And API Contract

The dialer should fetch a campaign list before it fetches queue leads.

Suggested campaign bootstrap response:

```json
{
  "selectedCampaignId": null,
  "campaigns": [
    {
      "id": "cmp_1",
      "name": "Google Ads",
      "sourceKey": "Google Ads",
      "status": "active",
      "leadCount": 42
    },
    {
      "id": "cmp_2",
      "name": "Referral",
      "sourceKey": "Referral",
      "status": "paused",
      "leadCount": 18
    }
  ]
}
```

Suggested queue request shape:

- `GET /queue?campaignId=<id>`
- `POST /queue/advance` with `campaignId=<id>`
- `POST /queue/restart` with `campaignId=<id>`

The exact route names can stay inside the existing `apiRequest()` layer, but the queue must always carry the selected campaign scope once a campaign is chosen.

## Campaign Rules

- Only `active` campaigns may be selected for the dialer queue.
- `paused` campaigns must not contribute queue leads.
- If a campaign is paused while it is selected, the current queue must be cleared immediately and the user must be forced back to campaign selection.
- If there are multiple active campaigns, the selector must appear on every `/dialer` load.
- If there is exactly one active campaign, the dialer may auto-select it and load the queue without user input.
- If there are zero active campaigns, the dialer must not fetch queue leads and should show a blocked empty state.

## Queue Scope Rules

The current queue scope is hardcoded as `default`. This feature should replace that with a campaign-aware scope key.

Recommended scope shape:

- `campaign:<campaignId>` for the selected campaign
- legacy data can still map `leads.source` to the campaign display label

The queue cursor, queue advance action, and queue restart action should all be campaign-aware so one campaign cannot reuse another campaign's position in the queue.

## UX And Layout

### Campaign selector

- Show a blocking modal on desktop and a full-height sheet on mobile when multiple active campaigns exist.
- Show campaign name, optional lead count, and a clear active badge.
- Keep paused campaigns non-selectable.
- Include an explicit empty state if no campaigns are active.
- Add a primary action such as `Load campaign` or `Start dialing`.

### Dialer state after selection

- Once a campaign is chosen, the existing dialer queue UI should load normally.
- The selected campaign should be visible in the dialer header or queue header so the user knows which campaign is active.
- Switching campaigns should reset the queue rather than mixing leads from two different scopes.

### Paused campaign state

- If the chosen campaign becomes paused, the dialer should clear the current lead card and replace it with a campaign-paused state.
- The paused state should tell the user to choose another active campaign.
- The selector should reopen automatically rather than leaving the user in a broken queue view.

## Empty And Error States

- If no active campaigns exist, show a clear blocked state: no queue will load until at least one campaign is active.
- If campaign bootstrap data cannot be loaded, fail closed and do not start the queue.
- If queue loading fails for the selected campaign, show a retryable error instead of silently falling back to the generic queue.
- If the selected campaign has no leads, show the existing empty-queue state, but make it clear which campaign scope is empty.

## Component And State Architecture

Likely implementation surfaces:

- `client/src/hooks/useAppState.tsx`
- `client/src/lib/api.ts`
- `client/src/services/workspace.ts`
- `client/src/pages/PreviewDialerPage.tsx`
- `client/src/pages/ManualDialerPage.tsx`
- new presentational components for the campaign selector and campaign-aware empty states
- optional shared helper in `client/src/lib/campaignQueue.ts`

Recommended state additions:

```ts
interface DialerCampaign {
  id: string;
  name: string;
  sourceKey: string;
  status: "active" | "paused";
  leadCount: number;
}

interface DialerCampaignSelectionState {
  selectedCampaignId: string | null;
  selectedCampaignName: string | null;
  activeCampaignCount: number;
  selectionRequired: boolean;
}
```

Architecture decisions:

- The app should load campaign metadata before loading the queue.
- The queue load should be gated by campaign selection.
- The selected campaign should live in app state so the dialer and manual pages can share the same gate.
- Queue helpers should accept campaign context instead of assuming one global queue scope.
- Legacy `leads.source` should remain available as the display label fallback for older records and reports.

## Responsiveness And Accessibility

- The campaign selector must work on desktop and mobile.
- On small screens, the selector can expand to a full-height sheet.
- Campaign options need keyboard focus states and clear selection affordances.
- The blocking selector should not be dismissible until a valid active campaign is chosen.
- If there are no active campaigns, the selector is replaced by the blocked empty state instead of remaining open.
- The selected campaign should be announced clearly to screen readers.

## Verification

- Opening `/dialer` with multiple active campaigns always shows the campaign picker first.
- Opening `/dialer` with one active campaign loads that campaign automatically.
- Opening `/dialer` with no active campaigns shows the blocked empty state.
- Paused campaigns never appear as valid queue sources.
- Switching campaigns resets the queue scope and cursor.
- Pausing the active campaign clears the queue and reopens the selector.
- Legacy `leads.source` values still show as campaign labels.
- The dialer does not fetch queue leads until a campaign scope is chosen.

## Acceptance Criteria

- The dialer never loads a generic queue when more than one active campaign exists.
- The user sees a campaign choice every time they open `/dialer` in that case.
- Paused campaigns are removed from dialer queue loading.
- Queue leads are scoped by campaign and do not leak across campaigns.
- Existing older campaign labels still display correctly through `leads.source`.
- The behavior is stable across refreshes and route revisits.
