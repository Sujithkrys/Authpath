# Authpath

**Live:** https://authpath-two.vercel.app
**Repo:** https://github.com/Sujithkrys/Authpath

When a developer builds an AI agent that connects to apps like Slack or Google, they often need to create their own OAuth app with that provider first, and sometimes get it approved. Today that means digging through scattered docs and emailing providers, without knowing if it will take an hour or several weeks.

Authpath gives a short, clear setup guide for any app: how hard it is, how long it takes, what can block you, and which steps an agent can do for you versus which ones you have to do yourself.

## Try it

- **Library:** 8 ready guides (GitHub, Slack, Google, Salesforce, Stripe, Notion, HubSpot, Zoom). Filter by difficulty or approval wait.
- **Generate:** type any app name or website. An agent reads the provider's official docs live and builds a guide. You can watch each step as it happens.
- **Share:** every guide, including generated ones, has its own link.

## How a guide is made

1. **Classify the app.** Is it an OAuth provider, an app without OAuth, an integration platform (like Composio itself), or unclear? Only real OAuth providers get a full guide. The rest get a short, honest card explaining how auth works there instead.
2. **Read official docs only.** Sources must be the provider's own docs, developer, API or help pages. Blogs, marketing pages, tutorials and third-party sites are rejected.
3. **Answer a fixed checklist.** 10 questions every OAuth setup has: where to register, required fields, redirect URI rules, credentials, scopes, review process, review timeline, test-mode limits, rejection reasons and app types. Each answer has a source or says "not found".
4. **Write the steps.** Short steps, one action each, and each tagged "Agent can do" or "You".
5. **Check the claims.** A separate model call compares every claim with the page it cites. Supported claims stay, partly supported ones are marked "not confirmed", and unsupported ones are removed.
6. **Rate difficulty with a fixed rule in code**, not the model's opinion:
   - **Easy:** real users can connect with no review.
   - **Moderate:** works without review, but with limits (user caps, connection caps, rate limits).
   - **Hard:** a review, verification or security assessment is required first.

## Key decisions

- **Honest over complete.** Approval timelines are rarely published, so the guide says "Not published, contact the provider" instead of guessing a number.
- **Every step shows how we know it:** tested myself, from provider docs, or not confirmed.
- **Agent vs. you on every step.** The agent can draft app details, build redirect URIs and pick minimal scopes. Signing in, submitting and waiting for approval stay with the developer.
- **Important decisions are made in code, not by the model.** Early tests gave different answers for the same app on different runs. Moving the difficulty rule and source checks into code made the results consistent.
- **Free to run.** It uses Google Gemini's free tier. Anthropic can be switched on with one setting (`LLM_PROVIDER`) as a backup.
- **Generated guides are saved** (Upstash Redis), so shared links keep working and repeat requests don't use up quota.

## How I checked it

Full details: [docs/verification/summary.md](docs/verification/summary.md)

- Compared generated guides for GitHub, Slack and Google with answer keys written from the official docs: [found X/Y checklist items on average, wrong claims: Z].
- Ran the same apps several times to check the results stay the same: [results].
- The checker kept [X] claims, marked [Y] as not confirmed and removed [Z].
- Problems found during testing and fixed: Slack's docs moved to a new domain, a Postman tutorial's callback URL showed up in Slack's steps, a console link pointed to an address that doesn't exist, and some pages were read in French and German.

## What I learned

- Composio's docs explain how to plug your own OAuth app into Composio, but not how to get one approved by the provider. That gap is the real problem here.
- Approval rules are scattered and rarely give timelines. Google is the hardest (sensitive scopes need verification), while GitHub needs no review at all.
- An AI agent will confidently turn the wrong page into steps. The fix isn't a better prompt. It's strict rules on sources plus an independent checker.

## Run it locally

git clone https://github.com/Sujithkrys/Authpath
cd authpath
npm install
cp .env.example .env.local # add your own Gemini key and Upstash Redis variables
npm run dev


No credentials are included in this repo.

## Limitations

- Gemini's free tier has daily and per-minute limits, so live generation can pause until the quota resets. Library guides and saved guides still work.
- Docs pages that need JavaScript to load can't be read.
- Most providers don't publish review timelines, so many guides show "Not published".
- The library has 8 guides, not 100.
- Library guides come from provider docs.

## With more time

- Use the same pipeline to build and cache all 100 guides.
- Re-check guides automatically when provider docs change.
- Let developers report a wrong step on any guide.
- Test more providers hands-on, including ones with a full review process.
