# Fictional-name review log

Every organisation and caller name in `scenarios/` is coined. `pnpm names:check` blocks known real
names (scripts/deny-list). This log records the manual review that the list cannot do.

| Name | Used in | Review | Status |
|---|---|---|---|
| First Wrenfield Bank | S01, S02, L04 | Renamed from "First Meridian Bank" on 2026-11-04. FDIC BankFind API (institutions and history, substring `*MERIDIAN*`) returned 14 institutions and 448 history rows, including the active Meridian Bank (Malvern, PA); Meridian Credit Union (Ottumwa, IA) is a US credit union. Substring `*WRENFIELD*`: 0 institutions, 0 history rows. A web search for "Wrenfield" bank, credit union or financial found nothing. The NCUA locator itself (a JavaScript app) was not queried. | Cleared (FDIC, web search) |
| Kestrel Ridge Credit Union | S01, S02, L04 | Coined. FDIC BankFind `*KESTREL*`: 0 institutions, 0 history rows (2026-10-28). Web search for the exact name, 2026-11-04: no result. NCUA locator not queried. | Cleared (FDIC, web search) |
| Bellwick National Bank | S01, S02, L04 | Coined. FDIC BankFind `*BELLWICK*`: 0 institutions, 0 history rows (2026-10-28). Web search for the exact name, 2026-11-04: no result. | Cleared (FDIC, web search) |
| Federal Tax Recovery Unit | S04 | Invented agency; no such US federal agency. | Reviewed |
| National Benefits Administration | S05 | Invented agency. | Reviewed |
| Senior Health Coverage Office | S06 | Invented office. | Reviewed |
| Brightwire Computer Help Desk | S07 | Coined. | Open (trademark search pre-launch) |
| Larkspur Subscriptions | S08 | Coined. | Open (trademark search pre-launch) |
| Parcelwise Delivery | S09 | Coined. | Open (trademark search pre-launch) |
| Tollan Valley Power & Light | S10, L07 | Coined. | Open (trademark search pre-launch) |
| Grand Harvest Sweepstakes Clearing | S11 | Coined. | Open (trademark search pre-launch) |
| Alder Lane Pharmacy, Riverbend Family Clinic, Northgate Dental, Fernhill Public Library | L01, L02, L05, L06 | Coined; generic local-business style. | Open (pre-launch search) |
| Phone numbers | all | Only (NXX) 555-0100 to 555-0199, enforced by schema and `names:check`. | Enforced |
