# HydraTrade equities — research log

Working notes for the equities report, kept as the work happens rather than reconstructed
afterwards. The crypto report (`docs/reports/crypto/index.html`) was written from `PLAN.md`
at the end, which worked but lost the reasoning behind choices that turned out to matter.
This file is the fix: methodology, what was tried, what came back and what was rejected,
in the order it happened.

**Conventions.** Every numbered result names the script that produced it and the CSV it
wrote, so any figure in the eventual report can be regenerated. A claim without one of those
is a guess and is labelled as such.

---

## Why equities at all

The crypto book works but is capped by venue capacity at roughly €50–100k of gross
exposure, which bounds what it can earn in currency however good the percentage is. Equities
are the only listed item that raises that ceiling. The feasibility run (crypto exp20) gave
CAGR +4.9 %, Sharpe 1.53, maxDD −5.3 % on 158 US names, correlation +0.27 with the crypto
book. Far less return per unit of capital, a fifth of the drawdown, and effectively
unconstrained capacity, so the interesting quantity is gross exposure rather than percent.

Two results from the crypto work set the priors here and should be revisited, not assumed:

1. **The classic factors invert.** Three-month momentum lost 4.4 % and low volatility lost
   4.9 % on equities where both are strongly positive in crypto. Thirty years of
   professional arbitrage is the obvious explanation, and it means the crypto sleeve design
   should not be ported over unexamined.
2. **The effective sample is much smaller than the row count.** In crypto, 221,706 panel
   rows carried roughly 9,800 independent observations once the market factor and
   cross-asset correlation were accounted for, a factor of 23. The same measurement must be
   made here before any claim about model capacity.

## What the feasibility run deliberately got wrong

Carried forward as the first things to fix:

- **Survivorship.** It used *today's* index membership, so companies that were delisted,
  acquired or went bankrupt are missing. In crypto this was worth a third of the universe
  and 22 % of the naive profit came from trades that could not have been made.
- **Data source.** A free unofficial endpoint, fine for a feasibility check and not for
  anything else.

---

## Step 1 — point-in-time universe from SEC EDGAR

**Status:** in progress
**Goal:** a listing calendar that says, for any date, which US companies were publicly
reporting, *including* ones that no longer exist.

**Why this first.** It is the same defect that dominated the crypto result, and the crypto
fix came free from the exchange's own file listing. EDGAR is the equity analogue: every
company that has ever filed is in it, with dates, and it is public and unmetered.

**Hypothesis to test.** First and last filing per company approximates listing and
delisting well enough to build a point-in-time universe.

**Known weaknesses of that hypothesis, to be measured rather than asserted:**
- an S-1 is filed *before* an IPO, so first-filing predates listing
- a company can keep filing after moving to OTC or going private, so last-filing postdates
  delisting
- a CIK is an entity, not a listing; tickers change, and one CIK can carry several

(results below as they arrive)

### 1.1 The calendar builds, and the survivorship gap is larger than crypto's

`scripts/build_edgar_calendar.py --start 2019Q1 --end 2026Q3`
→ `data/universe/edgar_calendar.parquet`, `edgar_filings.parquet`

Parsed every 10-K, 10-Q and their small-business variants from the EDGAR quarterly form
index. **11,514 companies, 199,549 filings, 2019-01-02 to 2026-09-25.**

The survivorship measurement, which is the reason for doing this at all:

| | count | share |
|---|---|---|
| companies filing a periodic report 2019–2026 | 11,514 | |
| present in SEC's current ticker file | 5,384 | 47 % |
| **absent from it, no ticker available** | **6,130** | **53 %** |

And the number that matters most, because it is the bias a backtest inherits:

> **Of the 6,886 companies already filing in H1 2019, 3,241 (47 %) have since stopped
> filing.** Of those, 3,146 have no ticker in any SEC file.

For comparison, the crypto universe lost roughly a third of its names to delisting over a
similar span, and correcting for that changed the result materially. The equity attrition
rate is **higher**, so a universe of companies that exist today is at least as misleading
here as it was there.

The cross-tab is clean and interpretable:

| | no ticker today | has ticker today |
|---|---|---|
| still filing | 840 | 5,202 |
| stopped filing >180 d ago | **5,290** | 182 |

- 5,202 still filing with a ticker — the survivor universe anyone would naively use
- 5,290 stopped filing and untraceable from SEC data alone — the missing half
- 840 still filing without a listed ticker — funds, subsidiaries, private filers
- 182 stopped recently, ticker not yet purged

### 1.2 The blocking problem, stated precisely

EDGAR gives a **complete calendar keyed on CIK** and **no ticker for anything that died**.
Price data is keyed on ticker. So the calendar alone is not yet a joinable universe.

Confirmed by inspection, not assumed:

| company | EDGAR name today | tickers | exchanges |
|---|---|---|---|
| Bed Bath & Beyond | `20230930-DK-Butterfly-1, Inc` | `[]` | `[]` |
| Sears Holdings | `SEARS HOLDINGS CORP` | `[]` | `[]` |
| Lehman | `LEHMAN ABS CORP` | `[]` | `[]` |

Note that Bed Bath & Beyond's *name* has been overwritten with its post-bankruptcy shell, so
even name-based matching to a price vendor degrades for exactly the companies that matter.

Both SEC ticker files (`company_tickers.json`, `company_tickers_exchange.json`) carry 10,428
rows of current filers only. **They are themselves survivor lists**, which is worth stating
plainly because they are widely used as if they were not.

**Lead to test next.** The filing's primary document is named after the ticker
(`bbby-20230225.htm`, `shld201710k.htm`). This is an inline-XBRL era convention, so
recoverability is expected to depend on the year. The honest way to measure it is to run the
heuristic against the 5,202 companies whose true ticker is known, measure precision and
recall there, and only then apply it to the 5,290 dead ones.

### 1.3 Ticker reuse, and why ticker is the wrong join key

Before investing in ticker recovery it is worth asking whether a recovered ticker would even
be usable. Tested the free price source against known delistings:

| ticker | company at the time | what the free source returns today |
|---|---|---|
| FRC | First Republic Bank, seized 2023 | nothing |
| SIVB | SVB Financial, failed 2023 | nothing |
| TWTR | Twitter, taken private 2022 | nothing |
| ATVI | Activision, acquired 2023 | nothing |
| **SHLD** | Sears Holdings, delisted 2018 | **Global X Defense Tech ETF**, 761 bars from 2023 |
| **BBBY** | Bed Bath & Beyond, bankrupt 2023 | **"Bed Bath & Beyond, Inc."**, 50 bars from 2026-07 |

Three distinct failure modes, and only the first is benign:

1. **Missing.** The ticker returns nothing. Annoying, detectable, harmless.
2. **Recycled across asset classes.** `SHLD` now belongs to a defence ETF. A backtest joining
   on ticker would splice ETF prices into a bankrupt retailer's slot and never notice.
3. **Recycled to a different entity with the same name.** `BBBY` now belongs to Overstock's
   successor, which bought the brand and adopted both the name and the symbol. **Ticker
   matches, company name matches, and it is a different legal entity with a different CIK.**
   No plausible sanity check on ticker or name catches this one.

