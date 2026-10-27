# Fictional-name review log

Every organisation and caller name in `scenarios/` is coined. `pnpm names:check` blocks known real
names (scripts/deny-list). This log records the manual review that the list cannot do.

| Name | Used in | Review | Status |
|---|---|---|---|
| First Meridian Bank | S01, S02, L04 | Required verbatim by picks.json. Web search on 2026-10-20 found no exact-name institution, but "Meridian Bank" (Malvern, PA) exists. | **Open.** Run FDIC BankFind and NCUA exact-name checks before launch and rename on any exact match. |
| Kestrel Ridge Credit Union | S01, S02, L04 | Coined. Not checked against NCUA. | Open (pre-launch check) |
| Bellwick National Bank | S01, S02, L04 | Coined. Not checked against FDIC. | Open (pre-launch check) |
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
