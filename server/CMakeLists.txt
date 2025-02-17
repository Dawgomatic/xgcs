cmake_minimum_required(VERSION 3.10)
project(webapp_backend)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(Crow REQUIRED)
find_package(nlohmann_json REQUIRED)

# Add executable
add_executable(server 
    src/main.cpp
)

# Include directories
target_include_directories(server PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# Link libraries
target_link_libraries(server PRIVATE 
    Crow::Crow
    nlohmann_json::nlohmann_json
) 