Failure 3 is the one that matters. It means the obvious defensive measure, cross-checking
ticker against company name, provides no protection precisely where the data is most wrong.

**Conclusion, and it is a firm one.** A point-in-time equity universe cannot be keyed on
ticker. It needs a **permanent security identifier** that is never recycled: CIK for the
issuer, or a vendor's own permanent id (CRSP's PERMNO, Sharadar's permaticker). This is not
incidental to why those datasets are sold; maintaining a non-recycled identifier across
mergers, renames, bankruptcies and symbol changes is most of the work in them.

### 1.4 Where that leaves step 1

**EDGAR delivers exactly half of what the roadmap assumed.**

| | |
|---|---|
| ✅ a complete, free listing calendar keyed on CIK, including dead companies | done |
| ❌ a ticker for dead companies | EDGAR discards it |
| ❌ prices for dead companies | not EDGAR's job, and free sources fail as above |
| ❌ a stable join key across time | ticker is recycled; CIK is stable but no price source is keyed on it |

The README's guess that delisted price history is "the one genuinely irreducible purchase"
is **confirmed, with a mechanism**: what is actually being bought is not the prices but the
*permanent identifier* that makes them joinable. That is worth stating precisely, because it
changes what to shop for. A cheap feed of delisted prices keyed on ticker would be worthless.

**What the EDGAR calendar is still good for**, which is not nothing:
- an independent check on a vendor's universe, since it is authoritative on who was
  reporting and when, and disagreements are worth investigating
- the filings themselves, which are the richer-input experiment further down the roadmap and
  are keyed on CIK, so they sidestep the ticker problem entirely
- a free measurement of the survivorship magnitude, 47 % attrition over 7.5 years, which is
  the number that justifies paying for the universe in the first place

### 1.5 The ticker heuristic measured, and why it fails

The run completed from cache after SEC throttled the fetches, so the measurement exists after
all. On **670 companies whose ticker SEC still publishes**:

| | |
|---|---|
| produced a guess | ~100 % |
| **matched today's ticker** | **~65 %** |
| requiring 3, 5 or 8 agreeing filings | 65 %, 65 %, 66 % |

The confidence filter buys nothing, which is itself informative: the errors are systematic,
not noisy. Inspecting the filenames behind them gives three distinct causes.

**1. The prefix is the filing agent, not the company.** The single largest cause.

| company | ticker | primary document |
|---|---|---|
| Atlantic American | AAME | `ef20054956_10q.htm` |
| (many, via RR Donnelley) | — | `d123456d10k.htm` |
| CECO Environmental | CECO | `ceco-20260630.htm` ✓ |

Filings prepared by an agent are named on the agent's scheme. `d…` is RR Donnelley, `ef…` is
another filer. Only companies self-filing inline XBRL use the ticker convention, which is why
the accuracy sits near two thirds rather than near one or near zero.

**2. Share classes collapse.** `uhal-20260630.htm` for UHAL-B, `atro…` for ATROB, `asb…` for
ASB-PF. The filename carries the issuer, not the security. For a long/short book these are
distinct instruments with different borrow and different prices.

**3. Sometimes the heuristic is right and the ground truth is wrong.** Ball Corp filed as
`bll-*` before renaming to BALL, so the majority vote returns BLL, which is the correct
*contemporaneous* symbol and counts as an error only because the comparison is against
today's. This flatters nothing, but it means the true rate against period-correct tickers is
somewhat above 65 %, and it is a reminder that "the ticker" is not a property of a company but
of a company at a date.

**Verdict.** Two thirds is not usable. A universe with a third of its symbols wrong does not
produce a noisier backtest, it produces a fictitious one, and combined with finding 1.3 the
symbols would be wrong in a way no cross-check on name or symbol can detect. The approach is
rejected on its own merits as well as on 1.3's.

### 1.6 A process note worth keeping

**The fetcher failed silently under rate limiting.** SEC answers HTTP 429 past roughly ten
requests per second and blocks the host afterwards. The first version caught the error,
retried three times briefly, then returned `None` for every company, so the run produced no
output and looked like a hang. The dangerous version of that bug is the one that *does* print:
a precision figure computed from whichever fraction of the sample happened to succeed.
Fixed with a global throttle below the published rate, an explicit long backoff on 429, and a
refusal to report any rate when more than a fifth of fetches failed. **A measurement that
quietly loses most of its sample and still prints a percentage is the failure mode to design
against**, and it is the same shape as the stale funding feed in the crypto book.

---

## Step 2 — the universe, bought

Step 1 ended blocked: EDGAR gives a complete listing *calendar* keyed on CIK but throws the
ticker away for dead companies, and ticker is the wrong join key regardless because symbols
are recycled. Step 3 then showed the block is not cosmetic — universe choice alone swings
Sharpe by 2.6 on identical code. So the universe is the product, and it was bought rather
than reconstructed.

### 2.1 What was bought, and the licence that constrains it

Sharadar **Prices · Full History**, personal-use tier, 39 €/month, subscribed 2026-10-03.
Monthly rather than annual deliberately: the data is needed once, to build a universe and
rerun step 3, after which the derived artefacts are what matter.

The licence terms that bind the work, not just the billing:

- personal use by individuals only — no professional, institutional or commercial use, and
  not on behalf of an employer, client or partner
- on termination, **all copies of the raw data must be deleted within 30 days** — downloads,
  bulk files, caches and extracts
- research outputs, backtest results, models, summary statistics and trade logs may be kept

The operational consequence is the one that matters here: **every number this subproject
relies on has to be written out as its own artefact before the subscription lapses.** A
result that can only be regenerated by re-reading `data/sharadar/` is a result that expires.
That is why this log records counts and tables inline rather than pointing at files.

### 2.2 The acceptance test, and what it actually found

I committed in advance to three checks, chosen because they were the exact failures that
blocked step 1 — the point being to be able to ask for a refund rather than build on data
that does not solve the problem:

1. `SHLD` resolves to Sears Holdings for 2016–2018, **not** the defence ETF
2. `BBBY` pre-2023 is the bankrupt retailer, on a different id from Overstock's successor
3. the delisted count is in the thousands, not dozens

The first run looked like a failure: `SHLD`, `BBBY`, `FRC` and `SIVB` all returned **zero**
rows, and ticker reuse measured 0 % — flatly contradicting the reuse I had demonstrated in
§1.3. `TWTR` alone resolved correctly. Worth recording that the test appeared to fail and the
data was fine; the test was wrong.

All four are present under their **bankruptcy tickers**, the suffix convention US exchanges
apply when a company files:

| queried | actually stored as | permaticker | name | window |
|---|---|---|---|---|
| SHLD | `SHLDQ` | 194967 | Sears Holdings Corp | 2003-05-02 → 2018-10-23 |
| BBBY | `BBBYQ` | 197799 | Bed Bath & Beyond Inc | 1997-12-31 → 2023-05-02 |
| SIVB | `SIVBQ` | 198834 | SVB Financial Group | 1997-12-31 → 2023-03-28 |
| FRC  | `FRC-PA…PD` | 112325 ff | First Republic Bank | 2014-09-22 → 2019-10-17 |
| TWTR | `TWTR` | 187959 | Twitter Inc | 2013-11-07 → 2022-10-27 |

