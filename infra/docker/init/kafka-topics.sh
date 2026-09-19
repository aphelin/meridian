#!/usr/bin/env bash
# One-shot: create the bounded-context topics (packages/contracts/src/messaging.ts KafkaTopics).
# Idempotent: existing topics are kept; a topic with fewer partitions than wanted is grown.
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:29092}"
PARTITIONS="${KAFKA_TOPIC_PARTITIONS:-3}"
REPLICATION="${KAFKA_TOPIC_REPLICATION:-1}"
ATTEMPTS="${INIT_ATTEMPTS:-90}"
TOPICS=(
  meridian.identity
  meridian.catalog
  meridian.inventory
  meridian.checkout
  meridian.payment
  meridian.notification
)
BIN=/opt/kafka/bin

echo "kafka-init: waiting for broker at ${BOOTSTRAP}"
for ((i = 1; i <= ATTEMPTS; i++)); do
  if "$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --list >/dev/null 2>&1; then
    break
  fi
  if ((i == ATTEMPTS)); then
    echo "kafka-init: broker did not answer after ${ATTEMPTS} attempts" >&2
    exit 1
  fi
  sleep 2
done

existing="$("$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --list)"
for topic in "${TOPICS[@]}"; do
  if grep -qxF "$topic" <<<"$existing"; then
    current="$("$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --describe --topic "$topic" \
      | sed -n 's/.*PartitionCount:[[:space:]]*\([0-9]*\).*/\1/p' | head -n1)"
    if [[ -n "$current" && "$current" -lt "$PARTITIONS" ]]; then
      "$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --alter --topic "$topic" --partitions "$PARTITIONS"
      echo "kafka-init: ${topic} grown from ${current} to ${PARTITIONS} partitions"
    else
      echo "kafka-init: ${topic} exists (${current:-?} partitions)"
    fi
  else
    "$BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
      --topic "$topic" --partitions "$PARTITIONS" --replication-factor "$REPLICATION" >/dev/null
    echo "kafka-init: ${topic} created with ${PARTITIONS} partitions"
  fi
done
echo "kafka-init: done"
