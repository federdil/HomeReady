# HomeReady — CEO/Founder Strategic Assessment
**Date:** June 2026  
**Assessor perspective:** First-time CEO/Founder stress-test  
**Status of product:** MVP complete, pre-launch  

---

## The One-Sentence Verdict

HomeReady has solved the hardest part of a startup — building something real — but has deferred the three decisions that will determine whether it becomes a business: how it makes money, how it acquires users, and whether its most valuable features are legally permissible.

---

## What Has Been Built (Honest Inventory)

The technical execution is genuinely impressive for an early-stage project. All eight P0 features are shipped and deployed on a solid stack (React / FastAPI / Supabase / Anthropic). The neighbourhood intelligence agent — which calls live public APIs (TfL, Environment Agency, Ofsted), runs an agentic Claude loop, and streams results in real time — is the most technically differentiated feature and represents real engineering work that isn't trivially replicable. The PRD is well-structured, the competitor analysis is accurate, the UI revamp shows awareness of trust signals that matter for a financial product.

So the product is real. The question is whether it's a startup.

---

## Section 1 — Assumptions Being Made (and Whether They Hold)

### Assumption 1: "400K first-time buyers/year is a large enough market"

**Challenge:** It's large in absolute terms, but the relevant question is the serviceable addressable market on day one. 400K/year is a flow — not a stock. You are not selling to 400K people who persist as customers; you are selling to a pool that completely refreshes every 12–18 months. Every single user eventually leaves the product permanently (they complete and become homeowners). Your retention ceiling isn't defined by product quality — it's defined by the duration of the home-buying journey. This changes every unit economics assumption.

**The question you should be able to answer:** What is the maximum revenue a single user can generate in their 12–18 month lifecycle? Multiply by realistic conversion rates. Does that number justify the business?

### Assumption 2: "No single product owns the end-to-end journey — so we will"

**Challenge:** The reason no product owns the end-to-end journey is not because nobody has tried. It's because the incentive structures make it extremely hard. Rightmove is funded by estate agents (seller side). Solicitors are paid by the hour and have no interest in their clients understanding documents faster. Mortgage brokers are paid by lenders. Every incumbent in this market has a financial incentive to preserve information asymmetry. HomeReady's value proposition directly attacks that asymmetry — which means every incumbent is a potential adversary, not a potential partner.

**The question you should be able to answer:** If Rightmove sees HomeReady gaining traction in the legal/document space, what stops them from building it in six months? What is Rightmove's incentive not to?

### Assumption 3: "AI will give us a moat"

**Challenge:** The listing decoder, document explainer, and survey interpreter are all prompting Claude with structured inputs and outputs. A sophisticated user can already do every one of these things by pasting content into ChatGPT or Claude.ai directly. The differentiation is: (a) the UX is purpose-built and structured, (b) the product knows where you are in your journey, and (c) the neighbourhood agent uses live APIs. Of these, (a) and (b) are reproducible by any well-resourced team in 8–12 weeks. Only (c) is genuinely proprietary work. That is a thin moat for the entire product.

**The question you should be able to answer:** Why is HomeReady 10× better than asking Claude directly? Not "more convenient" — 10× better. If the answer is "we have a nicer UI and remember your journey," that's a feature, not a moat.

### Assumption 4: "Word of mouth will drive 40% of new signups within 12 months"

**Challenge:** This is a goal, not a strategy. Word of mouth in this category is real — people who just bought their first home do talk about it. But the timing problem is severe: by the time a user is thrilled enough with HomeReady to recommend it, their friends who might benefit are either (a) not yet buying, (b) already mid-process, or (c) buying in a different year. The referral loop in a 12–18 month, once-in-a-lifetime purchase is structurally slower than in a product people use daily or monthly. 40% WOM is an aspiration; there is currently no acquisition strategy behind it.

**The question you should be able to answer:** Where do first-time buyers congregate before they start their search? What is the specific channel (subreddit, forum, newsletter, community, employer benefit) through which you will acquire your first 500 users, and what is the plan?

### Assumption 5: "The product will be B2C"