And the live `SHLD` symbol is exactly where §1.3 said it would be — permaticker 640438,
Global X Defense Tech ETF, 2023-09-13 → present, in the **SFP** (funds) table, not SEP.

### 2.3 Why reuse measures zero, and why that is the right answer

Sharadar stores each security under its **final** ticker, and keys everything on a
`permaticker` that is never reissued. So the collision I was afraid of cannot be constructed:
Sears is `SHLDQ` and the ETF is `SHLD`; the retailer is `BBBYQ` and Overstock's successor is
`BYON`. Across all 30,941 securities with price history (20,995 SEP + 9,946 SFP), **0 symbols
are shared by two securities.**

That is a stronger guarantee than the one I was shopping for. It does mean a second rule, and
it is the opposite of the intuitive one:

> A ticker in this dataset is a *label*, not a key, and it is the label the security died
> with — not the one it traded under at any given date. Bed Bath's 1998 prices are filed
> under `BBBYQ`, a symbol that did not exist until 2023.

So joining external data on ticker-as-of-date is still wrong, just for a new reason. If that
is ever needed, `actions` carries 13,142 `tickerchangefrom` / `tickerchangeto` pairs, which is
the historical symbol map. The equity book does not need it: it keys on `permaticker` and
never touches ticker.

### 2.4 Survivorship, finally measured against a complete universe

| | securities |
|---|---|
| equities with price history (SEP) | 20,995 |
| of which delisted | **14,661 (70 %)** |
| unique permatickers | 20,995 |

Seventy per cent. The feasibility run in §0 used 6,139 names that are alive today, which is
to say it discarded roughly two thirds of everything that ever traded, and every one of the
discards is a company whose outcome was worse than average. Against crypto's survivorship gap
this is far larger, and it is the single reason step 3's result was not reportable.

### 2.5 Verdict

Acceptance passes on all three checks. Delisted names are present with correct date
boundaries and permanent ids; symbol recycling is resolved by construction; the delisted count
is 14,661. No refund; proceed to build the universe on `permaticker`.

### 2.6 A CIK is not a security either, and that lands on step 3

The EDGAR fundamentals built in §3.3 are keyed on CIK, so attaching them to prices needs a
CIK ↔ permaticker bridge. The `tickers` table carries one implicitly: `secfilings` is an EDGAR
URL with the CIK in it, extractable for 20,892 of 20,995 equities (99.5 %).

In the direction that matters the bridge is clean — **each permaticker has exactly one CIK**.
The ambiguity is only in reverse, and it is not the one I expected. After filtering to common
stock, 214 CIKs still cover 430 distinct securities. A spot check shows these are not share
classes:

| CIK | securities sharing it |
|---|---|
| 0000006201 | `AAMRQ` AMR Corp (dead) and `AAL` American Airlines Group (live) |
| 0000701345 | `UAIRQ`, `UAWGQ`, `LCC` — three US Airways incarnations |
| 0000030419 | `RHDCQ` R H Donnelley, `DEXO` Dex One, `DNB2` Dun & Bradstreet |

These are **bankruptcy reorganisations and mergers that keep the SEC registrant**. The
predecessor dies, the successor inherits the CIK, and a naive CIK join would hand the live
security its bankrupt predecessor's balance sheet — a lookahead leak in the worst direction,
since the predecessor's final filings are maximally distressed.

Bounding the join to each security's own price window (`firstpricedate` → `lastpricedate`)
resolves most of the 214 groups outright. The remainder have **genuinely overlapping
windows** — both securities traded at once — and those cover 43 securities, 13 of which reach
the S&P universe:

> `MRK`, `JCI`, `IRM` (live) and `SGP1`, `TYC`, `CHKAQ`, `BTUUQ`, `DCNAQ`, `CPNLQ`, `ANRZQ`,
> `DNB2`, `PVT1`, `USB1` (dead)

An earlier count of 53 and 16 was too high. The boundary test was `firstpricedate <=
lastpricedate` of the predecessor, which flags a **conversion handover** as an overlap: AMR's
last price and American Airlines' first price are both 2013-12-09, as are Merck's and
Schering-Plough's at their merger. Ten securities were clean successions misclassified, and
treating them as ambiguous would have discarded exactly the large names this step exists to
keep. The test is now strictly less-than, and `tests/test_eq03_joins.py` pins it with the AMR
case, which is what caught it.

Merck, US Bancorp, Johnson Controls and Iron Mountain are not droppable, and neither are Tyco,
Chesapeake and Peabody — dropping dead index members is the exact bias this whole step exists
to remove. So there is no free fix, and the choice has to be measured rather than asserted.

**Scoping decision.** This is a step 3 problem, not a step 2 one. The universe and price panel
join on `permaticker`, which is unique by construction (16,096 securities, 0 duplicates), so
nothing here touches them. The constraint is recorded for the fundamentals rerun, which will:

1. bound every CIK join to the security's price window, and
2. report the result with the 43 overlapping-window securities included and excluded,

so the sensitivity is visible instead of hidden in a preprocessing choice. Given §3.8 — where
an arbitrary universe choice produced t statistics of +2.77 and −3.21 — baking this one in
silently would be the same mistake a second time.

### 2.7 Operational note: the price table does not fit in memory

The first download attempt had to be killed. `fetch_sharadar.py` read the HTTP response with
a single `r.read()`, unwrapped the zip from a `BytesIO`, and handed the whole CSV to
`read_csv` — fine for `tickers` at 4 MB, fatal for prices. It reached **10.3 GB resident with
8.4 GB of swap in use on a 15 GB machine, before it had finished downloading**, let alone
parsed anything.

Rewritten to stream throughout: the response goes to disk 4 MB at a time, the zip member is
read as a file object rather than a buffer, and the CSV is converted to parquet a million rows
at a time through a `ParquetWriter`. Same machine, same table: **3 GB used, 11 GB free.**

Two details that are not optional:

- **The parquet schema is pinned, not inferred.** `read_csv` infers dtypes per chunk, so a
  column that is empty in early rows and populated later changes type mid-file and the writer
  rejects it. The numeric columns are declared up front.
- **`read_parquet` returns `datetime64[us]`.** The pandas default elsewhere is `[ns]`, and
  `merge_asof` refuses the pair outright. This is the **fifth** appearance of that mismatch in
  this project; the first four were found in running code, this one by a test, because
  `pit_universe` pins both sides through `to_utc_ns` and `tests/test_pit_universe.py`
  parametrises over `us`/`ms`/`ns` deliberately.

### 2.8 The equity port found a maths bug in the shared backtest

The point-in-time universe is the first thing this project has ever run that holds securities
which go to zero. That exposed a convention error in `sleeve_returns` that had been latent
since the crypto work.

`PathBook.leg_return` reports a **log** return with the side already folded in. `stats` then
applies `log1p` to the sleeve series, which only makes sense if the series is arithmetic. In
between, the legs were combined with `np.nanmean(rl)` — averaging logs. For ordinary moves the
two agree to a rounding error, which is why 28 experiments went by without anyone noticing.
For a leg that delists they do not agree at all: a security that falls 99 % is **−4.6 in logs
against −0.99 arithmetic**.

