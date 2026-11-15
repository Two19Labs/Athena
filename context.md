# CONTEXT.MD — Multi-Agent Operational Protocol & Project State

> # 🚨 MANDATORY PROTOCOL FOR ALL AGENTS (Antigravity, Claude Code, etc.) 🚨
> 
> **THIS PROJECT IS COLLABORATIVELY BUILT BY MULTIPLE AGENTS.**
> 
> 1. **FIRST ACTION ON EVERY PROMPT (MANDATORY):**
>    * Immediately read this `context.md` file BEFORE writing any code, planning, or executing commands.
>    * Absorb the current architectural decisions, file map, completed milestones, and known constraints.
> 
> 2. **DURING WORK:**
>    * Adhere strictly to the established patterns, directories, and constraints documented below.
>    * Maintain clean git commits and verify all builds and tests before concluding.
> 
> 3. **FINAL ACTION BEFORE CONCLUDING EVERY TURN (MANDATORY):**
>    * Update this `context.md` file with FULL, EXHAUSTIVE context:
>      - What was accomplished in this turn
>      - Exact files created, modified, or deleted
>      - Current system state, verification test results, and dev server status
>      - Git commit hash & remote sync status
>      - Explicit, prioritized next steps for the next agent
> 
> **Failure to read or update this file breaks continuity across agents.**

---

## 1. Project Overview & Current State

* **Repository Remote:** `https://github.com/Two19Labs/Athena`
* **Active Branch:** `main`
* **Local Working Directory:** `c:\Users\adity\Downloads\Athena`
* **Current Status:** **CLEAN SLATE — STARTING FROM ZERO**
  * The entire previous codebase was deliberately wiped clean at the user's directive (`commit 5ac44b1`).
  * Only this `context.md` file and the `.git` directory exist in the workspace.
* **Next Action:** Standing by for the user to provide the new requirements and project instructions.

---

## 2. Multi-Agent Handover Log

| Timestamp | Agent | Action / Changes | Git Commit |
| :--- | :--- | :--- | :--- |
| 2026-11-15 17:38 | Antigravity | Wiped codebase clean to zero per user request; reset repo; established multi-agent handover protocol. | `5ac44b1` |
| 2026-11-15 17:42 | Antigravity | Codified universal Multi-Agent Read-First / Update-Last protocol in `context.md`. | `1492b13` |
| 2026-11-15 17:57 | Antigravity | Verified full access to `C:\Users\adity\Downloads\erp` (`https://github.com/Two19Labs/ERP-Demo`). Ready to reference or port modules as instructed. | PENDING PUSH |

---

## 3. Reference Repositories & External Codebases Available

* **Two19Labs ERP Demo:** Located locally at `C:\Users\adity\Downloads\erp` (remote: `https://github.com/Two19Labs/ERP-Demo`). Full read access is verified across all files, including:
  - `purchase-register.html` & `purchase-register.js`
  - `bill-modal.js`
  - `stock-ledger.html` & `stock-ledger.js`
  - `order-stock.html` & `order-stock.js`
  - `master-data.html` & `master-data.js`
  - `analytics.html` & `analytics.js`
  - `dashboard.html`
  - `alerts.html` & `alerts.js`
  - `style.css`
  - `supabase/` (migrations, edge functions)
  - `TEXTILE_SHOPFLOOR_DIGITIZATION_PRD.md`

---

## 4. Environment & Tooling Guidelines

* **OS:** Windows (PowerShell)
* **Node.js:** Standardize commands using `npm.cmd` (due to PowerShell script execution policies).
* **Git:** Always ensure working tree is clean and changes are pushed to `origin/main`.
* **Testing & Verification:** Every functional addition must include verification steps (build / test) documented in this file.