**Challenge:** This assumption is never stated in the PRD — which is itself the problem. The entire product has been built for B2C (individual buyers sign up, use it, complete). But the natural acquisition advantage in this market is B2B. There are approximately 12,000 FCA-authorised mortgage brokers in the UK. If HomeReady signed 500 of them as distribution partners — each giving HomeReady access to their clients at the moment of mortgage appointment — you would reach 50,000+ FTBs per year without spending a pound on consumer marketing. The broker gets a value-add to offer clients; you get distribution without CAC. This model is not mentioned anywhere in the PRD, pitch deck, or market research.

---

## Section 2 — Critical Gaps

### Gap 1: No Monetisation Model

This is the single most urgent thing to resolve. The PRD lists "what is the monetisation model?" as an open, non-blocking question. It is not non-blocking. It is the most blocking question in the entire business because:

- It determines which features are free and which are paywalled
- It determines the CAC you can afford
- It determines whether the AI inference costs (which are real and scale with usage) are sustainable
- It determines whether you need FCA authorisation before charging for certain features

The options are meaningfully different from each other:

| Model | Implications |
|---|---|
| Freemium (limited features free) | What's paywalled? If the most valuable features (document explainer, offer coach) are behind the paywall, legal risk applies before you charge. If basic features are paywalled, conversion will be low. |
| Subscription (e.g. £9/month) | At 12–18 months average lifecycle, maximum LTV is £108–162. With any meaningful CAC, this barely works. |
| One-time purchase (e.g. £49 flat) | Cleaner unit economics. No recurring revenue to model against. |
| B2B (broker/solicitor license) | Strongest model for distribution + unit economics. Not currently considered. |
| Freemium + referral marketplace | The regulatory risk of recommending professionals is high and explicitly called out in non-goals. |

**This needs to be decided before any further product investment.**

### Gap 2: Legal Exposure is Existential, Not Cosmetic

Two questions are listed as "blocking — must resolve before launch" in the PRD. They have not been resolved:

1. **Does explaining legal documents in plain English constitute regulated legal advice under the Legal Services Act 2007?**

   The document explainer and survey interpreter are the most clearly differentiated features. They are also the features most likely to constitute "the provision of legal services" under Schedule 2 of the LSA 2007. The "we're just summarising, not advising" defence is weak — if a user acts on a HomeReady document summary and suffers loss (e.g., they miss a material covenant that HomeReady's summary didn't flag), the question of whether a legal duty of care exists is live. A prominent disclaimer helps but does not eliminate liability exposure.

2. **Does the negotiation coach trigger FCA financial promotion rules?**

   The negotiation coach generates "tailored negotiation scripts" with "recommended offer ranges" and "walk-away prices." This is close to — and in some interpretations is — investment advice or financial promotion. The FCA's position on AI-generated financial guidance is evolving rapidly in 2025–26. The Mortgage Eligibility Estimator (R-11, planned) explicitly notes this risk but the negotiation coach, which is already built and listed as Done, has the same exposure.

**The correct action is to instruct a specialist PropTech regulatory lawyer (not a general commercial solicitor) and get written opinions on both questions before launch.** Not after. Not "during build."

### Gap 3: Stage 5 (Exchange & Completion) is Entirely Missing

You cover Stages 1–4 and Stage 6. Stage 5 — the period between offer acceptance and getting the keys — is the most opaque and most anxiety-inducing part of the entire journey for most buyers. Chain breaks account for 40%+ of UK sales falling through. The PRD defers this to v2.0 with chain monitoring listed as P2. This creates a gap exactly where buyer stress is highest and where a product could most visibly save someone money (avoiding abortive legal fees from a chain break).

### Gap 4: Comparable Price Analysis is Missing at Offer Stage

The Offer Strategy page is built and listed as Done. But R-08 (comparable price analysis — "is this asking price fair?") is listed as P1/Planned. You are coaching buyers on their negotiating strategy without giving them the single most important input: whether the price they're negotiating from is anchored correctly. The Offer Strategy feature, in its current state, is advice without the most critical data. Land Registry lag (3–6 months) is real, but even lagged comps are better than none, and Zoopla/Rightmove sold prices are available.