Measured on equity legs opened in the last 25 bars of a delisted name (12,456 legs, 519 dead
securities): mean of logs −7.00 %, mean of arithmetic −2.55 %, an **overstatement of 2.74×**.
2.7 % of those legs were below −1.0 in logs and the worst was −6.69, i.e. −99.9 %.

So the first honest equity result would have been penalised, by a factor of nearly three, on
exactly the legs that distinguish it from the dishonest one. The bias correction and the
bug pointed the same way, which is the most dangerous arrangement available: the number would
have looked like strong evidence for the thing I expected to find.

**The fix is not symmetric, and getting that wrong is worse than the original bug.** Because
the side is already folded into the log figure, a short's arithmetic return is `-expm1(-r)`,
not `expm1(-r)`. The naive conversion credits a short +100 % when the asset halves instead of
+50 %. My first attempt at this fix did exactly that, and it would have inflated every short
leg in the book: the Jensen terms that nearly cancel between the two sides of a market-neutral
book stop cancelling, and a sampled crypto leg distribution showed the long side alone picking
up +1.37 % per leg per week out of nowhere. The four cases that pin it down now live in
`tests/test_leg_arithmetic.py`:

| position | asset move | correct | naive conversion |
|---|---|---|---|
| long | halves | −50 % | −50 % |
| short | halves | **+50 %** | +100 % |
| long | doubles | +100 % | +100 % |
| short | doubles | **−100 %** | −100 % |

**Blast radius.** This is shared code, so every crypto figure depends on it, including the
published report and the deployed book's expectations. It has to be re-measured rather than
assumed small, which §2.9 does.

### 2.9 Blast radius, measured

§2.8 is shared code, so the crypto figures had to be re-measured rather than assumed
unaffected. `exp27_entry_delay.py` at 9 windows × 180 days, book at 1× gross, same data and
same seeds, run twice — once against the committed code and once against the fix:

| | CAGR | Sharpe | maxDD | hit |
|---|---|---|---|---|
| averaging logs (as committed) | +24.4 % | 2.06 | −11.0 % | 0.67 |
| averaging arithmetic (correct) | **+11.2 %** | **1.10** | **−14.9 %** | 0.61 |

The committed run reproduced the previously saved figures (+24.5 %, 2.06, −11.0 %) to within a
rounding error, which isolates the one line as the whole difference rather than drift between
sessions.

**So the crypto book's headline was roughly double its true value.** Sharpe 1.10 rather than
2.06, and a worse drawdown. That is still a real edge — it is not a null result — but every
figure derived from it was overstated, and the paper book runs at `gross_leverage: 2.0`, which
puts the corrected drawdown nearer −28 % than −22 %.

**Why a market-neutral book is the worst case.** The error flattered the short side
specifically: in log space a winning short is credited more than it earns and a losing short
less than it loses. Half the book is shorts, so the overstatement did not dilute. It also
explains why 28 crypto experiments passed over it — individual crypto legs were rarely extreme
enough for the gap to show, and nothing in the crypto universe went to zero and stayed there
the way a bankrupt equity does.

**What is not affected, checked rather than assumed:**

- *The live book.* Paper P&L is read from venue equity and never passed through this formula.
- *The model.* The training target is `rank_fwd_h`, a within-date `rank(pct=True)` of the
  forward **log** return. Log is monotone in the price ratio, so ranking log returns and
  ranking simple returns give identical targets. The signal is unchanged; only the measured
  payoff of trading it moved.

**What remains unverified.** Every conclusion reached by comparing two arms — stop levels,
tranching, horizon choice, the +0.17 book Sharpe credited to positioning features, the equity
sleeve verdict — used the same wrong formula on both sides, so the orderings are likely
preserved. "Likely" is not a basis for conclusions already written down, and any comparison
whose arms differed in short-side exposure could move. These need re-running before they are
quoted again.

**Process note.** The bug and the survivorship correction pushed the same direction: the
honest equity universe is the only one that holds bankruptcies, so it was the only arm the bug
heavily penalised. The first result would have shown a large, clean, significant effect in
exactly the direction I expected to find one. That is the arrangement in which a wrong number
is least likely to be questioned, and it was caught only because the delisting legs looked
implausibly severe and got checked against arithmetic.

## Step 3 — filings as model input

Taken before step 2 because filings are keyed on **CIK**, so they sidestep the ticker problem
entirely, and step 2 is blocked on a purchase.

**The hypothesis.** The crypto work concluded, across four experiments, that the model class
is not the binding constraint and the features are. The strongest version of that claim, from
the seed-robustness note, is that deep models need *richer inputs*, not more rows. Equities
carry something crypto does not: fundamentals and filing text, updated quarterly, keyed to a
permanent issuer id. This is the first chance to test the claim rather than assert it.

**Design, and an honest limitation stated up front.** The universe here is companies that
still exist and still have a ticker, so it is survivorship-biased and cannot say what an
equity book would have returned. That is step 2's job. It *can* answer a relative question,
whether adding fundamentals to a price-only feature set changes the result, because the bias
applies identically to both arms. Every number from this step must be read as a difference,
never as a level.

### 3.1 The point-in-time rule, and why it is the whole experiment

Every XBRL fact carries two dates:

- `end` — the period the number describes, e.g. the quarter that closed 31 March
- `filed` — the day the filing became public, typically weeks later

**A backtest may only use a fact from `filed` onward.** Building the panel on `end` would let
a model read a quarter's earnings before anyone could have known them. That is the easiest
possible way to manufacture a spectacular and completely fictitious equity result, and it is
the fundamentals equivalent of the label leakage that produced AUC 0.85 in the crypto work.
The loader keeps `filed`, and **refuses to build a panel at all** if any fact lacks it rather
than silently falling back to `end`.

The reporting lag is itself a number worth publishing, since it bounds how stale a
fundamental is at the moment it can first be used.

### 3.2 Operational note: SEC blocked us

Hit `HTTP 429 Request Rate Threshold Exceeded` and then a hard block on the whole host,
returning an HTML page rather than JSON for every subsequent request. SEC publishes ten
requests a second; exceeding it briefly costs minutes of total blocking, not throttling.

Two consequences, both now designed for:
- every SEC caller shares one global throttle set **below** the published limit, not a
  per-worker one, since concurrency is what breaks the limit
- a non-JSON response is treated as a failure rather than parsed, because the block page
  returns HTTP 200 in some paths and would otherwise land in the data as garbage

Waiting the block out rather than retrying, and fetching prices meanwhile.

### 3.3 Two data-provenance bugs, and the sanity check that caught the second

**The frames API carries no filing date.** It returns `accn`, `cik`, `end`, `val`. The loader
refused to build a panel rather than falling back to `end`, which is what that guard exists
for. Fixed by joining the accession number to the EDGAR quarterly index, which
`build_edgar_calendar.py` now keeps for the purpose.

**The frames API dates a fact by the *last* filing that mentions it, not the first.** Caught
by printing the reporting lag and reading it:

```
reporting lag, filed minus period end: median 383 days, 90th pct 500 days
```

A 10-Q is filed about 40 days after the quarter it covers, so 383 days is impossible. The
cause is that later filings repeat earlier periods as comparatives, and frames returns the
most recent occurrence. Apple's Assets for the period ending 2025-09-27 came back dated
2026-07-31, from a 10-Q citing it as a prior-year figure.

