# NextRole

NextRole is a private job-search workspace. The initial milestone covers account access, professional profiles, immutable resume uploads, and audit activity. The job portal directory lists direct links and current integration capabilities.

## Start locally

1. Install dependencies with `npm ci`.
2. Configure `.env.local` from `.env.example`. Use a MongoDB replica set or Atlas deployment with access to the app database. The deployment must allow connections from the host.
3. Run `npm run dev` and open `http://localhost:3000`. The origin in `APP_URL` must match the address in the browser.
4. Create an account and use Resume Studio to upload a PDF, DOCX, or UTF-8 TXT original up to 5 MB.
5. Set `AI_API_KEY` and an accessible `AI_MODEL` to extract a professional profile. Resume text is sent to the configured provider during extraction. Existing profile fields take precedence. Set `SMTP_URL` and `MAIL_FROM` to enable reset emails.

## Phase 1 implementation

- App pages and forms live in `src/app` and `src/components`. Protected views and private file downloads resolve the member identity from the session cookie.
- `src/services` contains MongoDB access, opaque expiring sessions, bcrypt password hashing, reset tokens, resume extraction, and append-only audit writes. Session and reset tokens are hashed at rest. Updates that require an audit record use a transaction.
- Collections include users, sessions, resetTokens, rateLimits, userProfiles, masterResumes, userPreferences and auditLogs. Users have unique email addresses. Session, reset and rate limit records have expiry indexes. Profile and preferences use the tenant ID as the primary key. Master resumes are separate insert-only records with a SHA-256 digest.
- POST routes under `/api/workspace` handle register, login, logout, forgot, reset, profile, upload, and automation. GET `/api/workspace/download/:id` serves original bytes to the owner. The automation route saves the job-search preference.
- `src/connectors/registry.ts` describes the five portals and direct links. LinkedIn and Indeed support OAuth account linking. Synchronization, recruiter tracking, and submission require separate integrations. [LinkedIn Apply Connect](https://learn.microsoft.com/en-us/linkedin/talent/apply-connect) and [Indeed Job Sync](https://docs.indeed.com/job-sync-api/integrate-with-job-sync-api) describe partner integrations.

## Link portal accounts

Create a LinkedIn developer app with the Sign In with LinkedIn using OpenID Connect product, or obtain an Indeed Partner Console app with job-seeker OAuth access. Add its client ID and secret to `.env.local` using the variables in `.env.example`. Register the exact callback with each provider:

- LinkedIn: `APP_URL/api/portals/linkedin/callback`
- Indeed: `APP_URL/api/portals/indeed/callback`

Replace `APP_URL` above with the NextRole origin accepted by the provider, then restart NextRole. Sign in to NextRole, open Job Portals, choose **Connect account**, and approve the request on the provider's site. NextRole stores the confirmed account identifier and discards provider tokens after retrieving it. **Unlink account** removes the association in NextRole. Naukri, Glassdoor, and Monster are available through direct portal links.

## Remaining milestones

1. Obtain authorized portal access. Extend the registry with independent adapters for authentication, search, normalization, and application operations. Each operation reports a supported, unavailable or user-action-required capability. Scope encrypted credentials and sync history to the user and portal. Use separate retry schedules and rate limits per connector.
2. Run discovery in a persistent worker. Use unique portal source references, canonical job IDs and user-specific match records. Store matching explanations and notify users of eligible results.
3. Store generated resumes and cover letters separately with source resume IDs, job IDs, version IDs and change summaries. Validate generated claims against original evidence.
4. Use persistent queue records for the application workflow. A match can enter awaiting response with a due time two hours after notification. A worker atomically claims the task and rechecks preferences, job availability, score, duplicate submissions and approval. Outcomes include cancelled, ready for user action, confirmed submitted or failed. Use an idempotency key per application and reconcile uncertain submissions before retrying.
5. Add notification delivery, recruiter timelines, history filters, and the advanced intelligence features in the brief. Complete production hardening, including abuse protection, account deletion, comprehensive audit coverage, and deployment verification.

Run `npm run typecheck` and `npm run build` to validate the project.

## Save a LinkedIn posting from Brave

1. In Brave, open `brave://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `browser-connector` directory in this checkout.
3. Sign in to NextRole. Open a LinkedIn job posting, select **Save to NextRole** from Brave's extensions menu, and click **Open in NextRole**.
4. Enter the title and company in Discover Jobs and click **Save job**.

The extension uses temporary access to the active tab after you invoke it. It reads the posting ID from the page URL and passes it to the NextRole instance at `http://localhost:3000`. It requires no OAuth configuration and works one posting at a time.

## Server-side LinkedIn job search

For a deployment with authorized LinkedIn job-search access, configure `LINKEDIN_SEARCH_CLIENT_ID` and `LINKEDIN_SEARCH_CLIENT_SECRET` server-side and restart NextRole. Use a LinkedIn application approved for the client credentials grant and `GET https://api.linkedin.com/v2/jobs/search`. This endpoint matches the public reference repository's implementation. Verify access and the returned format with your LinkedIn integration agreement before deploying.

Signed-in members search in Discover Jobs through `POST /api/portals/linkedin/search` with JSON fields `keywords` and optional `location`. Set `APP_URL` to the deployment's exact public origin. NextRole shares the application's provider authorization, keeps credentials on the server, rate limits each user and the deployment, and keeps a member's saved jobs private. Account identity linking uses separate configuration. The search connector does not retrieve personal recommendations or saved jobs from LinkedIn.

## NVIDIA resume parsing

Set AI_PROVIDER=nvidia and NVIDIA_API_KEY in the server environment. NVIDIA_MODEL defaults to meta/llama-3.3-70b-instruct and can be changed to a compatible model. Restart NextRole after configuration. The key stays on the server. Uploaded resume text is sent to NVIDIA for extraction; output is validated against profile field names and value limits before use. Empty profile fields are filled automatically. Existing values can be replaced through Review details. Use Fill profile on an older upload to run extraction again with the currently configured provider.

Live NVIDIA verification requires a valid API key and model access. Basic text extraction continues when AI is unconfigured.

## LinkedIn MCP transport

Set LINKEDIN_MCP_URL to a trusted Streamable HTTP MCP endpoint and optionally LINKEDIN_MCP_TOKEN to its server credential. NextRole calls search-jobs with keywords and location and validates the returned elements array. This route supports app-level public listings. A server carrying one person's LinkedIn session requires per-user authorization before sharing it with other NextRole users.

The felipfr reference uses stdio and LinkedIn API credentials. A running HTTP MCP deployment or an explicit stdio adapter is required to use it with this connector. No live LinkedIn MCP endpoint is configured or verified yet.

### Connect LinkedIn through Composio

Set COMPOSIO_API_KEY to a project key and COMPOSIO_LINKEDIN_AUTH_CONFIG_ID to the project's managed LinkedIn OAuth config. In the Composio project settings, enable callback identity verification and set its public HTTPS URL to the NextRole origin followed by /api/composio/linkedin/callback. Set APP_URL to that same HTTPS origin. The callback uses the signed-in NextRole session to verify that the return belongs to the user who started the connection.

Open Manage LinkedIn under Job Portals, then choose Connect with Composio. After authorizing, use Verify LinkedIn profile to read the connected account name. Composio manages the OAuth tokens. This flow uses Composio's hosted authorization and direct execution API for its read-only identity tool.

## Additional recommendation sources

Recommended Jobs searches public SmartRecruiters postings from Freshworks, Bosch, and Sutherland alongside the Greenhouse employer boards. The SmartRecruiters search uses up to 100 postings per employer per search. Results are labeled with their source.

For an authorized external feed, set the portal’s `*_JOBS_FEED_URL` and optional `*_JOBS_FEED_TOKEN` from .env.example. NextRole sends GET requests with keywords and optional location query parameters and expects an object with a jobs array. Each job has string fields `id`, `title`, `company`, `location`, and `url`, with an optional `description`. Return up to 500 jobs per request. Include the description to enable NVIDIA resume matching. The endpoint and posting links use HTTPS. Configure only gateways that are authorized to supply listings. Recommended Jobs uses the configured LinkedIn feed when present. Otherwise it uses the existing LinkedIn search connector.
