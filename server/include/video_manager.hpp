#pragma once

#include <string>
#include <thread>
#include <gst/gst.h>

class VideoManager {
public:
    VideoManager();
    ~VideoManager();

    bool start_stream(int udp_port, int http_port);
    void stop_stream();
    bool is_streaming() const;

private:
    GstElement* _pipeline;
    GstBus* _bus;
    bool _is_streaming;
    int _udp_port;
    int _http_port;

    static gboolean bus_callback(GstBus* bus, GstMessage* msg, gpointer data);
};
