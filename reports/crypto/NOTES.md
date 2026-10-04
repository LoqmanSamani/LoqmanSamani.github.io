# HydraTrade crypto — internal research log

The published piece is `index.html`. This file is the working record behind it: the things
that were measured but do not belong in a report, and the open questions with their status.

## The leg-arithmetic correction (2026-10-03)

`PathBook.leg_return` returns a side-adjusted **log** return, and `stats` applies `log1p` to
the series built from those legs, so averaging them as logs compounded twice. Harmless on
ordinary moves, decisive on a leg that goes to zero. Found only when the equity port started
holding bankruptcies; 28 crypto experiments had passed over it.

The fix is `leg_mean(legs, side)` in `portfolio.py`, and it is asymmetric: a long's simple
return is `expm1(r)`, a short's is `-expm1(-r)`. The naive symmetric form credits a short
+100 % when the asset halves instead of +50 %.

Every number moved. Book at 1x gross: CAGR +24.4 % -> **+13.7 %**, Sharpe 2.06 -> **1.35**,
maxDD -11.0 % -> **-12.5 %**. The aggregation had also been copied inline into six
experiments, so fixing the library alone left those still reporting the old figures; that is
why `leg_mean` is shared and every call site uses it.

What did not change: the live decision path (it never calls this code), and the models (the
training target is a within-date rank of the forward log return, and log is monotone in the
price ratio, so the target is identical).

## Open items, and where they actually stand

### Resolved: the tradable-universe scare was my own misreading

exp22 reports an arm called "has a Kraken perp today" at +0.7 % and Sharpe 0.12, against
+20.5 % and 1.64 for everything. That looked like the edge living in names the venue does not
list, which would have undermined the whole result.

It does not, and the reason is that **the deployed book already trades only the tradable
universe.** `configs/books/alts_xs.yaml` sets `universe: alts_live`, which is 166 assets, every
USDT symbol with 24+ months of history that has a krakenfutures perpetual today. Verified
empirically: `universe_symbols` returns 166, the loaded bars carry 166, and the headline 1.35
is computed on exactly that set. exp22's arm is a different construction — the archive's 438
names narrowed by today's listing, without the 24-month history requirement, and carrying
exp22's own scaling — so it was never the deployed book's number.

The residual caveat is real but much narrower, and it is the opposite of what I first feared.
Only **2 of the 166** have bars ending more than 30 days before the data does (HFT, delisted
2026-08-17, and XMR, 2024-02-20). So the book earns almost nothing from the dying-coin legs
exp22 identified as fiction — but it also means the universe is selected on *venue survival*:
a coin Kraken listed in 2023 and delisted in 2025 is absent entirely, including the period it
traded fine. Removing that would need a point-in-time Kraken listing history, which we do not
have; today's listings are all the venue exposes. It is a bounded, named limitation rather
than an open question.

### Resolved: the 15 % stop is much worse on the book that actually trades

Under the corrected arithmetic, exp14's four-sleeve book with a pessimistic 15 % stop reaches
Sharpe 0.58 against 0.54 with no stop, which reverses the report's original finding and
appeared to undermine the reason the live book carries only a disaster stop. I flagged it as
an open configuration question.

It is not one. exp14 is not the deployed book — it runs sleeves A, B, C, D **untranched** and
without the positioning features — so the question was settled by sweeping the stop on the
deployed configuration through `backtest_book --stop`, which uses the real sleeve set, daily
tranching and the live universe. The relationship is **monotonic, and the opposite way round**:

| stop | CAGR 1× | Sharpe | maxDD | worst week | hit |
|---|---|---|---|---|---|
| 0.15 | +4.1 % | **0.44** | −14.1 % | −3.1 % | 0.48 |
| 0.20 | +5.9 % | 0.64 | −11.7 % | −2.7 % | 0.51 |
| **0.50 (deployed)** | +13.7 % | **1.35** | −12.5 % | −3.8 % | 0.60 |
| none | +17.8 % | **1.63** | −14.9 % | −5.6 % | 0.65 |

A 15 % stop costs nearly a full point of Sharpe on the live book. So the report's original
claim — that tight stops destroy the result once triggered on hourly extremes — is correct for
the configuration that matters, and exp14's reversal is specific to its own simpler book.

The likely mechanism, stated as a hypothesis rather than a measurement: exp14 is untranched,
so a stop closes one weekly position once. The deployed book runs seven overlapping daily
slices, so a volatile week trips stops across several slices at once and the drag compounds.

**The one real choice left is whether to carry a stop at all.** No stop is the best measured
configuration, at Sharpe 1.63 against 1.35, and costs 2.4 points of drawdown and 1.8 points of
worst week. The 50 % stop is therefore what the report already calls it — insurance against a
squeeze the history does not contain, bought at about a fifth of a Sharpe point — and keeping
it is a defensible conservative choice rather than a mistake. Unchanged, and no longer open.

### Resolved: exp22 did divide by two twice

`exp22_pit_attribution.py` computed `sub.groupby("ts")["ret"].mean() / 2 / (H // 24)`. The mean
is already taken across both sides of the book, and the long and short leg counts are equal on
**all 1,433 decision dates**, so `mean(all legs)` already equals `(mean_long + mean_short)/2`
— the per-unit-capital return. The extra `/2` halved every CAGR it reported.

It survived because **Sharpe is scale-invariant**, so the figure anyone would have checked was
never wrong. The giveaway is the cross-check: exp21 reports +43.1 % at Sharpe 1.64 on the same
point-in-time universe, and exp22 agreed on the 1.64 while reporting +20.5 %. With the `/2`
removed exp22 gives +43.1 % at 1.64 and the two agree on both.

Corrected figures (Sharpe unchanged throughout):

| arm | was | now |
|---|---|---|
| everything | +20.5 %, maxDD −11.0 % | **+43.1 %**, maxDD −21.6 % |
| drop dying coins | +15.1 %, maxDD −11.0 % | **+30.7 %**, maxDD −21.7 % |
| has a Kraken perp today | +0.7 %, maxDD −28.8 % | **+0.1 %**, maxDD −50.6 % |

The perp-today arm *falls* despite the returns doubling, which is correct rather than odd: its
mean is barely positive, and doubling the series more than doubles the variance drag, so the
geometric return drops. It is another way of saying that arm has no edge.

### Candidate, not a result: top_traders_long

exp25b's `top_traders_long` factor standalone reaches +17.9 % at Sharpe 1.21 against the
deployed funding sleeve's +12.7 % at 0.76, with a shallower drawdown and only +0.37
correlation. It is the best of six specifications compared in one run, so it carries exactly
the selection optimism the report's multiple-testing section warns about. Worth a dedicated
test, not worth deploying on this evidence.