**This one deserves emphasis because of how it would have failed.** The error is
*conservative*, not look-ahead: the model would have seen fundamentals roughly a year late.
Nothing would have crashed, no number would have looked suspicious, and the experiment would
have returned a null that I would have written up as *fundamentals do not help*. A bug that
produces a plausible wrong answer is far more dangerous than one that produces an implausible
one, and only an arithmetic sanity check on a quantity nobody was asking about caught it.

**Fix.** `scripts/fetch_companyfacts.py` reads the per-company fact history, which lists
every filing of every fact with its own date, and keeps the **earliest** per
(company, concept, period). That is the day the number became public.

| | median lag | p90 |
|---|---|---|
| frames API (wrong) | 383 days | 500 |
| **first disclosure (correct)** | **37 days** | **67** |

**315,603 first disclosures across 919 of the 1,000 most liquid US names.**

### 3.4 The feature layer and what it is allowed to see

`hydratrade/features/fundamentals.py`, eight scale-free features: return on equity, return on
assets, operating margin, leverage, cash ratio, and one-year growth in assets, revenue and
equity. Profitability, balance-sheet risk and investment, which is the standard quality and
growth grouping.

Two rules, both enforced by tests rather than by intent:

1. **Nothing is visible before its filing date.** The join is a `merge_asof` on `filed`, and
   a test tampers with every filing after a cut date and asserts that no earlier decision
   row moves.
2. **Every feature is a ratio or a growth rate.** A cross-sectional rank of raw revenue ranks
   company size, which is already priced. A test multiplies every input by a million and
   asserts the features are unchanged.

Two more tests cover the cases that bit the crypto book: a company that stops filing reads
*missing* rather than carrying a stale constant, and the two revenue tags either side of the
ASC 606 change are treated as one concept.

### 3.5 The first result, and why it cannot be reported as it stands

`experiments/eq01_fundamentals.py`. Price-only against price plus eight point-in-time
fundamentals, identical universe, identical everything else, 313 weeks, six one-year
walk-forward windows.

| universe | price only | plus fundamentals | fundamentals add | t |
|---|---|---|---|---|
| top 400 by dollar volume | −3.6 %, Sharpe −0.77 | −5.8 %, Sharpe −1.53 | −0.046 %/wk | **−1.64** |
| top 150 by dollar volume | −5.5 %, Sharpe −0.92 | −0.7 %, Sharpe −0.11 | +0.093 %/wk | **+2.77** |

**The sign flips on a parameter chosen arbitrarily.** One run says fundamentals hurt at
t −1.64, the other says they help at t +2.77. Had the second been run alone it would have
read as a clean positive result at conventional significance, and reporting it would have
been wrong. Neither number survives the other's existence.

This is the specification-search failure the crypto report spends a section on, encountered
live. The correct response is not to pick the favourable run, nor to average them, but to
treat `top_n` as what it is, a free parameter that the result is not robust to, and to
characterise that rather than collapse it.

**A second problem, which may be the cause.** The price-only arm is **negative in both
configurations**, Sharpe −0.77 and −0.92. A feature comparison built on a base model that
does not work is weak evidence whichever way it points: adding columns to a broken ranker
can easily change its sign without meaning anything about the columns.

So there are two questions, and the second must be answered first:

1. does adding fundamentals help? — currently unanswerable, the result is unstable
2. **why is the price-only equity ranker negative at all**, when the earlier feasibility run
   (exp20) reported +4.9 % per year at Sharpe 1.53 on the same machinery?

### 3.6 Chasing the discrepancy with the feasibility run

Differences found so far, in order of how much they explain:

**exp20 compensated for a bug rather than hitting it.** It calls
`leg_return(x, ts, H * 24, ...)`, multiplying the 21-day horizon by 24 to express it in the
hours the function then assumed. So exp20 was correct, and making `PathBook` timeframe-aware
leaves it correct, since it still uses the hourly default. The earlier result is not
invalidated by that fix.

**Universe breadth does not explain it.** Narrowing from 400 names to 150 left the price-only
arm negative (−0.92 against −0.77). So the gap to exp20 is not simply that the broader
universe is harder.

**What remains is the universe's *composition*.** exp20 trades a hand-written list of 158
companies that are large *today*. That is a roster of known survivors and known winners,
chosen in 2026 and applied from 2016. The obvious hypothesis is that exp20's +4.9 % measures
the list rather than the method, which would make it the same error the crypto point-in-time
work found, in a more concentrated form. Testing it directly by running this pipeline on
exp20's exact list.

### 3.7 The universe is the whole result

Running the identical pipeline on exp20's hand-written list of 158 large caps:

| universe | price-only CAGR | Sharpe | maxDD |
|---|---|---|---|
| top 400 by dollar volume | −3.6 % | −0.77 | −29.9 % |
| top 150 by dollar volume | −5.5 % | −0.92 | −36.1 % |
| **exp20's 158 hand-picked large caps** | **+5.3 %** | **+1.69** | **−6.7 %** |

Same code, same period, same features, same horizon, same costs. **Only the universe
differs, and it moves the Sharpe ratio by 2.6.**

Two things follow, and the second is the important one.

**The pipeline is correct.** +5.3 % at Sharpe 1.69 reproduces exp20's +4.9 % at 1.53 closely
enough to confirm that this implementation and the earlier one agree when given the same
input. The discrepancy was never a bug.

**exp20's result is a property of its list, not of the method.** That list was written in
2026 and contains companies that are large *in 2026*. Running it from 2016 selects, at every
decision date, from a set of firms already known to have prospered over the following decade.
Those companies grew into the list. This is selection on the outcome in a concentrated form,
and it is the same error the crypto point-in-time work found, where a hindsight-selected
universe of 50 survivors flattered the Sharpe ratio until the calendar corrected it.

**The honest statement of what is known:** on a mechanically chosen liquid US universe, this
cross-sectional ranker does not work. The positive feasibility figure came from a universe
that could not have been known in advance.

**What cannot be settled here.** It is possible that large-capitalisation names genuinely are
a better universe for this strategy, and that exp20 was right for the wrong reason. That is a
real hypothesis and it is **not testable without point-in-time index membership**, because
any large-cap list assembled today is contaminated by the outcome. Step 3 therefore hands the
question back to step 2. The purchase is not a convenience; it is what separates "large caps
work" from "companies that became large caps worked".

### 3.8 And the fundamentals question is unanswerable as posed

Three universes, three answers, two of them significant and pointing in opposite directions:

| universe | fundamentals add | t |
|---|---|---|
| top 400 | −0.046 %/wk | −1.64 |
| top 150 | +0.093 %/wk | **+2.77** |
| exp20's 158 | −0.068 %/wk | **−3.21** |

A t statistic above 3 and one below −3 from the same experiment under two arbitrary universe
choices is not evidence about fundamentals. It is a measurement of how much freedom the
specification has.

**Conclusion for step 3, stated plainly.** The input-richness hypothesis was not tested,
because the base it would have been tested against is not stable. Publishing any one of these
rows would have been a specification search dressed as a result. The prerequisite for
answering it is a universe that is not chosen with hindsight, which is step 2.

## Step 2 continued — the universe is built, and what it cost to make it honest

