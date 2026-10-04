# Equities — resume here

Entry point for the equities subproject. Reasoning and measurements are in
[`NOTES.md`](NOTES.md); this file is only what you need to pick the work back up.

**Status: the central question is answered, and the answer is negative.** The data was bought,
the universe was built, and the strategy the whole roadmap rested on does not work once the
universe is honest — on the index, on a universe twice as broad, at every holding period from
5 to 126 days, over twenty-eight years. Fundamentals add a real but insufficient 1.3 % a year.
Universe, horizon, construction and inputs are all measured, so this is finished rather than
blocked.

## 1. The one sentence version

A cross-sectional long/short book on large-cap US equities, ranked on price features, returns
**+0.1 % a year at Sharpe 0.06** on a point-in-time universe — and **+6.2 % at Sharpe 1.78**
on today's index membership applied backwards. The edge was survivorship.

## 2. What is on disk — do not re-download any of this

| path | contents |
|---|---|
| `data/sharadar/` | 1.3 GB raw: 45.4 M equity price rows 1997–2026, funds, tickers, actions, sp500 |
| `data/universe/equity_bars.parquet` | 38.2 M daily bars, 16,096 common-stock securities, keyed on `permaticker` |
| `data/universe/sp500_pit.parquet` | quarterly index membership, 115 quarters, 1,148 securities |
| `data/universe/equity_securities.parquet` | 16,096 securities with CIK (Int64), sector, price window |
| `data/universe/equity_fundamentals_index.parquet` | 303 k first disclosures, 894 companies, median filing lag 37 d |
| `data/raw/edgar-companyfacts/` | cache, including `.absent` markers for companies with no XBRL |

The Sharadar subscription is **kept**, so this can be extended. Note the licence: personal use
only, and on cancelling, the raw tables and `equity_bars.parquet` must be deleted within 30
days. Derived results may be kept, which is why every number lives in `NOTES.md` rather than
only in a parquet.

## 3. Code that exists and works

| file | what it does |
|---|---|
| `scripts/fetch_sharadar.py` | streams the bulk tables to disk and converts in chunks |
| `scripts/build_equity_universe.py` | derives the three universe files; `--no-bars` for the small ones |
| `scripts/fetch_companyfacts.py --index` | first-disclosure fundamentals for the index universe |
| `hydratrade/data/equities.py` | `pit_universe`, membership as known on each decision date |
| `experiments/eq02_pit_universe.py` | the survivorship measurement |
| `experiments/eq03_fundamentals_pit.py` | fundamentals on the honest universe |
| `tests/test_pit_universe.py`, `tests/test_eq03_joins.py` | the properties that must not regress |

## 4. What is known, so it is not re-argued

- **Ticker is a label, never a key.** Securities are stored under the ticker they *died* with:
  Sears is `SHLDQ`, Bed Bath is `BBBYQ`, and the live `SHLD` is a defence ETF on a different
  `permaticker`. Bed Bath's 1998 prices sit under a symbol that did not exist until 2023. Key
  on `permaticker`. 0 symbols are shared across all 30,941 priced securities.
- **70 % of US equity securities ever listed are delisted** (11,584 of 16,096 common stock).
- **A CIK survives bankruptcy; a security does not.** 214 CIKs cover 430 securities. Bound
  every fundamentals join to the security's own price window, or American Airlines inherits
  AMR's distressed balance sheet. 43 securities have genuinely overlapping windows and cannot
  be separated by date; `eq03 --exclude-ambiguous` measures what they are worth.
- **Fundamentals only exist from ~2012.** XBRL phased in 2009–2011, so 12 % of index
  securities that delisted in 1998–2008 have fundamentals against 99 % for 2012–2016. Any
  fundamentals test before 2012 is survivorship-biased in that arm whatever the price
  universe does. That is why eq03 uses 14 windows.
- **The biased construction reproduces.** exp20's hand-picked list gave +5.7 % at 1.66 and
  eq02's mechanical survivor arm gives +6.2 % at 1.78, which is the control that makes the
  null credible rather than a silent failure.

## 5. The decision waiting for you

The price-only specification is dead. Three directions, in descending order of how much they
would change the answer:

1. ~~**Widen the universe beyond the index.**~~ **Done — eq04.** A point-in-time liquidity
   screen over all 16,096 securities (top 500 by trailing dollar volume, 2,361 names ever
   eligible, the same 494 per day) gives **+0.3 % at Sharpe 0.09** against the index's −2.0 %
   at −0.91 over the same 730 weeks. Worth about a point of Sharpe, and it arrives at flat.
   The index was not the problem.
2. ~~**Change the horizon.**~~ **Done — eq05.** Five horizons from 5 to 126 days over
   1998–2026 and 1,022 weeks all land between Sharpe **0.16 and 0.39**, with every |t| against
   the 21-day base below 0.7. A 63-day lead that measured 0.72 on the shorter 2012 sample is
   **0.25** on full history, and the nominal best moved to 42 days. Noise, resampled.
3. ~~**Sector-neutral construction.**~~ **Done — eq06.** Forming the legs within each sector
   gives Sharpe 0.19 against 0.20, t −0.72, and the two books correlate **0.949** — so the
   global ranking was never concentrating into sectors and there was no sector bet to remove.
   The premise was false, not just the effect null. It does buy three points of drawdown
   (−30.4 % to −27.1 %) at no cost in return, if a sector-neutral variant is ever wanted for
   other reasons.
4. **Stop — this is where it stands.** Universe, horizon, construction and inputs are all
   measured. The three structural explanations for the failure are each refuted. The capacity
   argument for equities only pays if there is an edge to scale and there is not one, so
   concluding here is the expected outcome rather than a premature one. **Anything further
   needs a new idea, not a new parameter** — a different signal family (analyst revisions,
   short interest, insider transactions), not another sweep of this one.

Not worth doing until one of those changes the answer: the live price feed, the equity book
config, and the broker executor. Building an executor for a flat strategy is work with no
return, which is why those three rows in the README are deferred rather than pending.

## 6. Crypto, for context

Deployed and paper trading, corrected to **+13.7 % a year at Sharpe 1.35** at 1× gross after
a leg-arithmetic fix found by this equity work. Paper gate runs to about 2026-11-19. The
crypto research log is `docs/reports/crypto/NOTES.md`; the published piece is `index.html`.
