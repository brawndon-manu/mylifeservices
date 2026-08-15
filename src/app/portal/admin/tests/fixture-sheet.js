// THE FABRICATED SHEET THE TESTS CARD RENDERS. Generated once by
// docs/week10/scratch/make-fixtures.mjs and owned by hand from here on.
//
// ONE EMPLOYEE, NINE DAYS, ONE WORKED EXAMPLE OF EACH QUESTION KIND. The day
// rows are real shapes lifted off a real batch and scrubbed - every name,
// client and free-text note replaced, every time, punch and flag left exactly
// as the engine wrote it. Invented days would have been the shape I believe the
// engine sees; these are the shape it does see, with all sixty fields on them.
//
// NOTHING HERE IS A QUESTION. The questions are built by running the real
// `buildQuestions` over this, so a fixture that stops provoking its card shows
// an empty stage rather than a card the engine can no longer produce. That is
// the whole point of seeding it this way: the Tests card cannot flatter itself.
//
// Three of the nine - restNoTimes, restTooLongOffClock and shortMealRest - are
// not produced by the 08/01-08/15 batch at all, so they cannot be seen by
// previewing anybody's real page. They are the reason this file exists.
//
// Re-dated onto distinct days: two pairs of the nine sat on one date across
// different people, and one sheet cannot hold two versions of the same day.

export const FIXTURE_NAME = "Uribe, Mánu";

export const FIXTURE_PERIOD = { from: "07/16/26", to: "07/31/26" };

// which day carries which kind, so the rail can show one card at a time
export const KIND_DATES = {
  "repair": "07/16/26",
  "restNoTimes": "07/17/26",
  "restIsMealLength": "07/18/26",
  "restOutsideScheduled": "07/20/26",
  "restTooLongOffClock": "07/21/26",
  "miscTime": "07/22/26",
  "shortMealRest": "07/23/26",
  "nothingDocumentedMeal": "07/24/26",
  "nothingDocumentedRest": "07/27/26",
  "mealLate": "07/20/26"
};

