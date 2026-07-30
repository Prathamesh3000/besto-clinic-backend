#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  Run Notification E2E Tests with Screen Recording
# ══════════════════════════════════════════════════════════════
#
# This script runs the full notification E2E flow:
#   1. Starts ADB screen recording as a fallback
#   2. Triggers the backend E2E script to create test data
#   3. Runs Maestro flows for mobile interaction
#   4. Collects all recordings
#
# Usage:
#   chmod +x maestro/run-notification-tests.sh
#   ./maestro/run-notification-tests.sh
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RECORDINGS_DIR="$PROJECT_DIR/recordings"
MAESTRO_BIN="$HOME/.maestro/bin/maestro"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Ensure recordings directory exists
mkdir -p "$RECORDINGS_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NOTIFICATION E2E TEST RUNNER                          ║"
echo "║   Appointment + Care Reminder Flows                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v adb &> /dev/null; then
  echo "  ❌ ADB not found in PATH"
  exit 1
fi
echo "  ✅ ADB found: $(which adb)"

if [ -f "$MAESTRO_BIN" ]; then
  echo "  ✅ Maestro found: $MAESTRO_BIN"
else
  echo "  ⚠️  Maestro not found at $MAESTRO_BIN"
  echo "     Falling back to ADB screen recording only"
fi

# Check device connection
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  echo "  ❌ No Android device connected. Connect a device and try again."
  exit 1
fi
echo "  ✅ Android device connected ($DEVICE_COUNT device(s))"
echo ""

# ── Option 1: Maestro Record ──────────────────────────────────
run_with_maestro() {
  echo "Running with Maestro screen recording..."
  echo ""

  # Step 1: Backend E2E script (creates appointment + consultation)
  echo "Step 1: Running backend E2E script to set up test data..."
  node "$PROJECT_DIR/scripts/e2e-notifications.js" 2>&1 | tee "$RECORDINGS_DIR/e2e-backend-log-${TIMESTAMP}.txt"
  echo ""

  # Step 2: Maestro appointment reminder flow
  echo "Step 2: Running appointment reminder Maestro flow..."
  "$MAESTRO_BIN" record \
    "$SCRIPT_DIR/notification-appointment.yaml" \
    --output "$RECORDINGS_DIR/appointment-reminder-${TIMESTAMP}.mp4" \
    2>&1 | tee "$RECORDINGS_DIR/maestro-appointment-log-${TIMESTAMP}.txt" || {
    echo "  ⚠️  Maestro appointment flow finished (may have timed out waiting for notification)"
  }
  echo ""

  # Step 3: Maestro care reminder flow
  echo "Step 3: Running care reminder Maestro flow..."
  "$MAESTRO_BIN" record \
    "$SCRIPT_DIR/notification-care.yaml" \
    --output "$RECORDINGS_DIR/care-reminder-${TIMESTAMP}.mp4" \
    2>&1 | tee "$RECORDINGS_DIR/maestro-care-log-${TIMESTAMP}.txt" || {
    echo "  ⚠️  Maestro care flow finished (may have timed out waiting for notification)"
  }
}

# ── Option 2: ADB Screen Recording (fallback) ─────────────────
run_with_adb() {
  echo "Running with ADB screen recording (manual interaction)..."
  echo ""

  RECORDING_FILE="/sdcard/notification-test-${TIMESTAMP}.mp4"

  # Start ADB screen recording in background (max 3 minutes)
  echo "Starting ADB screen recording (180s max)..."
  adb shell screenrecord --time-limit 180 "$RECORDING_FILE" &
  RECORD_PID=$!
  echo "  Recording PID: $RECORD_PID"
  echo ""

  # Give recording a moment to start
  sleep 2

  # Run backend E2E script
  echo "Running backend E2E script..."
  node "$PROJECT_DIR/scripts/e2e-notifications.js" 2>&1 | tee "$RECORDINGS_DIR/e2e-backend-log-${TIMESTAMP}.txt"
  echo ""

  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║   MANUAL INTERACTION REQUIRED                          ║"
  echo "║                                                         ║"
  echo "║   1. Wait for push notification on the device           ║"
  echo "║   2. Tap 'Yes, I'll attend' or 'Done'/'Skip'           ║"
  echo "║   3. Navigate to Care Tasks to see updates              ║"
  echo "║   4. Press Ctrl+C when done                             ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  # Wait for user to finish manual interaction or recording to end
  wait $RECORD_PID 2>/dev/null || true

  # Pull recording from device
  echo "Pulling recording from device..."
  adb pull "$RECORDING_FILE" "$RECORDINGS_DIR/notification-test-${TIMESTAMP}.mp4" 2>/dev/null || {
    echo "  ⚠️  Could not pull recording — it may still be in progress"
    sleep 3
    adb pull "$RECORDING_FILE" "$RECORDINGS_DIR/notification-test-${TIMESTAMP}.mp4" || echo "  ❌ Failed to pull recording"
  }

  # Cleanup device
  adb shell rm -f "$RECORDING_FILE" 2>/dev/null || true
}

# ── Choose method ──────────────────────────────────────────────
if [ -f "$MAESTRO_BIN" ]; then
  echo "Which method would you like to use?"
  echo "  1) Maestro (automated with screen recording)"
  echo "  2) ADB (manual interaction with screen recording)"
  echo ""
  read -p "Select [1/2] (default: 1): " METHOD
  METHOD=${METHOD:-1}

  if [ "$METHOD" = "2" ]; then
    run_with_adb
  else
    run_with_maestro
  fi
else
  run_with_adb
fi

# ── Summary ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   RECORDING COMPLETE                                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Recordings saved in: $RECORDINGS_DIR/"
echo ""
ls -la "$RECORDINGS_DIR/" 2>/dev/null || echo "  (no recordings found)"
echo ""