### 2.10 The derived artefacts

`scripts/build_equity_universe.py` turns the raw tables into three files, which are what the
research actually reads:

| file | contents |
|---|---|
| `sp500_pit.parquet` | 57,251 rows: quarterly index membership, 115 quarters, 1,148 securities |
| `equity_bars.parquet` | 38,180,213 daily bars for 16,096 common-stock securities, keyed on permaticker |
| `equity_securities.parquet` | 16,096 securities with CIK, sector and price window |

`pit_universe` in `hydratrade/data/equities.py` restricts a panel to membership as known on
each decision date, taking the most recent snapshot at or before each row's timestamp.
`tests/test_pit_universe.py` pins the three properties that matter: a name added in June
cannot be traded in April, a name removed in June stays tradeable until then rather than
vanishing from its own history, and nothing survives before the first snapshot. It is
parametrised over microsecond, millisecond and nanosecond timestamps because that mismatch
had already broken four joins in this project, and it caught a fifth here.

Verified end to end rather than assumed: the S&P 500 as of 2008-06-30 returns 498 members of
whom 182 are delisted today — Aetna, Allergan, Altera, Affiliated Computer Services — each
with complete bars up to its own delisting date.

### 2.11 A CIK is an integer, and the first join silently matched nothing

`equity_securities` carried the CIK exactly as EDGAR writes it in the URL, `"0001090872"`,
while `companyfacts` stores it as the integer `1090872`. The first coverage check therefore
reported **0 %** and read as a missing dataset rather than a dtype mismatch. Normalised to
`Int64` at the point of extraction, where it cannot be got wrong by a caller; the join then
finds 858 overlapping CIKs. Worth recording because it is the same class of bug as the
timestamp-resolution one and it failed just as quietly.

### 2.12 Fundamentals exist only from 2012, and that bounds step 3

The fundamentals on disk before this had been fetched against a liquidity screen measured on
survivors, so they covered 919 live companies and **12** of the dead index securities.
Refetching against the index universe (`--index`) gives 894 companies and **275** dead ones.

The refetch first reported `241 of 1136 fetches failed` and refused to write. That guard
exists because SEC once hard-blocked us mid-run and the fetcher returned `None` for
everything, so it refuses to report when more than a fifth fail. Here it was wrong: every one
of the 241 was a **404**, and every one was a company that delisted before XBRL became
mandatory over 2009-2011. The data does not exist. `fetch` now returns a distinct `ABSENT`
for a 404, only genuine failures count toward the guard, and absence is cached as a marker
file so reruns do not re-request hundreds of companies that will never have facts.

That diagnosis is more valuable than the bug, because it is a hard bound on step 3:

| dead index securities, by delisting era | with fundamentals |
|---|---|
| 1998–2008 | 29 / 249 (**12 %**) |
| 2009–2011 | 26 / 42 (62 %) |
| 2012–2016 | 87 / 88 (99 %) |
| 2017–2021 | 85 / 87 (98 %) |
| 2022–2026 | 50 / 52 (96 %) |

Live securities: 629 / 629. So **a fundamentals test before roughly 2012 cannot be
survivorship-free**, whatever the price universe does: the dead names of that era carry no
fundamentals, the staleness guard drops them, and the fundamentals arm is left trading
survivors while the price arm trades everything. That is the bias §3.8 exists to remove,
reappearing through a different door. eq03 therefore runs 14 windows, ending its test period
at 2012, and that is a data boundary rather than a tuning choice.

## Step 2 result — the equity edge was survivorship, and there is nothing left

### 2.13 eq02: identical code, two universes, twenty years

`experiments/eq02_pit_universe.py` runs the same price-only cross-sectional ranker twice over
20 walk-forward windows, 1,043 weeks from October 2006 to October 2026. Same securities pool,
same features, same model, same costs of 10 bps per leg, same 21-day horizon tranched daily,
same market-neutral deciles. The only difference is which names are eligible on each decision
date:

| universe | CAGR | Sharpe | max drawdown | hit |
|---|---|---|---|---|
| point-in-time membership | **+0.1 %** | **0.06** | −31.7 % | 0.47 |
| today's members, applied backwards | +6.2 % | 1.78 | −8.4 % | 0.60 |

Survivorship overstates the weekly return by **+0.1136 %, t +7.99**, and inflates Sharpe by
**1.73**. The two arms correlate 0.559, so they are not even trading the same book.

**The honest equity book is flat.** CAGR +0.1 % at Sharpe 0.06 with a hit rate of 0.47 is
indistinguishable from no edge, and it loses slightly more weeks than it wins. The entire
apparent result — every equity figure this subproject has produced, including the feasibility
run quoted in the crypto report — was survivorship bias.

### 2.14 Why this is believable, and the control that makes it so

A null result from new code invites the suspicion that the code is broken rather than the
strategy. The control is the biased arm. exp20's feasibility run, on a hand-picked list of
159 names that are liquid today, returned +5.7 % at Sharpe 1.66. eq02's survivor arm, built
mechanically from today's index membership, returns +6.2 % at Sharpe 1.78. **The biased
construction reproduces the old biased answer**, on a different universe and a different
codebase path, which is what says the pipeline works and the point-in-time arm is measuring
something real rather than failing silently.

Three further reasons to trust the sign:

- 1,043 weeks of out-of-sample at t +7.99 is not a marginal measurement.
- The pit arm trades 494 names per day against the survivor arm's 421, so the honest arm has
  *more* to rank, not less. The gap is not a small-sample artefact.
- §2.4 predicted it: 70 % of all US equity securities ever listed are delisted, and every
  discard is a company whose outcome was worse than average. A backtest that silently omits
  them is long a portfolio of known survivors.

### 2.15 What this does and does not say

It says that **cross-sectional ranking of large-cap US equities on price features alone, at
these costs and this horizon, has no edge.** That is a narrow claim about one specification,
and it is also the specification the whole roadmap was built on, so it is the one that
mattered.

It does not say equities are unprofitable. Untested: other horizons, a wider universe than
the index, sector-neutral construction, intraday or weekly rebalancing, and — the question
step 3 exists for — whether richer inputs rather than richer models change it. eq03 asks the
last of those against this now-stable flat baseline, which is the one thing eq01 never had.

## Step 3 answered — fundamentals add a little, to a book that loses

### 3.9 eq03: the question eq01 could not ask

eq01 could not answer whether fundamentals help, because the base it compared against moved
with the universe. §2.13 fixed the base: on point-in-time membership the price-only book is
flat. `experiments/eq03_fundamentals_pit.py` now runs the comparison on that base, over 14
windows and 730 weeks from October 2012 — which is the earliest honest start, because
fundamentals do not exist for companies that delisted before XBRL (§2.12).

Both arms trade the **identical** universe: 3,448,925 rows, 6,981 decision days, 1,106
securities in each. Adding fundamentals adds 8 features to the 21 price ones and removes no
rows; a security without filings carries NaN and the tree handles it. That matters, because
eq01 instead filtered both arms to names that *have* fundamentals, which quietly made the
universe a function of the thing being tested.

| arm | CAGR | Sharpe | max drawdown | hit |
|---|---|---|---|---|
| price only | −2.0 % | −0.91 | −25.3 % | 0.45 |
| price + fundamentals | −0.8 % | **−0.36** | −15.6 % | 0.51 |

