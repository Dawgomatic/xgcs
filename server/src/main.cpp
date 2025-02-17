#include <crow.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

int main() {
    crow::SimpleApp app;

    // Define a basic route
    CROW_ROUTE(app, "/")([](){
        return "C++ Backend is running!";
    });

    // JSON API example
    CROW_ROUTE(app, "/api/data").methods("GET"_method)
    ([](){
        json response = {
            {"message", "Hello from C++ backend!"},
            {"status", "success"}
        };
        return crow::response{response.dump()};
    });

    app.port(3001).multithreaded().run();
    return 0;
} 