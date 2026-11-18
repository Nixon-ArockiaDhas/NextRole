# NextRole rework

## Current audit

The current application uses Next.js App Router, strict TypeScript, MongoDB, cookie sessions, bcrypt, Zod, PDF text extraction and Mammoth DOCX extraction. Retain these technologies and evolve collections with versioned migrations.

Implemented foundations include registration, login, password reset delivery when SMTP is configured, private original resume storage with hashes, editable profiles, basic text extraction, optional AI extraction, account linking endpoints, private saved LinkedIn postings and audit events.

The LinkedIn search adapter was copied conceptually from an unverified community endpoint. Its simulated tests establish local behavior only. Successful real discovery has not been demonstrated. OAuth identity linking does not establish discovery or submission access. Portal authorization, discovery, profile access, application submission and synchronization health must each have independent states.

Missing functionality includes DOC parsing, structured employment and education records, extraction conflict review, verified profile approval, semantic matching, generated documents, applications, persistent background tasks, notifications, account deletion, encryption configuration, onboarding and production deployment.

## Implementation sequence and acceptance gates

1. Foundation
   - Expand candidate fields, then move repeated employment, education, certifications and skills into structured records.
   - Record extraction provenance and conflicts against existing user edits. Provide review and approval before changing verified facts.
   - Add DOC extraction using a bounded document-conversion worker. Test PDF and DOCX with real representative files.
   - Build onboarding through resume upload, review, preferences, connections and automation consent.
   - Pass tenant-isolation, original-byte preservation, upload failure and profile-review tests.

2. Integrations
   - Define independent adapters and capability results for LinkedIn, Indeed, Naukri and Glassdoor.
   - Obtain and verify the actual approved integration contract before enabling discovery or submission.
   - Store authorization status independently from successful synchronization and its timestamp.
   - Normalize jobs, preserve source references, deduplicate with stable provider IDs and retain per-user actions.
   - Implement a durable MongoDB task queue with leases, retry deadlines and per-connector circuit breakers.
   - Require real listings and independent connector failure tests before completion.

3. AI intelligence
   - Centralize configurable providers, including NVIDIA NIM after verifying model and structured-output support.
   - Keep provider secrets on the server. Track per-user usage, timeouts and costs when available.
   - Combine semantic similarity with explicit experience, salary, location and qualification constraints.
   - Store explainable scores and missing evidence. Mark facts separately from model assumptions.
   - Generate separate resume and cover-letter versions linked to the original and target job.
   - Require source-evidence validation and user review of rewritten claims.

4. Applications
   - Add application details, evidence, exact document references and event history.
   - Require a provider confirmation before Applied. Record external visits as Viewed Only.
   - Provide guided application preparation when submission is unsupported.
   - Make submitted document versions immutable and test duplicate prevention and uncertain outcomes.

5. Automation
   - Default to Manual Application Only. Persist Approval Required or Auto Apply After Two Hours only after an explicit user choice.
   - Queue two-hour tasks on the server. Claim atomically and recheck current consent, availability, qualification threshold, limits and duplicate status.
   - Require specific stored answers or user intervention for sensitive declarations.
   - Add in-app delivery first, then web/mobile push and optional email with quiet hours and deduplication.
   - Test worker restart, expired leases, cancelled tasks and ambiguous submission reconciliation.

6. Production readiness
   - Use private durable storage and a verified database deployment. The current temporary local database is a development dependency.
   - Complete account/resume deletion, retention controls, credential encryption and data-processing disclosures.
   - Add security and load testing, operational monitoring, backups and recovery verification.
   - Run all ten acceptance workflows against real authorized integrations before declaring the product complete.

## Database evolution

Add schemaVersion to evolved documents. Every private record must contain the authenticated userId. Introduce jobs and jobSources for normalized source data, userJobMatches for private scores and decisions, resumeVersions and coverLetters for generated documents, applications and applicationEvents for lifecycle history, notifications and automationTasks for durable work, and aiUsageLogs for usage. Use unique compound keys for source IDs, user-job application attempts, notification events and task idempotency.

## External dependencies

LinkedIn and Indeed OAuth credentials require developer registration. Discovery requires separately verified access. No approved live job-search or submission credentials are currently available in this workspace. NVIDIA/other AI credentials, SMTP, push configuration and a stable deployment origin are also external setup dependencies.

## Current increment

Expanded profile fields for professional summary, achievements, languages, awards and publications. Extraction now includes these fields, and the profile editor renders all fields by explicit sections. The complete product remains in progress.