**Fundamentals add +0.0241 % per week, t +2.60**, correlation 0.652 between the arms.

### 3.10 What that is worth, stated carefully

The t statistic is real and the effect is not an artefact of a few weeks:

- +0.0241 %/wk implies +1.26 %/yr, and the directly measured CAGR gap is +1.24 %. Consistent.
- The fundamentals arm wins **53.4 %** of weeks, so the effect is broad rather than lumpy.
- The ten largest weekly differences account for only **15 %** of the total, so it is not
  driven by outliers.
- Split in half: +0.0307 %/wk at t +2.40 over 2012–2019, +0.0175 %/wk at t +1.31 over
  2019–2026. Present in both halves, decaying, and not significant in the second alone.

So the input-richness hypothesis the crypto programme could not test gets a **small positive
answer**: richer inputs do beat richer models, which four crypto experiments failed to do. It
is the first thing in either book to improve a result through what the model sees rather than
how it is shaped.

**And it does not make the strategy work.** Both arms lose money. Fundamentals turn Sharpe
−0.91 into −0.36, which is a real improvement to something that should not be traded. The
honest summary is that an 8-feature point-in-time fundamental set is worth roughly 1.3 % a
year on a large-cap cross-sectional book — worth having, nowhere near the 2 % or more of
annual cost and drawdown that the book would need to clear to be viable.

Note also that price-only over 2012–2026 (−2.0 %, Sharpe −0.91) is **worse** than over
2006–2026 (+0.1 %, Sharpe 0.06). The specification decays over the sample, which is what a
crowded-out anomaly looks like and is consistent with the fundamentals effect decaying too.

### 3.11 The ambiguity check, which is the one §3.8 asked for

§2.6 left 13 index securities whose shared-CIK price windows overlap, so no date bound
separates them — Merck, Johnson Controls and Iron Mountain among the live ones, Tyco and
Chesapeake among the dead. §3.8's lesson was that a result which moves when an arbitrary
preprocessing choice changes is not a result. So eq03 was run both ways.

| | price only | + fundamentals | effect | t |
|---|---|---|---|---|
| all 1,106 securities | −2.0 %, Sharpe −0.91 | −0.8 %, −0.36 | +0.0241 %/wk | +2.60 |
| 13 ambiguous excluded (1,094) | −1.5 %, −0.59 | −0.3 %, −0.14 | **+0.0231 %/wk** | +2.05 |

**The effect size is the same to within 4 %**, +0.0231 against +0.0241 % per week, and is
significant either way. The t falls to +2.05 because 12 fewer securities is slightly less
data, not because the effect moved. The levels shift — both arms are less negative without
the ambiguous names — but the *difference*, which is the only thing being claimed, does not.

That is the first result in this subproject to survive the test eq01 failed: it does not
depend on a preprocessing choice made by me. The conclusion stands in both variants — a
point-in-time fundamental set is worth roughly 1.3 % a year, and both arms still lose money.

## Step 4 — the index was not the problem

### 4.1 eq04: a point-in-time liquidity screen over everything

The standing objection to §2.13 and §3.9 was that both are large-cap results, and the S&P 500
is the most arbitraged universe in the world, so the specification might be sound and the
universe simply too efficient. `experiments/eq04_broad_universe.py` tests it by replacing
index membership with a point-in-time liquidity screen over **every** common-stock security on
disk: at each date the universe is the top 500 by trailing 21-day dollar volume among names
that actually had bars that day.

The screen is point-in-time by construction. The rolling window at date *t* uses bars through
*t*, the dollar volume on *t* is known at the close when the decision is taken, and the rank
is cross-sectional within that date only. A security enters when it becomes liquid and leaves
when its bars stop, with no reference to whether it survived.

The comparison is as clean as it gets: **494 names per day, identical to the index arm**, but
drawn from 2,361 securities rather than 1,148. Same breadth, more than twice the turnover in
*which* names. Same 730 weeks, same horizon, same costs, same model.

| universe, 2012-10 → 2026-10 | CAGR | Sharpe | max drawdown | hit |
|---|---|---|---|---|
| point-in-time S&P 500, price only | −2.0 % | −0.91 | −25.3 % | 0.45 |
| broad liquid top 500, price only | **+0.3 %** | **0.09** | −19.1 % | 0.49 |

**The objection has a little truth in it and does not rescue the strategy.** Widening the
universe is worth about a point of Sharpe — from −0.91 to 0.09 — which is a real and
substantial improvement over the index. It arrives at flat.

### 4.2 Three universes, one answer

| universe | window | CAGR | Sharpe |
|---|---|---|---|
| point-in-time S&P 500 | 2006–2026 | +0.1 % | 0.06 |
| point-in-time S&P 500 | 2012–2026 | −2.0 % | −0.91 |
| broad liquid top 500 | 2012–2026 | +0.3 % | 0.09 |
| today's S&P 500 members, backwards | 2006–2026 | +6.2 % | 1.78 |

Every honest universe lands between −0.91 and +0.09. The only construction that produces an
edge is the dishonest one. Note also that the index over 2012–2026 is the *worst* of the
three honest rows, while the same index over the longer 2006–2026 window is flat — consistent
with large-cap cross-sectional anomalies having decayed, and with the fundamentals effect
decaying over the same period (§3.10).

**So the specification is dead, and it is the universe-independent kind of dead.** Price-feature
cross-sectional ranking of liquid US equities, market-neutral deciles, 21-day hold, 10 bps a
leg, does not work — not on the index, not on a universe twice as broad, not over twenty years
and not over the recent fourteen. Fundamentals add a measurable 1.3 % a year to it, which is
real and not nearly enough.

What is still untested is listed in `RESUME.md` §5: the horizon, which nothing has varied, and
sector-neutral construction. Those are the only remaining ways the answer could change without
new data.

## Step 5 — the horizon, and the one lead worth keeping

### 5.1 eq05: four holding periods on the best honest universe

Every result so far was measured at a 21-day hold, the one parameter nothing had varied, and
in the crypto programme the horizon mattered more than the model class. eq05 sweeps it on the
broad liquid universe — eq04's, the best honest one — with a single panel labelled for all
four horizons so nothing differs but the label and the holding period.

Internal check first: at 21 days eq05 returns **+0.3 % at Sharpe 0.09, reproducing eq04
exactly**, so the four arms are genuinely comparable rather than four differently-built runs.

| horizon | CAGR | Sharpe | max drawdown | hit | t vs 21d |
|---|---|---|---|---|---|
| 5 d | +0.4 % | 0.10 | −18.9 % | 0.51 | +0.17 |
| 10 d | +0.1 % | 0.05 | −16.2 % | 0.49 | −0.02 |
| 21 d (base) | +0.2 % | 0.07 | −16.3 % | 0.48 | — |
| **63 d** | **+1.9 %** | **0.72** | **−11.8 %** | 0.53 | **+1.21** |

