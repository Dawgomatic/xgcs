#include "video_manager.hpp"
#include <iostream>
#include <sstream>

VideoManager::VideoManager() : _pipeline(nullptr), _bus(nullptr), _is_streaming(false), _udp_port(5600), _http_port(8082) {
    gst_init(nullptr, nullptr);
}

VideoManager::~VideoManager() {
    stop_stream();
}

bool VideoManager::start_stream(int udp_port, int http_port) {
    if (_is_streaming) {
        stop_stream();
    }

    _udp_port = udp_port;
    _http_port = http_port;

    std::stringstream ss;
    // Pipeline: UDP (H264) -> Depay -> Decode -> Encode (MJPEG) -> Multipart Mux -> TCP Server (HTTP)
    // Note: MAVLink video is typically RTP H.264
    ss << "udpsrc port=" << _udp_port << " ! "
       << "application/x-rtp, payload=96 ! "
       << "rtph264depay ! avdec_h264 ! "
       << "jpegenc quality=85 ! "
       << "multipartmux boundary=spiderman ! "
       << "tcpserversink host=0.0.0.0 port=" << _http_port;

    std::string pipeline_str = ss.str();
    GError* error = nullptr;

    std::cout << "[Video] Starting pipeline: " << pipeline_str << std::endl;
    _pipeline = gst_parse_launch(pipeline_str.c_str(), &error);

    if (error) {
        std::cerr << "[Video] Error creating pipeline: " << error->message << std::endl;
        g_error_free(error);
        return false;
    }

    _bus = gst_element_get_bus(_pipeline);
    gst_bus_add_watch(_bus, bus_callback, this);

    gst_element_set_state(_pipeline, GST_STATE_PLAYING);
    _is_streaming = true;

    return true;
}

void VideoManager::stop_stream() {
    if (_pipeline) {
        gst_element_set_state(_pipeline, GST_STATE_NULL);
        gst_object_unref(_pipeline);
        _pipeline = nullptr;
    }
    if (_bus) {
        gst_object_unref(_bus);
        _bus = nullptr;
    }
    _is_streaming = false;
    std::cout << "[Video] Stream stopped" << std::endl;
}

bool VideoManager::is_streaming() const {
    return _is_streaming;
}

gboolean VideoManager::bus_callback(GstBus* bus, GstMessage* msg, gpointer data) {
    VideoManager* manager = static_cast<VideoManager*>(data);
    switch (GST_MESSAGE_TYPE(msg)) {
        case GST_MESSAGE_ERROR: {
            GError* err;
            gchar* debug;
            gst_message_parse_error(msg, &err, &debug);
            std::cerr << "[Video] Error: " << err->message << std::endl;
            g_error_free(err);
            g_free(debug);
            // manager->stop_stream(); // Don't stop on temporary errors?
            break;
        }
        case GST_MESSAGE_EOS:
            std::cout << "[Video] End of stream" << std::endl;
            break;
        default:
            break;
    }
    return TRUE;
}
