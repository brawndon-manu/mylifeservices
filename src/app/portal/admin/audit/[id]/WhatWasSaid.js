"use client";

// WHAT WAS SAID, under a flag that came from the note's wording. the flag
// names the rule; this quotes the sentence the rule matched, marks the words
// that tripped it and says which report they are in, so the reader judges
// the sentence rather than the rule's name, and the rule can be tuned
// against what staff actually write. read off the row each time, never
// stored with the flag, so it always shows what the rule matches now.
import { languageMatches, flaggedForWording } from "@/lib/timesheet/auto-flag";
import styles from "../audit.module.css";

// the sentence with the matched words marked, split rather than injected
function Quoted({ sentence, matched }) {
  const at = sentence.indexOf(matched);
  if (at < 0) return <>&ldquo;{sentence}&rdquo;</>;
  return <>&ldquo;{sentence.slice(0, at)}<mark>{sentence.slice(at, at + matched.length)}</mark>{sentence.slice(at + matched.length)}&rdquo;</>;
}

export default function WhatWasSaid({ row }) {
  if (!flaggedForWording(row?.review)) return null;
  const matches = languageMatches(row);
  return (
    <details className={styles.said}>
      <summary>What was said</summary>
      {matches.length ? (
        <div className={styles.saidList}>
          {matches.map((m, i) => (
            <p key={i}>
              <span className={styles.saidSource}>{m.phrase.replace(/^the note (mentions|records) /, "")} · {m.source}</span>
              <Quoted sentence={m.sentence} matched={m.matched} />
            </p>
          ))}
        </div>
      ) : (
        <p className={styles.saidNone}>The note no longer says it: nothing staff wrote on this copy matches the rule.</p>
      )}
    </details>
  );
}