(The table uses the 719 weeks all four horizons share, so the levels differ slightly from each
arm's own 730-week print.)

### 5.2 What the quarterly horizon is and is not

**It is the most promising thing found anywhere in the equity work.** Sharpe 0.72 against 0.07
at three weeks, on the same universe, same features, same model, same costs — and the
shallowest drawdown of the four at −11.8 %. If the equity book has a future, this is where the
evidence points.

**It is not established, and three things say so at once:**

1. **t +1.21 against the 21-day base.** That does not reject the null. On this evidence the
   quarterly horizon cannot be distinguished from the others.
2. **It is the maximum of four specifications.** The best of four draws from a distribution
   centred near zero is positive by construction, which is the whole reason the sweep reports
   every horizon and prints that caveat itself.
3. **The test is badly underpowered at long horizons, which is why the t is small despite a
   large gap.** A 63-day hold gives only ~57 independent holding periods in 719 weeks against
   ~171 at 21 days and ~719 at 5. The weekly series overlaps heavily, so the t statistic is
   computed on far less information than the week count suggests.

So the honest statement is that **a quarterly horizon looks materially better and has not been
shown to be**. It earns a dedicated test — more windows, a longer sample, and horizons either
side of 63 days to see whether it is a plateau or a point — and it does not earn a claim.
What it should not do is get quoted as 0.72 without the t beside it.

### 5.3 Where the equity work actually stands

The specification is dead at every holding period under a month and on every honest universe
tried. The surviving leads, in order:

1. **Quarterly horizon**, Sharpe 0.72, unestablished, worth a dedicated test.
2. **Fundamentals**, +1.3 % a year at t +2.60, established and robust, insufficient alone —
   but never yet combined with the quarterly horizon, and §3.10 found fundamentals decay over
   the sample while §5.1 finds the long horizon does best, so the two may interact.
3. **Sector-neutral construction**, untested.

Nothing here needs new data. All of it needs the Sharadar subscription kept, since
`equity_bars.parquet` is an extract and goes when the subscription does (§2.1).

### 5.4 The quarterly lead did not survive more data

§5.2 said the 63-day result earned a dedicated test and not a claim, for three reasons: t
+1.21, best of four, and badly underpowered. The dedicated test is the same sweep over the
**full 1998–2026 price history** rather than eq04's 2009 start — which existed only to match
eq03's fundamentals window and has no bearing on a horizon test — across five horizons to
distinguish a plateau from a point. 6,981 decision days against 4,445, and 1,022 common
weeks.

| horizon | CAGR | Sharpe | max drawdown | hit | t vs 21 d | independent periods |
|---|---|---|---|---|---|---|
| 21 d (base) | +1.0 % | 0.23 | −30.9 % | 0.52 | — | 243 |
| 42 d | +1.4 % | 0.39 | −29.9 % | 0.58 | +0.46 | 122 |
| 63 d | +0.8 % | **0.25** | −31.1 % | 0.56 | −0.31 | 81 |
| 84 d | +0.4 % | 0.16 | −32.9 % | 0.55 | −0.67 | 61 |
| 126 d | +0.6 % | 0.26 | −31.2 % | 0.59 | −0.49 | 41 |

**The 0.72 at 63 days is 0.25 here.** Not a plateau, not a point — a flat band between 0.16
and 0.39 with every |t| below 0.7 and no horizon beating the base. The nominal best moved from
63 days to 42 days, which is what a ranking over noise does when it is resampled.

I predicted in §5.2 that a real effect should strengthen with more data. It halved. That is
the prediction failing cleanly, and it is why the sweep was built to print its own
selection caveat and the independent-period count rather than leaving the maximum to speak
for itself. Had the 0.72 been reported as a finding it would have been wrong by a factor of
nearly three.

### 5.5 The equity specification is settled

Both axes that were ever free have now been swept:

- **Universe**: four tried. Every honest one lands between Sharpe −0.91 and +0.09; the only
  edge belongs to the survivor-biased construction.
- **Horizon**: five tried, 5 to 126 days. Every one lands between 0.16 and 0.39 on full
  history, none distinguishable from the others.

Cross-sectional ranking of liquid US equities on price features, market-neutral deciles, at
10 bps a leg, does not work at any holding period on any honest universe. Fundamentals add a
real and robust +1.3 % a year (§3.10) to a book that does not clear its costs without them.

What is left is **sector-neutral construction**, which is untested and is the only remaining
idea that needs no new data. It is a narrower hypothesis than the two just closed: that the
long and short legs load on the same sector bets and cancel the signal. Worth one experiment,
not worth a programme. Beyond that, the honest position is that this specification is
finished and the capacity argument for equities does not pay without an edge to scale.

## Step 6 — the legs were never a sector bet

### 6.1 eq06: sector-neutral construction

The last hypothesis that needed no new data: that ranking across the whole universe makes the
long leg one sector and the short leg another, so the book wagers on sectors and the
stock-level signal is drowned. eq06 forms the legs within each sector instead — top and bottom
decile of every sector with at least 20 names, then pooled — on the identical panel, so only
the leg formation differs. Sector is known for 3,547 of 3,551 securities and the other four
are dropped from both arms.

| construction | CAGR | Sharpe | max drawdown | hit |
|---|---|---|---|---|
| global deciles | +0.9 % | 0.20 | −30.4 % | 0.52 |
| sector-neutral | +0.7 % | 0.19 | −27.1 % | 0.53 |

Sector neutrality adds **−0.0055 % per week, t −0.72**. Nothing, and slightly negative.

**The informative number is the correlation: 0.949.** Forming the legs inside each sector
produces very nearly the same book as forming them across the universe. So the premise was
false — the global ranking was not concentrating the legs into sectors in the first place,
and there was no sector bet to remove. The hypothesis had no mechanism, which is a cleaner
refutation than a null effect would have been.

The one thing it does buy is three points of drawdown, −30.4 % to −27.1 %, at no cost in
return. Worth knowing if a sector-neutral variant is ever built for other reasons; not a
reason to build one.

### 6.2 A note on measurement precision, from the control arm

eq06's global arm returns Sharpe 0.20 where eq05's 21-day full-history arm returned 0.24, on
what is nearly the same panel. The difference is that eq06 computes the cross-sectional ranks
*after* merging sector, so they are formed over 3,547 securities rather than 3,551, and every
feature shifts slightly.

**Dropping 4 securities out of 3,551 moves Sharpe by about 0.04.** That is worth recording,
because every horizon in §5.4 landed between 0.16 and 0.39 — a band only a few multiples of
that precision wide. It is independent support for reading those five numbers as one flat
band rather than a ranking, and a caution against taking any single Sharpe here to two
decimal places.

### 6.3 The equity book is closed

| axis | tried | result |
|---|---|---|
| universe | 4 | every honest one between Sharpe −0.91 and +0.09 |
| horizon | 5, from 5 to 126 days | every one between 0.16 and 0.39, none distinguishable |
| construction | global vs sector-neutral | 0.949 correlated, t −0.72 |
| inputs | price vs price + fundamentals | **+1.3 %/yr at t +2.60**, the one real effect found |

Cross-sectional ranking of liquid US equities on price features does not work, and the three
structural explanations for why it might be failing — wrong universe, wrong horizon, sector
contamination — are each measured and each refuted. The only positive result in the whole
subproject is that point-in-time fundamentals add about 1.3 % a year, robustly, to a book that
loses more than that.

Nothing further is worth running without a new idea rather than a new parameter.
