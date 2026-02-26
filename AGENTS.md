Study swarm/PLAN.md to learn about the project specifications

---

# Rules

1. Seek feedback from the system, and create opportunities to get feedback from the system. Tests, linting, typescript, screenshots of visual elements.

2. Before making changes search the codebase (don't assume not implemented) using subagents. You may use up to 500 parallel subagents for all operations but only 1 subagent for build/tests of the app.

3. Important: When authoring documentation (ie JS Doc) capture why the tests and backing implementation is important.

4. Important: We want single sources of truth, no migrations/adapters. If tests unrelated to your work fail then it's your job to resolve these tests as part of the increment of change.

5. You may add extra logging if required to be able to debug the issues.

6. DO NOT IMPLEMENT PLACEHOLDER OR SIMPLE IMPLEMENTATIONS. WE WANT FULL IMPLEMENTATIONS. DO IT OR I WILL YELL AT YOU

7. If you ever need human intervention to complete a task, use a subagent to add concise requirements to human_tasks.md. Include a datetime.

8. Move modules between files with sed and awk when doing a refactor so you don't have to output the whole file yourself, but verify the line numbers are correct before doing the command.

9. SUPER IMPORTANT DO NOT IGNORE. DO NOT PLACE STATUS REPORT UPDATES INTO @AGENTS.md

10. Clean, modular, maintainable design preferred, but not at the expense of accuracy.

11. All error signals are important - Never suppress them for convenience. Never suppress signals (eg ts-expect-error) - They are impoortant feedback that we need in order to audit the codebase.

12. Once you create a feature, if there are front end components involved, read docs/guides/browser.md. Using a playwright-cli browser, take a screenshot of the new feature working and analyze it to confirm. If not, fix it.

13. Never suppress or add ts/eslint error ignores. The feedback is important. Never suppress, only fix.

14. Make professional decisions.

15. Run tests for whatever unit of code was changed. Fix if required.

---
