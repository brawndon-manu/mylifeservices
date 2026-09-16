// WHETHER A DAY FOLDS TO ITS ONE LINE, or stays open with its questions on
// screen.
//
// A day folds once somebody has pressed it finished - Next, or a confirm that
// moves on - and nothing on it is still owing. The second half is read live off
// the staged answers, and that is where it went wrong: on a day walked BEFORE
// its question was answered, "nothing owing" first comes true on the FIRST
// CHARACTER of a required reason, or the first time that parses. 2026-09-16:
// Missed it pressed, one letter typed, and the day folded to "Missed it" with
// the box gone from under the person typing. The letter was still there when
// the day was reopened, and a one-letter reason reached a signed sheet the same
// afternoon.
//
// So a fold takes a press. `presses` is how many times this day has been
// pressed finished in this tab; `pressesWhenShownOpen` is what that count was
// the last time the day was shown open while already marked, null when it was
// not. Equal means nothing has been pressed since, and the day stays open
// however its staged answers change. A day marked before this tab opened, with
// nothing owing on it, folds the way it always did.
//
// Dependency-free on purpose, so `node --test` can read it without a loader.
export function shellFolds({ ready = false, open = false, presses = 0, pressesWhenShownOpen = null } = {}) {
  if (!ready || open) return false;
  if (pressesWhenShownOpen !== null && pressesWhenShownOpen === presses) return false;
  return true;
}
