---
description: description: Systematic debugging workflow – always find root cause before proposing fixes
---

---
description: Systematic debugging workflow – always find root cause before proposing fixes
---

> Core principle  
> No fixes without root-cause investigation. If Phase 1 is incomplete, do not suggest code changes yet.

When the user reports a bug, unexpected behavior, failing test, or performance issue in this project, follow this four-phase process. Work inside Antigravity’s artifacts (Task, Implementation Plan, Walkthrough) and keep everything auditable.

1. Initialize the debugging task
   - Create or update a Task artifact describing the problem.
   - Include: symptoms, location (file/route/component), error messages, and how the bug was discovered.
   - Ask the user for missing details and add them to the Task artifact.

2. Phase 1 – Reproduce and collect evidence
   1. Reproduce the issue in the smallest reliable way.
   2. Capture evidence: failing tests, stack traces/logs, screenshots or browser recordings.
   3. Update the Task artifact with exact reproduction steps and expected vs actual behavior.
   4. Do not propose fixes yet.

3. Phase 2 – Analyze patterns and constraints
   1. Look for patterns (inputs, environments, routes, recent changes).
   2. Separate what is definitely working from what is definitely broken.
   3. Narrow down the suspected subsystem (files, functions, modules).
   4. Summarize this in the Task artifact under “Patterns and constraints”.

4. Phase 3 – Form hypotheses and design experiments
   1. List 2–4 plausible root-cause hypotheses.
   2. For each hypothesis, design a minimal experiment (extra logging, focused test, guard checks).
   3. Create or update an Implementation Plan artifact listing experiments, order, and what result confirms/falsifies each.
   4. Run experiments one by one and record outcomes.
   5. Stop when there is strong evidence for the root cause. If there are multiple causes, handle them one at a time.

5. Phase 4 – Implement fix and verify
   1. Plan the fix only after confirming root cause (minimal changes + regression tests).
   2. Update the Implementation Plan with concrete steps.
   3. Apply the fix and add/update tests.
   4. Run tests and relevant end-to-end checks.
   5. Create or update a Walkthrough artifact summarizing:
      - root cause
      - files changed
      - tests that now pass
      - any screenshots/recordings that prove the fix.
   6. If verification fails, return to Phase 3 and refine hypotheses.

6. Communication and safety
   - At the end of each phase, pause and give the user a short status update.
   - Ask for approval before running destructive terminal commands.
   - If important info is missing, ask instead of guessing.

7. Iron rule
   - If a fix is being proposed and there is no clearly documented root cause in the artifacts, stop and go back to Phase 1 or 2.