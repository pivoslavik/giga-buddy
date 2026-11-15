#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable PostgreSQL database; see tests/README.md}"

mkdir -p coverage
go test -race -count=1 -covermode=atomic -coverpkg=./... -coverprofile=coverage/coverage.out ./...
go tool cover -func=coverage/coverage.out | tee coverage/summary.txt
go tool cover -html=coverage/coverage.out -o coverage/coverage.html

# External tests can produce several records for the same source block. Merge
# those records just as go tool cover does, then check the unrounded percentage.
awk '
  NR > 1 { statements[$1] = $2; if ($3 > 0) hit[$1] = 1 }
  END {
    for (block in statements) {
      total += statements[block]
      if (hit[block]) covered += statements[block]
    }
    if (total == 0) { print "No coverage data"; exit 1 }
    printf "Backend statement coverage: %.2f%% (minimum: 90%%)\n", covered * 100 / total
    if (covered * 100 < total * 90) exit 1
  }
' coverage/coverage.out
