#!/bin/bash

# XGCS Video Simulation Script
# Streams a test pattern to the XGCS Backend (UDP Port 5600)

PORT=5600
HOST=127.0.0.1

echo "=================================================="
echo "🎥 XGCS Video Simulator"
echo "=================================================="
echo "Target: $HOST:$PORT"
echo "Format: H.264 (RTP Payload 96)"
echo "Pattern: Moving Ball / Test Pattern"
echo "--------------------------------------------------"
echo "Press Ctrl+C to stop."
echo ""

# Check for GStreamer
if ! command -v gst-launch-1.0 &> /dev/null; then
    echo "❌ Error: gst-launch-1.0 could not be found."
    echo "Please install GStreamer: sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly"
    exit 1
fi

# Run Pipeline
# videotestsrc (pattern=18 is a moving ball) -> timeoverlay -> x264enc -> rtph264pay -> udpsink
gst-launch-1.0 -v \
    videotestsrc pattern=ball is-live=true ! \
    timeoverlay valignment=top halignment=left font-desc="Sans, 20" ! \
    video/x-raw,width=640,height=480,framerate=30/1 ! \
    x264enc tune=zerolatency bitrate=500 speed-preset=ultrafast ! \
    rtph264pay config-interval=1 pt=96 ! \
    udpsink host=$HOST port=$PORT

echo ""
echo "Simulation stopped."
