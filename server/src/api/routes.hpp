#pragma once
#include <crow.h>
#include <nlohmann/json.hpp>

namespace api {
    class Routes {
    public:
        static void registerRoutes(crow::SimpleApp& app);
    };
} 