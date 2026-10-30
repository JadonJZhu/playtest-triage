# Playtest Triage

Turns playtest comments into ranked themes, and code checks that every quote exists in the source comment.

## Who it is for

Developers on a prototype team who get more playtest comments than they can read. An LLM can summarise them, but a team cannot act on a quote it cannot trace, or on a tool it cannot measure. Here code checks each quote against its comment, and the grouping is scored against hand labels and a simple method with no LLM.

## How to run it

Needs Node 22. The saved results are in `results/`, so nothing below needs a key except the live run.

```
npm test                # logic tests and a mocked run of the whole pipeline
npm run report          # rebuilds results/summary.json and docs/index.html from results/
npm install             # only needed for the next line
npm run smoke           # opens the report from disk in a browser and saves docs/screenshot.png
```

Then open `docs/index.html`.

A live run needs an OpenRouter key: copy `.env.example` to `.env`, add the key, then run `npm run triage -- dev` or `npm run triage -- test`. Each one adds a new results file. It stops once the cost OpenRouter reports adds up to $1 across `results/`.

## How it works

`bin/run.js` sends the comments as one request to `deepseek/deepseek-v4.1-flash`, a model with open weights, through OpenRouter. `src/verify.js` checks that each id appears exactly once and that each quote is an exact substring of its comment. A failed check gets one retry that lists the failures, and anything still failing is kept and flagged in the report. `src/evaluate.js` scores pairwise F1 against the hand labels: for each pair of comments, did the system and the labels agree they belong together? `src/baseline.js` groups the same comments with TF-IDF and k-means (k = 8), with no LLM. `src/report.js` writes everything into one page that opens from disk.

## Results

The data is invented: 120 comments about an invented game called Hollowgate, with 8 planted themes. That makes the task easier than real feedback. The comments and labels were committed before the prompt was written. The prompt was tuned on the 40 dev comments in 3 runs, then frozen and committed, then run 3 times on the 80 test comments. These numbers come from `results/summary.json`.

| Run | F1 | Precision | Recall | Verified quotes | Requests | Tokens | Cost (USD) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| test-1 | 1.000 | 1.000 | 1.000 | 73/73 | 2 | 24896 | 0.01346 |
| test-2 | 1.000 | 1.000 | 1.000 | 73/73 | 1 | 13531 | 0.00744 |
| test-3 | 1.000 | 1.000 | 1.000 | 72/73 | 2 | 18007 | 0.00822 |
| Baseline | 0.123 | 0.095 | 0.176 | | | | |

| Pass line, fixed before the test runs | Result | |
| --- | --- | --- |
| Mean F1 at least 0.75 and above the baseline | mean 1.000, minimum 1.000, baseline 0.123 | pass |
| Verified quotes at least 95% | 99.5% | pass |
| Injection comment leaves valid output, with its id exactly once | placed in `unassigned` in all 3 runs | pass |

These runs cost $0.0291. All live runs on this project, including the 3 dev runs and the 3 replaced test runs described under known limits, cost about $0.095.

The checks mattered more than the score. In test-1 the first response returned only 8 of the 80 comments, and the retry produced a complete answer. In test-3 the model copied a quote as "i have to mute team every game bc of the abuse", when the comment says "every game now bc". It looks right to a reader, but the check caught the missing word, the retry did not fix it, and `results/test-3.json` keeps that quote marked as unverified. The report page draws its themes from the median run, test-2, so there this miss shows only as 72/73 in the scores table.

## Known limits

- A score of 1.000 here does not predict the score on real feedback. One author wrote both the comments and the labels, each comment clearly belongs to a theme, and the prompt states the same rules the labels follow (for example, a comment with two problems goes under the first one mentioned).
- The baseline scores close to what random grouping would, because these comments are short and share few words. It shows that this one simple method fails here, not that every method without an LLM would.
- The baseline code changed once after the test runs: its k-means compared vectors with an unscaled dot product, and now uses squared distance. This lowered its F1 from 0.154 to 0.125 at the time. It was not changed again.
- One test comment was reworded after the first 3 test runs, because it quoted a player being told to harm themselves and that line did not need to be on the report page. It carries the same label. The prompt did not change, the 3 test runs were redone in full, and the earlier results are in git history.
- The quote check proves that a quote exists in its comment. It does not prove that the quote supports the theme.
- The model spends most of its 16000 token limit on reasoning (up to 11506 tokens in one request), and a run gets only one retry. A run that fails twice scores 0.
- Only one injection comment was tested, and a simple one. A comment containing the block's closing line, `COMMENTS>>>`, is not handled.

Built with Claude Code.
