# Utsav docs

What each document is, for reviewers. The project README at the repository root covers what the app does, how to run it and how to deploy it.

| Document | What it is | Read it for |
| --- | --- | --- |
| [`product/spec.md`](product/spec.md) | The product specification (v4): personas, the business-needs matrix, information architecture, every AI touchpoint, personalisation rules, the Firestore model and rules, non-functional requirements, wireframes and the test plan | Why each feature exists and the rules the code follows. Code comments cite it as "spec 5.4", "spec 9.1" and so on |
| [`design/design-system.md`](design/design-system.md) | The design system (v3): brand, colour tokens with contrast ratios, type, spacing, components and accessibility rules | How the UI looks and why (WCAG 2.2 AA targets, 44 px touch targets, reduced motion) |
| [`design/design.html`](design/design.html) | The brand board and high-fidelity mockups of every page | A visual reference; open it in a browser |
| [`build-log.md`](build-log.md) | The engineering log: what each build step delivered, the decisions it made, and what it left open | The history of the code and its trade-offs |
| [`qa-report.md`](qa-report.md) | QA rounds: automation, security (penetration test), manual and accessibility passes, with every finding (QA-xx, SEC-xx and so on) and how it was fixed and re-verified | The evidence behind the test suites. Test names cite these finding IDs |
