# RingCentral Voice Cutover Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current SIP/unified voice softphone with a simple RingCentral click-to-dial flow and remove the old Unified Voice implementation.

**Architecture:** Keep the CRM queue, notes, and disposition workflow. The call button should just launch RingCentral with the formatted number, not create or manage an in-app voice session. Anything tied to SIP profiles, SIP auth, or live browser call controls gets removed unless we later do a separate WebRTC project.

**Tech Stack:** React, TypeScript, Vite, Supabase, RingCentral URI scheme

---

### Task 1: Remove the old voice session layer

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\hooks\useAppState.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\services\workspace.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\lib\api.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\types\index.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\package.json`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\lib\softphoneDialing.ts`

- [ ] Remove the SIP client setup, voice-session fetch, and the cleanup code that unregisters or disconnects the softphone.
- [ ] Drop the old Unified Voice fallback names and any profile-based voice session state that only exists for SIP.
- [ ] Keep the CRM call log and disposition state, because that still matters after the cutover.
- [ ] Remove `sip.js` from the client dependencies if nothing else uses it.

### Task 2: Replace call actions with RingCentral launch links

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\pages\ManualDialerPage.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\pages\PreviewDialerPage.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\components\dialer\DialerControls.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\lib\softphoneDialing.ts`

- [ ] Build a small helper that turns the existing formatted phone number into a RingCentral `rcmobile://call?number=...` link.
- [ ] Keep the existing US number formatting rules, then strip the leading `+` before opening RingCentral.
- [ ] Use `tel:` only as a fallback if the RingCentral URI cannot be opened.
- [ ] Remove mute, hold, resume, and other live softphone controls, because there will no longer be an in-app call session.
- [ ] Keep the queue flow, call history, and end-call logging in the CRM.

### Task 3: Remove SIP settings and profile UI

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\pages\SettingsPage.tsx`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\components\layout\AppShell.tsx`
- Delete: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\components\softphone\SipProfileForm.tsx`
- Delete: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\components\softphone\SipProfileSelectorDialog.tsx`

- [ ] Remove the SIP profile section from settings.
- [ ] Remove the blocking profile-selection dialog from the app shell.
- [ ] Delete any leftover "legacy Unified Voice" copy so the UI no longer talks about SIP setup.
- [ ] Keep the rest of the workspace settings page focused on auth, imports, and Supabase status.

### Task 4: Clean up the backend voice surface

**Files:**
- Restore: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\controllers\dialerController.ts`
- Restore: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\controllers\runtimeController.ts`
- Restore: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\repository.ts`
- Restore: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\voiceProviderService.ts`
- Restore: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\sipProfileService.ts`
- Restore: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\services\twilioService.ts`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\src\config\env.ts`
- Reference only: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\dist\controllers\dialerController.js`
- Reference only: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\dist\services\voiceProviderService.js`
- Reference only: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\dist\services\sipProfileService.js`
- Reference only: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\dist\services\twilioService.js`
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\server\.env`

- [ ] Recover the missing backend source tree from the compiled output or the original repo before changing server code.
- [ ] Remove the `voice-session` endpoint and the provider abstraction that only exists to hand out SIP credentials.
- [ ] Delete the old Twilio/SIP/RingCentral-unified voice env handling so the backend stops pretending it manages live browser voice.
- [ ] Keep only the call logging, disposition, and queue APIs that the CRM still needs.

### Task 5: Update tests and smoke test the new flow

**Files:**
- Modify: `C:\Users\Anushi Mittal\Downloads\GCS PROJECTS\crm dialer\client\src\lib\softphoneDialing.test.ts`

- [ ] Replace the SIP-specific tests with small tests for the RingCentral dial URL builder and phone-format edge cases.
- [ ] Run the client build and lint checks after the cutover.
- [ ] Smoke test the main path: select a lead, click Call, confirm RingCentral opens, then save the disposition back in the CRM.
