# KYS shared business logic

Single source for pricing, schedules, installment FIFO, and client parsing.

Consumers:

- `frontend/src` (Vite)
- `supabase/functions/kys-api/lib` (Deno)
- `scripts/` (Node import)

Google Apps Script is deprecated and not kept in sync with this folder.