### Gap 5: No User Research Evidence in the PRD

The PRD has 14 problem statements, 8 completed features, and detailed success metrics. It does not cite a single real user conversation, interview, or piece of qualitative research. The problems are well-described and ring true — but they are described from the perspective of someone who has researched the market, not someone who has watched 30 first-time buyers try to use the product. The difference matters enormously: you will discover which features people actually use, which ones confuse them, and which problems are painful enough that they'd pay to solve them only once real users touch it.

**Before writing more code, talk to 20 complete strangers who are actively buying their first home. Ask them to use the product for 30 minutes while you watch. You will learn more from that than from a month of feature building.**

---

## Section 3 — The Direct AI Threat (The Underacknowledged Risk)

The competitor matrix in the market research compares HomeReady against Rightmove, Zoopla, Jitty, MoneyHelper, and a handful of legal-AI tools. It does not compare HomeReady against Claude.ai, ChatGPT, or Gemini.

This is the actual competitive threat. Not Jitty.

A first-time buyer who discovers they can paste their survey report into Claude.ai and get a plain-English breakdown for free will not pay HomeReady for the same thing. The homebuying subreddits (r/HousingUK, r/FirstTimeBuyer) already have threads where people do exactly this. The question "what makes HomeReady 10× better than using Claude directly?" has no satisfying answer in the current product.

The honest answer to this question, right now, is:
- HomeReady has a structured, purpose-built UX (good, but not 10×)
- HomeReady remembers your journey and connects features together (genuinely valuable, but users could achieve this with a persistent Claude conversation)
- HomeReady's neighbourhood agent calls real APIs you'd otherwise have to query manually (this is the strongest answer — real data + synthesis in one place)

The neighbourhood agent, the journey continuity, and the property shortlist are the features that are hardest to replicate with a general-purpose LLM. These should be the strategic core of the product. The document explainer and listing decoder, while useful, are closest to commoditisation.

---

## Section 4 — Unit Economics (Back of the Envelope)

This has not been modelled. Let's do it:

**Revenue side:**
- UK FTBs per year: ~400,000
- Realistically addressable (have internet, are in discovery phase, find HomeReady): let's be optimistic at 5% → 20,000 potential users/year
- Conversion to paid (assuming freemium): 10% → 2,000 paying users/year
- Revenue per user at £9/month × 14 months average: £126 → total revenue: £252,000/year

**Cost side (minimum viable):**
- Claude API costs per active user: neighbourhood agent alone (8–15 API calls, streaming) might cost £0.50–£1.00 per query. If a user runs it 3× across their journey plus document analyses, legal explainers, offer strategy: estimate £5–10 in AI inference per user across their lifecycle.
- At 2,000 paid users: £10–20K in inference costs
- Engineering (1 person): ~£80K/year
- Legal compliance: £15–30K (one-time for regulatory opinions + ongoing)
- Infrastructure: £5–10K
- Marketing: whatever's left → almost nothing

This is a very challenging business to reach profitability as a B2C SaaS. The numbers improve dramatically under a B2B model (charging £500–£2,000/year per broker for unlimited client access).

---

## Section 5 — What's Genuinely Strong

These are not throwaway compliments. They matter strategically:

**1. The problem is real and well-documented.** The pain points described in the PRD are accurate. This is validated by the volume of first-time buyer communities on Reddit, MSE, and YouTube. The market exists.

**2. The neighbourhood agent is a genuine differentiator.** Live API calls (TfL, flood risk, Ofsted), synthesised in real time by an agentic loop, streamed to the user — this is not something a user can easily replicate by themselves. It's genuinely useful and technically interesting. This should be the hero feature, not a tab in a sidebar.

**3. The codebase is production-quality.** FastAPI, async SQLAlchemy, Alembic, Supabase Auth, Vercel + Railway — this is a sensible, modern stack with no obvious technical debt. The service/prompt separation is clean.

**4. Legal awareness is present.** The PRD explicitly calls out the regulatory risks. Most early-stage founders ignore this until they have a problem. The fact that it's flagged (even if unresolved) means there's awareness of the risk surface.