export const FIXTURE_DAYS = [
  {
    "date": "07/16/26",
    "drift": 0,
    "pages": [
      31
    ],
    "breaks": [],
    "mealMin": 0,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 390,
    "printed": {
      "daily": 6.5,
      "regular": 6.5
    },
    "punches": [
      {
        "x": 81.850001,
        "min": 480,
        "raw": "8a"
      },
      {
        "x": 103.124001,
        "min": 665,
        "raw": "11:05a"
      },
      {
        "x": 133.370001,
        "min": 665,
        "raw": "11:05a"
      },
      {
        "x": 163.616001,
        "min": 675,
        "raw": "11:15a"
      },
      {
        "x": 193.86100100000002,
        "min": 675,
        "raw": "11:15a"
      },
      {
        "x": 226.446001,
        "min": 870,
        "raw": "2:30p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 6.5,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 103.124001,
          "min": 665,
          "raw": "11:05a"
        },
        "min": 185,
        "start": {
          "x": 81.850001,
          "min": 480,
          "raw": "8a"
        }
      },
      {
        "end": {
          "x": 163.616001,
          "min": 675,
          "raw": "11:15a"
        },
        "min": 10,
        "start": {
          "x": 133.370001,
          "min": 665,
          "raw": "11:05a"
        }
      },
      {
        "end": {
          "x": 226.446001,
          "min": 870,
          "raw": "2:30p"
        },
        "min": 195,
        "start": {
          "x": 193.86100100000002,
          "min": 675,
          "raw": "11:15a"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 390,
    "paidHours": 6.5,
    "restCount": 0,
    "restTaken": 1,
    "workedMin": 390,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "rest-report",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 870,
        "min": 390,
        "start": 480,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": true,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": 0,
    "weekPartial": true,
    "mealRequired": true,
    "regularHours": 6.5,
    "restRecorded": 1,
    "restRequired": 2,
    "restTackedOn": 0,
    "compressedDay": false,
    "mealScheduled": false,
    "mealViolation": true,
    "mealsRostered": 0,
    "rawHoursExact": 6.5,
    "restViolation": true,
    "restsOffClock": 0,
    "secondMealLate": false,
    "restsInsideMeal": 0,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": 0,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": 0,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/17/26",
    "drift": 0.0033333333333329662,
    "pages": [
      18
    ],
    "breaks": [
      {
        "end": {
          "x": 135.709001,
          "min": 926,
          "raw": "3:26p"
        },
        "min": 146,
        "kind": "other",
        "start": {
          "x": 111.969001,
          "min": 780,
          "raw": "1p"
        },
        "workedBefore": 240
      }
    ],
    "mealMin": 0,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 301,
    "printed": {
      "daily": 5.02,
      "regular": 5.02
    },
    "punches": [
      {
        "x": 81.850001,
        "min": 540,
        "raw": "9a"
      },
      {
        "x": 111.969001,
        "min": 780,
        "raw": "1p"
      },
      {
        "x": 135.709001,
        "min": 926,
        "raw": "3:26p"
      },
      {
        "x": 165.954001,
        "min": 987,
        "raw": "4:27p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 5.02,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 111.969001,
          "min": 780,
          "raw": "1p"
        },
        "min": 240,
        "start": {
          "x": 81.850001,
          "min": 540,
          "raw": "9a"
        }
      },
      {
        "end": {
          "x": 165.954001,
          "min": 987,
          "raw": "4:27p"
        },
        "min": 61,
        "start": {
          "x": 135.709001,
          "min": 926,
          "raw": "3:26p"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 447,
    "paidHours": 5.02,
    "restCount": 0,
    "restTaken": 1,
    "workedMin": 301,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "rest-report",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 780,
        "min": 240,
        "start": 540,
        "miscMin": 0
      },
      {
        "end": 987,
        "min": 61,
        "start": 926,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": false,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": null,
    "weekPartial": true,
    "mealRequired": false,
    "regularHours": 5.02,
    "restRecorded": 1,
    "restRequired": 1,
    "restTackedOn": null,
    "compressedDay": false,
    "mealScheduled": false,
    "mealViolation": false,
    "mealsRostered": 0,
    "rawHoursExact": 5.016666666666667,
    "restViolation": false,
    "restsOffClock": null,
    "secondMealLate": false,
    "restsInsideMeal": null,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": null,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": null,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/18/26",
    "drift": 0,
    "pages": [
      26
    ],
    "breaks": [],
    "mealMin": 0,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 420,
    "printed": {
      "daily": 7,
      "regular": 7
    },
    "punches": [
      {
        "x": 75.345001,
        "min": 570,
        "raw": "9:30a"
      },
      {
        "x": 109.502001,
        "min": 720,
        "raw": "12p"
      },
      {
        "x": 139.748001,
        "min": 720,
        "raw": "12p"
      },
      {
        "x": 163.488001,
        "min": 750,
        "raw": "12:30p"
      },
      {
        "x": 193.734001,
        "min": 750,
        "raw": "12:30p"
      },
      {
        "x": 226.446001,
        "min": 990,
        "raw": "4:30p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 7,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 109.502001,
          "min": 720,
          "raw": "12p"
        },
        "min": 150,
        "start": {
          "x": 75.345001,
          "min": 570,
          "raw": "9:30a"
        }
      },
      {
        "end": {
          "x": 163.488001,
          "min": 750,
          "raw": "12:30p"
        },
        "min": 30,
        "start": {
          "x": 139.748001,
          "min": 720,
          "raw": "12p"
        }
      },
      {
        "end": {
          "x": 226.446001,
          "min": 990,
          "raw": "4:30p"
        },
        "min": 240,
        "start": {
          "x": 193.734001,
          "min": 750,
          "raw": "12:30p"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 420,
    "paidHours": 7,
    "restCount": 0,
    "restTaken": 0,
    "workedMin": 420,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "rest-report",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 990,
        "min": 420,
        "start": 570,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": true,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": null,
    "weekPartial": false,
    "mealRequired": true,
    "regularHours": 7,
    "restRecorded": 0,
    "restRequired": 2,
    "restTackedOn": null,
    "compressedDay": false,
    "mealScheduled": false,
    "mealViolation": true,
    "mealsRostered": 0,
    "rawHoursExact": 7,
    "restViolation": true,
    "restsOffClock": null,
    "secondMealLate": false,
    "restsInsideMeal": null,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": null,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": null,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/20/26",
    "drift": 0,
    "pages": [
      2
    ],
    "breaks": [
      {
        "end": {
          "x": 75.217001,
          "min": 810,
          "raw": "1:30p"
        },
        "min": 30,
        "kind": "meal",
        "start": {
          "x": 232.951001,
          "min": 780,
          "raw": "1p"
        },
        "workedBefore": 330
      }
    ],
    "mealMin": 30,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 480,
    "printed": {
      "daily": 8,
      "regular": 8
    },
    "punches": [
      {
        "x": 75.345001,
        "min": 450,
        "raw": "7:30a"
      },
      {
        "x": 109.63000100000001,
        "min": 600,
        "raw": "10a"
      },
      {
        "x": 139.876001,
        "min": 600,
        "raw": "10a"
      },
      {
        "x": 163.616001,
        "min": 630,
        "raw": "10:30a"
      },
      {
        "x": 193.86100100000002,
        "min": 630,
        "raw": "10:30a"
      },
      {
        "x": 232.951001,
        "min": 780,
        "raw": "1p"
      },
      {
        "x": 75.217001,
        "min": 810,
        "raw": "1:30p"
      },
      {
        "x": 111.969001,
        "min": 960,
        "raw": "4p"
      }
    ],
    "restMin": 0,
    "mealLate": true,
    "rawHours": 8,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 109.63000100000001,
          "min": 600,
          "raw": "10a"
        },
        "min": 150,
        "start": {
          "x": 75.345001,
          "min": 450,
          "raw": "7:30a"
        }
      },
      {
        "end": {
          "x": 163.616001,
          "min": 630,
          "raw": "10:30a"
        },
        "min": 30,
        "start": {
          "x": 139.876001,
          "min": 600,
          "raw": "10a"
        }
      },
      {
        "end": {
          "x": 232.951001,
          "min": 780,
          "raw": "1p"
        },
        "min": 150,
        "start": {
          "x": 193.86100100000002,
          "min": 630,
          "raw": "10:30a"
        }
      },
      {
        "end": {
          "x": 111.969001,
          "min": 960,
          "raw": "4p"
        },
        "min": 150,
        "start": {
          "x": 75.217001,
          "min": 810,
          "raw": "1:30p"
        }
      }
    ],
    "mealCount": 1,
    "onSiteMin": 510,
    "paidHours": 8,
    "restCount": 0,
    "restTaken": 1,
    "workedMin": 480,
    "addedHours": 0,
    "mealGapMin": 30,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "rest-report",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 960,
        "min": 480,
        "start": 450,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": "rostered-meal",
    "mealMissing": false,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": 1,
    "weekPartial": true,
    "mealRequired": true,
    "regularHours": 8,
    "restRecorded": 1,
    "restRequired": 2,
    "restTackedOn": 0,
    "compressedDay": false,
    "mealScheduled": true,
    "mealViolation": true,
    "mealsRostered": 1,
    "rawHoursExact": 8,
    "restViolation": true,
    "restsOffClock": 1,
    "secondMealLate": false,
    "restsInsideMeal": 1,
    "secondMealTaken": false,
    "restsOffClockMin": 10,
    "mealInsideBooking": false,
    "restsOutsideShift": 0,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": 330,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": 1,
    "restsOutsideScheduledMin": 10,
    "restsOutsideScheduledDetail": [
      {
        "to": "1p",
        "from": "12:50p",
        "wasTo": "1:10p",
        "where": "service-edge",
        "minutes": 10,
        "service": "10:30a-1p",
        "wasFrom": "1p"
      }
    ]
  },
  {
    "date": "07/21/26",
    "drift": 0,
    "pages": [
      25
    ],
    "breaks": [
      {
        "end": {
          "x": 135.709001,
          "min": 990,
          "raw": "4:30p"
        },
        "min": 270,
        "kind": "other",
        "start": {
          "x": 109.502001,
          "min": 720,
          "raw": "12p"
        },
        "workedBefore": 240
      }
    ],
    "mealMin": 0,
    "miscMin": 0,
    "otHours": 1,
    "paidMin": 540,
    "printed": {
      "daily": 9,
      "regular": 8,
      "overtime": 1
    },
    "punches": [
      {
        "x": 81.850001,
        "min": 480,
        "raw": "8a"
      },
      {
        "x": 109.502001,
        "min": 720,
        "raw": "12p"
      },
      {
        "x": 135.709001,
        "min": 990,
        "raw": "4:30p"
      },
      {
        "x": 165.954001,
        "min": 1290,
        "raw": "9:30p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 9,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 109.502001,
          "min": 720,
          "raw": "12p"
        },
        "min": 240,
        "start": {
          "x": 81.850001,
          "min": 480,
          "raw": "8a"
        }
      },
      {
        "end": {
          "x": 165.954001,
          "min": 1290,
          "raw": "9:30p"
        },
        "min": 300,
        "start": {
          "x": 135.709001,
          "min": 990,
          "raw": "4:30p"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 810,
    "paidHours": 9,
    "restCount": 0,
    "restTaken": 1,
    "workedMin": 540,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "rest-report",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 720,
        "min": 240,
        "start": 480,
        "miscMin": 0
      },
      {
        "end": 1290,
        "min": 300,
        "start": 990,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": false,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": 0,
    "weekPartial": false,
    "mealRequired": false,
    "regularHours": 8,
    "restRecorded": 1,
    "restRequired": 2,
    "restTackedOn": 0,
    "compressedDay": false,
    "mealScheduled": true,
    "mealViolation": false,
    "mealsRostered": 1,
    "rawHoursExact": 9,
    "restViolation": true,
    "restsOffClock": 0,
    "secondMealLate": false,
    "restsInsideMeal": 0,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": 0,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": 0,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/22/26",
    "drift": 0,
    "pages": [
      4
    ],
    "breaks": [],
    "mealMin": 0,
    "miscMin": 90,
    "otHours": 0,
    "paidMin": 90,
    "printed": {
      "daily": 1.5,
      "regular": 1.5
    },
    "punches": [
      {
        "x": 79.384001,
        "min": 660,
        "raw": "11a"
      },
      {
        "x": 102.997001,
        "min": 750,
        "raw": "12:30p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 1.5,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 102.997001,
          "min": 750,
          "raw": "12:30p"
        },
        "min": 90,
        "start": {
          "x": 79.384001,
          "min": 660,
          "raw": "11a"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 90,
    "paidHours": 1.5,
    "restCount": 0,
    "restTaken": 0,
    "workedMin": 90,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [
      {
        "to": "12:30p",
        "end": 750,
        "min": 90,
        "from": "11a",
        "start": 660
      }
    ],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "none",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 750,
        "min": 90,
        "start": 660,
        "miscMin": 90
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": false,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": null,
    "weekPartial": false,
    "mealRequired": false,
    "regularHours": 1.5,
    "restRecorded": null,
    "restRequired": 0,
    "restTackedOn": null,
    "compressedDay": false,
    "mealScheduled": false,
    "mealViolation": false,
    "mealsRostered": 0,
    "rawHoursExact": 1.5,
    "restViolation": false,
    "restsOffClock": null,
    "secondMealLate": false,
    "restsInsideMeal": null,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": null,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": null,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/23/26",
    "drift": 0,
    "pages": [
      7
    ],
    "breaks": [
      {
        "end": {
          "x": 133.243001,
          "min": 765,
          "raw": "12:45p"
        },
        "min": 15,
        "kind": "rest",
        "start": {
          "x": 102.997001,
          "min": 750,
          "raw": "12:30p"
        },
        "workedBefore": 210
      }
    ],
    "mealMin": 0,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 460,
    "printed": {
      "daily": 7.5,
      "regular": 7.5
    },
    "punches": [
      {
        "x": 81.850001,
        "min": 540,
        "raw": "9a"
      },
      {
        "x": 102.997001,
        "min": 750,
        "raw": "12:30p"
      },
      {
        "x": 133.243001,
        "min": 765,
        "raw": "12:45p"
      },
      {
        "x": 165.954001,
        "min": 1005,
        "raw": "4:45p"
      }
    ],
    "restMin": 15,
    "mealLate": false,
    "rawHours": 7.5,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 102.997001,
          "min": 750,
          "raw": "12:30p"
        },
        "min": 210,
        "start": {
          "x": 81.850001,
          "min": 540,
          "raw": "9a"
        }
      },
      {
        "end": {
          "x": 165.954001,
          "min": 1005,
          "raw": "4:45p"
        },
        "min": 240,
        "start": {
          "x": 133.243001,
          "min": 765,
          "raw": "12:45p"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 465,
    "paidHours": 7.67,
    "restCount": 1,
    "restTaken": 1,
    "workedMin": 450,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "none",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 1005,
        "min": 450,
        "start": 540,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": false,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": null,
    "weekPartial": false,
    "mealRequired": true,
    "regularHours": 7.67,
    "restRecorded": null,
    "restRequired": 2,
    "restTackedOn": null,
    "compressedDay": false,
    "mealScheduled": true,
    "mealViolation": false,
    "mealsRostered": 1,
    "rawHoursExact": 7.5,
    "restViolation": true,
    "restsOffClock": null,
    "secondMealLate": false,
    "restsInsideMeal": null,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": null,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 1,
    "secondMealViolation": false,
    "restsOutsideScheduled": null,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/24/26",
    "drift": 0,
    "pages": [
      2
    ],
    "breaks": [],
    "mealMin": 0,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 480,
    "printed": {
      "daily": 8,
      "regular": 8
    },
    "punches": [
      {
        "x": 81.850001,
        "min": 540,
        "raw": "9a"
      },
      {
        "x": 109.63000100000001,
        "min": 600,
        "raw": "10a"
      },
      {
        "x": 139.876001,
        "min": 600,
        "raw": "10a"
      },
      {
        "x": 163.488001,
        "min": 750,
        "raw": "12:30p"
      },
      {
        "x": 193.734001,
        "min": 750,
        "raw": "12:30p"
      },
      {
        "x": 232.951001,
        "min": 780,
        "raw": "1p"
      },
      {
        "x": 81.723001,
        "min": 780,
        "raw": "1p"
      },
      {
        "x": 105.463001,
        "min": 870,
        "raw": "2:30p"
      },
      {
        "x": 135.709001,
        "min": 870,
        "raw": "2:30p"
      },
      {
        "x": 172.460001,
        "min": 1020,
        "raw": "5p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 8,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 109.63000100000001,
          "min": 600,
          "raw": "10a"
        },
        "min": 60,
        "start": {
          "x": 81.850001,
          "min": 540,
          "raw": "9a"
        }
      },
      {
        "end": {
          "x": 163.488001,
          "min": 750,
          "raw": "12:30p"
        },
        "min": 150,
        "start": {
          "x": 139.876001,
          "min": 600,
          "raw": "10a"
        }
      },
      {
        "end": {
          "x": 232.951001,
          "min": 780,
          "raw": "1p"
        },
        "min": 30,
        "start": {
          "x": 193.734001,
          "min": 750,
          "raw": "12:30p"
        }
      },
      {
        "end": {
          "x": 105.463001,
          "min": 870,
          "raw": "2:30p"
        },
        "min": 90,
        "start": {
          "x": 81.723001,
          "min": 780,
          "raw": "1p"
        }
      },
      {
        "end": {
          "x": 172.460001,
          "min": 1020,
          "raw": "5p"
        },
        "min": 150,
        "start": {
          "x": 135.709001,
          "min": 870,
          "raw": "2:30p"
        }
      }
    ],
    "mealCount": 0,
    "onSiteMin": 480,
    "paidHours": 8,
    "restCount": 0,
    "restTaken": 1,
    "workedMin": 480,
    "addedHours": 0,
    "mealGapMin": null,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "rest-report",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 1020,
        "min": 480,
        "start": 540,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": null,
    "mealMissing": true,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": 0,
    "weekPartial": true,
    "mealRequired": true,
    "regularHours": 8,
    "restRecorded": 1,
    "restRequired": 2,
    "restTackedOn": 0,
    "compressedDay": false,
    "mealScheduled": false,
    "mealViolation": true,
    "mealsRostered": 0,
    "rawHoursExact": 8,
    "restViolation": true,
    "restsOffClock": 0,
    "secondMealLate": false,
    "restsInsideMeal": 0,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": 0,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": null,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": 0,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  },
  {
    "date": "07/27/26",
    "drift": 0,
    "pages": [
      1
    ],
    "breaks": [
      {
        "end": {
          "x": 142.214001,
          "min": 840,
          "raw": "2p"
        },
        "min": 30,
        "kind": "meal",
        "start": {
          "x": 105.463001,
          "min": 810,
          "raw": "1:30p"
        },
        "workedBefore": 180
      }
    ],
    "mealMin": 30,
    "miscMin": 0,
    "otHours": 0,
    "paidMin": 273,
    "printed": {
      "daily": 4.55,
      "regular": 4.55
    },
    "punches": [
      {
        "x": 72.879001,
        "min": 630,
        "raw": "10:30a"
      },
      {
        "x": 105.463001,
        "min": 810,
        "raw": "1:30p"
      },
      {
        "x": 142.214001,
        "min": 840,
        "raw": "2p"
      },
      {
        "x": 165.954001,
        "min": 933,
        "raw": "3:33p"
      }
    ],
    "restMin": 0,
    "mealLate": false,
    "rawHours": 4.55,
    "repaired": false,
    "segments": [
      {
        "end": {
          "x": 105.463001,
          "min": 810,
          "raw": "1:30p"
        },
        "min": 180,
        "start": {
          "x": 72.879001,
          "min": 630,
          "raw": "10:30a"
        }
      },
      {
        "end": {
          "x": 165.954001,
          "min": 933,
          "raw": "3:33p"
        },
        "min": 93,
        "start": {
          "x": 142.214001,
          "min": 840,
          "raw": "2p"
        }
      }
    ],
    "mealCount": 1,
    "onSiteMin": 303,
    "paidHours": 4.55,
    "restCount": 0,
    "restTaken": 0,
    "workedMin": 273,
    "addedHours": 0,
    "mealGapMin": 30,
    "mealWaived": false,
    "miscBlocks": [],
    "miscBreaks": [],
    "miscWorked": false,
    "restSource": "none",
    "seventhDay": false,
    "workGroups": [
      {
        "end": 933,
        "min": 273,
        "start": 630,
        "miscMin": 0
      }
    ],
    "doubleHours": 0,
    "mealGapKind": "scheduled-transition",
    "mealMissing": false,
    "mealUnknown": false,
    "needsReview": false,
    "restUnknown": false,
    "restsUnpaid": null,
    "weekPartial": true,
    "mealRequired": false,
    "regularHours": 4.55,
    "restRecorded": null,
    "restRequired": 1,
    "restTackedOn": null,
    "compressedDay": false,
    "mealScheduled": false,
    "mealViolation": false,
    "mealsRostered": 0,
    "rawHoursExact": 4.55,
    "restViolation": true,
    "restsOffClock": null,
    "secondMealLate": false,
    "restsInsideMeal": null,
    "secondMealTaken": false,
    "restsOffClockMin": 0,
    "mealInsideBooking": false,
    "restsOutsideShift": null,
    "secondMealUnknown": false,
    "secondMealRequired": false,
    "mealStartedAfterMin": 180,
    "restsFromMiscBreaks": 0,
    "restsFromShortMeals": 0,
    "secondMealViolation": false,
    "restsOutsideScheduled": null,
    "restsOutsideScheduledMin": 0,
    "restsOutsideScheduledDetail": []
  }
];

export const FIXTURE_RESTS = [
  {
    "in": "12:10 AM",
    "fit": {
      "to": 870,
      "from": 675,
      "where": "inside"
    },
    "out": "12:00 AM",
    "date": "07/16/26",
    "kind": "repaired",
    "name": "Uribe, Mánu",
    "note": "One time was picked wrong. Corrected and counted as a rest break, and still worth confirming.",
    "shift": "11:15 AM to 2:30 PM",
    "client": "Adler, Adl",
    "repair": {
      "to": "12:00 PM to 12:10 PM",
      "why": "both times were picked as AM",
      "fits": true,
      "from": "12:00 AM to 12:10 AM",
      "inTo": "12:10 PM",
      "field": "both",
      "outTo": "12:00 PM",
      "minutes": 10
    },
    "counted": true,
    "minutes": 10,
    "shiftTo": "2:30 PM",
    "reversed": false,
    "shiftFrom": "11:15 AM",
    "derivation": "0.17 hr x 60 = 10 min",
    "offOwnShift": false,
    "serviceType": "ILS Service",
    "printedHours": 0.17,
    "scheduleNotes": null
  },
  {
    "in": "",
    "fit": {
      "where": "unknown"
    },
    "out": "",
    "date": "07/17/26",
    "kind": "no-times",
    "name": "Uribe, Mánu",
    "note": "No out or in time was recorded. The break still counts as taken - it is the times that did not survive, not the break.",
    "shift": "9:00 AM to 1:00 PM",
    "client": "Denton, Den",
    "repair": null,
    "counted": true,
    "minutes": null,
    "shiftTo": "1:00 PM",
    "reversed": false,
    "shiftFrom": "9:00 AM",
    "derivation": "0 hr x 60 = 0 min",
    "offOwnShift": false,
    "serviceType": "ILS Service",
    "printedHours": 0,
    "scheduleNotes": "Note recorded on the schedule."
  },
  {
    "in": "2:30 PM",
    "fit": {
      "to": 990,
      "from": 750,
      "where": "inside"
    },
    "out": "2:00 PM",
    "date": "07/18/26",
    "kind": "too-long",
    "name": "Uribe, Mánu",
    "note": "The length of a meal rather than a rest period, so it does not count as a rest taken. Whether it was the lunch is a question for a person.",
    "shift": "12:30 PM to 4:30 PM",
    "client": "Grimshaw, Gri",
    "repair": null,
    "counted": false,
    "minutes": 30,
    "shiftTo": "4:30 PM",
    "reversed": false,
    "shiftFrom": "12:30 PM",
    "derivation": "0.5 hr x 60 = 30 min",
    "offOwnShift": false,
    "serviceType": "ILS Service",
    "printedHours": 0.5,
    "scheduleNotes": null
  },
  {
    "in": "1:10 PM",
    "fit": {
      "to": 780,
      "from": 630,
      "abuts": true,
      "where": "after",
      "gapMin": 0
    },
    "out": "1:00 PM",
    "date": "07/20/26",
    "kind": null,
    "name": "Uribe, Mánu",
    "note": null,
    "shift": "10:30 AM to 1:00 PM",
    "client": "Jarrow, Jar",
    "repair": null,
    "counted": true,
    "minutes": 10,
    "shiftTo": "1:00 PM",
    "reversed": false,
    "shiftFrom": "10:30 AM",
    "derivation": "0.17 hr x 60 = 10 min",
    "offOwnShift": true,
    "serviceType": "ILS Service",
    "printedHours": 0.17,
    "scheduleNotes": null
  },
  {
    "in": "11:10 AM",
    "fit": {
      "to": 720,
      "from": 480,
      "where": "inside"
    },
    "out": "11:00 AM",
    "date": "07/21/26",
    "kind": null,
    "name": "Uribe, Mánu",
    "note": null,
    "shift": "8:00 AM to 12:00 PM",
    "client": ",",
    "repair": null,
    "counted": true,
    "minutes": 10,
    "shiftTo": "12:00 PM",
    "reversed": false,
    "shiftFrom": "8:00 AM",
    "derivation": "0.17 hr x 60 = 10 min",
    "offOwnShift": false,
    "serviceType": "ILS Admin",
    "printedHours": 0.17,
    "scheduleNotes": null
  },
  {
    "in": "4:30 PM",
    "fit": {
      "to": 1290,
      "from": 990,
      "abuts": true,
      "where": "before",
      "gapMin": 0
    },
    "out": "3:30 PM",
    "date": "07/21/26",
    "kind": "too-long",
    "name": "Uribe, Mánu",
    "note": "The length of a meal rather than a rest period, so it does not count as a rest taken. Whether it was the lunch is a question for a person.",
    "shift": "4:30 PM to 9:30 PM",
    "client": "Denton, Den",
    "repair": null,
    "counted": false,
    "minutes": 60,
    "shiftTo": "9:30 PM",
    "reversed": false,
    "shiftFrom": "4:30 PM",
    "derivation": "1 hr x 60 = 60 min",
    "offOwnShift": true,
    "serviceType": "ILS Service",
    "printedHours": 1,
    "scheduleNotes": null
  },
  {
    "in": "3:10 PM",
    "fit": {
      "to": 870,
      "from": 780,
      "abuts": false,
      "where": "after",
      "gapMin": 30
    },
    "out": "3:00 PM",
    "date": "07/24/26",
    "kind": null,
    "name": "Uribe, Mánu",
    "note": null,
    "shift": "1:00 PM to 2:30 PM",
    "client": "Jarrow, Jar",
    "repair": null,
    "counted": true,
    "minutes": 10,
    "shiftTo": "2:30 PM",
    "reversed": false,
    "shiftFrom": "1:00 PM",
    "derivation": "0.17 hr x 60 = 10 min",
    "offOwnShift": true,
    "serviceType": "ILS Service",
    "printedHours": 0.17,
    "scheduleNotes": null
  }
];

export const FIXTURE_SCHEDULE = {
  "07/16/26": {
    "pages": [
      27
    ],
    "shifts": [
      {
        "meal": false,
        "text": "8a-11:05a Beckett, T-ILS Service(3:05)",
        "minutes": 185
      },
      {
        "meal": false,
        "text": "11:05a-11:15a -ILS Travel(0:10)",
        "minutes": 10
      },
      {
        "meal": false,
        "text": "11:15a-2:30p Calder, M-ILS Service(3:15)",
        "minutes": 195
      }
    ]
  },
  "07/17/26": {
    "pages": [
      14
    ],
    "shifts": [
      {
        "meal": false,
        "text": "9a-1p Ellery, S-ILS Service (4:00)",
        "minutes": 240
      },
      {
        "meal": false,
        "text": "3:26p-4:27p Fairweather, J-ILS Service(1:01)",
        "minutes": 61
      }
    ]
  },
  "07/18/26": {
    "pages": [
      22
    ],
    "shifts": [
      {
        "meal": false,
        "text": "9:30a-12p Halloran, K-ILS Service(2:30)",
        "minutes": 150
      },
      {
        "meal": false,
        "text": "12p-12:30p -ILS Travel(0:30)",
        "minutes": 30
      },
      {
        "meal": false,
        "text": "12:30p-4:30p Ivers, D-ILS Service (4:00)",
        "minutes": 240
      }
    ]
  },
  "07/20/26": {
    "pages": [
      2
    ],
    "shifts": [
      {
        "meal": false,
        "text": "7:30a-10a Adler, R-ILS Service(2:30)",
        "minutes": 150
      },
      {
        "meal": false,
        "text": "10a-10:30a -ILS Travel(0:30)",
        "minutes": 30
      },
      {
        "meal": false,
        "text": "10:30a-1p Beckett, T-ILS Service (2:30)",
        "minutes": 150
      },
      {
        "meal": true,
        "text": "1p-1:30p -Meal Break(0:30)",
        "minutes": 30
      },
      {
        "meal": false,
        "text": "1:30p-4p Calder, M-ILS Service (2:30)",
        "minutes": 150
      }
    ]
  },
  "07/21/26": {
    "pages": [
      21
    ],
    "shifts": [
      {
        "meal": false,
        "text": "8a-12p -ILS Admin(4:00)",
        "minutes": 240
      },
      {
        "meal": true,
        "text": "12p-12:30p -Meal Break(0:30)",
        "minutes": 30
      },
      {
        "meal": false,
        "text": "4:30p-9:30p Ellery, S-ILS Service(5:00)",
        "minutes": 300
      }
    ]
  },
  "07/22/26": {
    "pages": [
      4
    ],
    "shifts": [
      {
        "meal": false,
        "text": "11a-12:30p -ILS Misc(1:30)",
        "minutes": 90
      }
    ]
  },
  "07/23/26": {
    "pages": [
      6
    ],
    "shifts": [
      {
        "meal": true,
        "text": "12a-12:10a -Meal Break(0:10)",
        "minutes": 10
      },
      {
        "meal": false,
        "text": "9a-12:30p Fairweather, J-ILS Service(3:30)",
        "minutes": 210
      },
      {
        "meal": false,
        "text": "12:45p-4:45p Grimshaw, L-ILS Service(4:00)",
        "minutes": 240
      },
      {
        "meal": true,
        "text": "12:45p-1:15p -Meal Break(0:30)",
        "minutes": 30
      }
    ]
  },
  "07/24/26": {
    "pages": [
      2
    ],
    "shifts": [
      {
        "meal": false,
        "text": "9a-10a -ILS Training(1:00)",
        "minutes": 60
      },
      {
        "meal": false,
        "text": "10a-12:30p Halloran, K-ILS Service(2:30)",
        "minutes": 150
      },
      {
        "meal": false,
        "text": "12:30p-1p -ILS Travel(0:30)",
        "minutes": 30
      },
      {
        "meal": false,
        "text": "1p-2:30p Beckett, T-ILS Service (1:30)",
        "minutes": 90
      },
      {
        "meal": false,
        "text": "2:30p-5p Ivers, D-ILS Service (2:30)",
        "minutes": 150
      }
    ]
  },
  "07/27/26": {
    "pages": [
      1
    ],
    "shifts": [
      {
        "meal": false,
        "text": "10:30a-1:30p Jarrow, N-ILS Service(3:00)",
        "minutes": 180
      },
      {
        "meal": false,
        "text": "2p-3:33p Adler, R-ILS Service (1:33)",
        "minutes": 93
      }
    ]
  }
};
