# Conversation Waiting Timeout

## Business Rules

- Seller inactivity timeout (`inactivityTimeoutMinutes`):
  - Applies while conversation is `IN_PROGRESS` (or legacy `OPEN` normalized to `IN_PROGRESS`).
  - If customer is waiting and seller does not reply within the timeout, conversation returns to `WAITING`.
- Waiting auto-close timeout (`waitingAutoCloseTimeoutMinutes`):
  - Applies while conversation is `WAITING`.
  - If elapsed, conversation is closed automatically as `UNANSWERED`.
  - No outbound message is sent during this automatic close.

## Source of Truth (Backend)

- Workflow logic: `backend/src/modules/conversations/conversation-workflow.service.ts`
  - `registerInboundActivity`: updates waiting tracking (`waitingSince`) and status transitions after customer inbound events.
  - `processWaitingTimeouts`: executes both timeout stages (return to `WAITING`, then auto-close as `UNANSWERED`).
- Scheduler/worker trigger: `backend/src/modules/conversations/conversation-automation.service.ts`
  - Runs every 60s with Redis distributed lock to prevent duplicate processing across instances.
- Settings persistence/validation: `backend/src/modules/workspace-settings/workspace-settings.service.ts`
- Settings API DTO validation: `backend/src/modules/workspace-settings/workspace-settings.controller.ts`

## Data Model

- `WorkspaceConversationSettings.waitingAutoCloseTimeoutMinutes` (optional, minutes).
  - `null` means disabled (safe fallback).
- `Conversation.closeReason` (`MANUAL` or `UNANSWERED`).
  - `UNANSWERED` is set only by automatic waiting timeout close.

## Frontend Configuration

- Screen: `frontend/app/(app)/app/fluxo-de-atendimento/page.tsx`
  - Field: `Encerramento automatico no AGUARDANDO`.
  - Unit: minutes.
  - Empty value disables waiting auto-close timeout.
- Display badge:
  - `frontend/app/(app)/app/inbox/page.tsx`
  - Closed conversations with `closeReason=UNANSWERED` are shown as `Nao respondido`.

## Test Coverage

- `backend/src/modules/conversations/conversation-workflow.service.spec.ts`
  - Return to `WAITING` after seller inactivity timeout.
  - Auto-close `WAITING` as `UNANSWERED` after configured timeout.
  - No premature close before threshold.
  - Disabled waiting timeout does not auto-close.
  - Idempotency across repeated timeout runs.
  - Inbound transitions for `IN_PROGRESS` and `CLOSED` reopen behavior.
- `backend/src/modules/integrations/meta-whatsapp/meta-whatsapp.service.spec.ts`
  - Automatic message behavior and cooldown validations.
  - Closed 24h window template behavior validations.

## Regression-Safe Validation Checklist

- Ensure Redis is available for lock-based timeout job execution.
- Ensure migration is applied before backend start.
- Verify workspace settings payload includes both timeout fields.
- Verify no call path from waiting auto-close to outbound sender methods.
- Verify reopened conversations clear `closeReason`.