**5. The UI revamp shows the right instincts.** For a product handling one of the most stressful financial decisions in a person's life, trust signals matter enormously. The decision to move away from glassmorphism, introduce typographic hierarchy, and encode severity visually is exactly correct. A first-time buyer uploading their legal documents needs to feel like they're using a serious tool, not a student project.

---

## Section 6 — The 10 Questions to Resolve Before Launch

These are listed in order of urgency:

1. **Monetisation:** What is the pricing model, which features are free vs. paid, and what is the expected LTV of a single user? This must be answered before launch.

2. **Legal opinion:** Have you paid a specialist PropTech/regulatory lawyer for written opinions on the document explainer (LSA 2007) and the negotiation coach/mortgage estimator (FCA financial promotions)? If not, do not launch these features publicly.

3. **User research:** Have you watched 20 complete strangers use the product? Not friends, not family — strangers who are actively buying a home right now. If not, do this before the next line of code.

4. **Willingness to pay:** Have you tested whether users will pay, at what price, and for which specific features? (Put a paywall on one feature for one week and measure what happens.)

5. **Distribution channel:** What is the specific, named acquisition channel for your first 500 users? Not "word of mouth" — name the forum, the newsletter, the broker partnership, or the community.

6. **B2B exploration:** Have you had a single conversation with a mortgage broker or conveyancer about whether they'd pay to offer HomeReady to their clients? If not, have three conversations this week.

7. **Differentiation from raw LLMs:** Can you articulate, in one sentence, why HomeReady is better than asking Claude directly? If the answer is only "convenience," that's insufficient for a paid product.

8. **Stage 5 gap:** When will Exchange & Completion support be added, and why was it deferred given it's the highest-anxiety stage for buyers?

9. **Comparable price data:** What is the plan for R-08, and why is the Offer Strategy feature live without it? Is the current offer advice being given without comp data an acceptable interim state?

10. **Rightmove defence:** If Rightmove launches an AI assistant that does 60% of what HomeReady does, what is your response?

---

## Section 7 — Strategic Recommendation

The current strategy is: build a broad consumer product and rely on word of mouth to acquire users. This is the hardest go-to-market path for this category.

The stronger strategy, which is available without rebuilding anything, is:

**Phase A — Find the wedge feature** (next 4 weeks)  
Pick the single feature that is most undeniably useful, hardest to replicate with a general LLM, and that users would clearly pay for. Based on what's built, the candidate is the neighbourhood agent. Make it exceptional — not one tab among many, but the hero product. Everything else is secondary.

**Phase B — Establish a distribution channel** (next 6 weeks)  
Identify 10 mortgage brokers or independent financial advisers who work with first-time buyers. Offer them white-label or partner access to the neighbourhood agent + journey tracker. If they say yes and use it with clients, you have product-market fit and distribution simultaneously. If they say no, you learn something important about the B2B model before spending further.

**Phase C — Resolve the legal questions and set a price** (next 8 weeks)  
Pay for specialist regulatory counsel. Launch with a clear pricing model — even a simple one — so you can measure actual willingness to pay. The worst outcome is a product that gets thousands of users but cannot monetise because the most valuable features require FCA authorisation.

**Phase D — Double down on what works** (post-launch)  
The PRD's phasing (v1.1, v2.0, v3.0) is feature-led rather than market-led. Let user behaviour — not the roadmap — determine what gets built next.

---

## Closing Note

The right comparison for HomeReady is not "does this solve a real problem" (yes, clearly) or "is this technically impressive" (yes, for an early-stage product). The right comparison is: **of all the ways a skilled founder could spend the next 12 months, is building a B2C app for UK first-time home buyers the highest-leverage path?**

That answer depends almost entirely on the monetisation model and the legal verdict on the document and advice features. Both are currently unknown. Everything else — the tech, the design, the feature set — is solvable. These two are not automatically solvable. They require deliberate action before the product goes any further.

The bones are good. The business model isn't visible yet.

---

*Assessment based on review of: HomeReady_PRD.html (v1.1), homeready-market-research.html, tracker.html, homeready_revamp/REVAMP_SUMMARY.md, and codebase (frontend/src, backend/app). June 2026.*
