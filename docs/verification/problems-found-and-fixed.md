# Problems found and fixed

Each problem came from a real run or a test. They're grouped by what went wrong.

## Wrong answers

| Problem | Cause | Fix |
|---|---|---|
| Composio got a setup guide as if it were an OAuth provider | Nothing checked what kind of app it was | Added a first stage that classifies the app. Only OAuth providers get a guide. |
| Slack came out "unknown" | `api.slack.com` now redirects to `docs.slack.dev`, and pages on that domain were rejected as unofficial | An official docs URL that redirects brings its new site with it |
| A guide told readers to add Postman's callback URL | Setup answers came from Slack's Postman tutorial | Pages built around third-party tools are skipped, and example values are never presented as yours |
| Google came out Easy for one test run | The checker downgraded the review answer, and the rule treated that as "no review" | A review found by the research can never turn into Easy |
| A suspected gate with no proof came out Easy | The rule fell through to "no review found" | A gate that was suspected but unproven is Unknown. Found by the fake-API tests. |
| Xero's wait was understated | The label kept the first part of a two-part timeline | A timeline label must carry every number in its quote |
| A made-up console link appeared | The model invented `api.slack.dev` | Every console and step link is loaded, and any that fails is dropped |

## Weak research

| Problem | Cause | Fix |
|---|---|---|
| GitHub found only 2 of 6 setup items | The model read pages through a tool we couldn't see into, and answered lazily | We download the official pages and give the model their text |
| Sidebar menus crowded out page content | Docs pages open with long menus that matched the keywords | Only a page's main content is used |
| The "Creating an OAuth app" page was never read | Home pages took half the reading slots, and folder names lifted unrelated pages | All pages compete on topic, and a page's own name counts most |
| Slack's setup came from SDK tutorials | Tutorials ranked as high as the main docs | Main OAuth and registration pages rank first; tutorials, quickstarts and samples rank last |
| Google's strict rules were missed | Brand-verification pages outranked scope-verification pages | Words like "sensitive" and "restricted" now rank higher |
| The approval stage answered "unknown" for Calendly | It never saw the registration page | That page is always read at that stage |

## Bad sources

| Problem | Cause | Fix |
|---|---|---|
| Blog, use-case and marketing pages were listed as sources | Page finding matched words like "review" anywhere in a URL | Whole-word matching, and those paths are blocked |
| A stranger's pull request on github.com was read | A main site also hosts user content | User-content paths are blocked, and on a main site only docs sections count |
| Translated pages used up reading slots | `/es/`, `/ja-jp/` and `?hl=fr` copies looked like separate pages | Non-English copies are skipped, and pages are requested in English |
| Slack's legacy docs were cited | Nothing excluded them | Legacy, deprecated and archived paths are blocked |
| Postmark's card cited two-factor login articles | "Authentication" matched account-login help | Account help is excluded, and card sources must be about API keys, tokens or auth headers |
| Xero's real quote was thrown out | Its security page doesn't mention client IDs | Review-type claims may cite pages about app review or certification |

## Difficulty

| Problem | Cause | Fix |
|---|---|---|
| The rating changed from run to run | It followed the single gate the model picked | The model reports every gate it finds, and code picks the strictest one with a quote |
| GitHub rated Moderate for an optional Marketplace review | The old rule counted any listing review | New rule: can real users connect at scale without a review? Optional listings don't count. |
| Too many "Unknown" ratings | "Partly confirmed" was treated the same as "no evidence" | A real quote gives a best estimate labelled "not fully confirmed". Unknown is only for no supporting quote. |

## Reliability

| Problem | Cause | Fix |
|---|---|---|
| Runs stalled until the 270-second limit | Free-tier calls sometimes hang | Calls time out after 35 seconds |
| A busy model failed the whole run | Only one backup model, and it was often busy too | Three models are tried in turn, and each has its own daily quota |
| A used-up daily quota was a dead end | It only showed an error | The page says when generation returns and links what still works |
| Testing used up the live quota | One key for everything | `GEMINI_API_KEY_DEV` serves local work. It must be in a different Google Cloud project, because limits are per project. |
| The cache served "unknown" results for 7 days | Every result was cached | Unknown results are retried |

## Honesty

| Problem | Cause | Fix |
|---|---|---|
| GitHub and Slack were marked "Tested hands-on" | They came from the original mockup | Both are now "From provider docs", until someone actually creates those OAuth apps |
| Library guides were never fact-checked | They began as sample content from the mockup | GitHub, Slack and Google were checked against the answer keys and corrected; every library source now opens a specific official page that returns 200 |

## Library guide corrections

| Guide | What was wrong | Now |
|---|---|---|
| GitHub | Said the client secret is shown only once (the docs don't say this); both sources pointed at the same index page | Generate the secret on the app's settings page; three specific source pages |
| Slack | No redirect rules or PKCE; no mention of the limits on unlisted apps; wait "Days–weeks"; sources on the old domain | HTTPS and no `#` in redirect URLs, PKCE optional, the rate limits on unlisted apps as a blocker, wait "Up to 10 weeks"; five docs.slack.dev sources |
| Google | Old console navigation; no reason for the Hard rating; wait "Weeks" | Google Auth Platform clients, the secret shown only once, the 100-test-user cap, a scope-verification reason, wait "Up to 6 weeks"; five official sources |
| Salesforce | Its only source went to the help home page | An External Client Apps article and the security review guide |
| HubSpot, Notion, Zoom | Sources went through redirects | Their final addresses |
| Stripe | Nothing | Unchanged |
