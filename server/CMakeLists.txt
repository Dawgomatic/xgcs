cmake_minimum_required(VERSION 3.10)
project(webapp_backend)

# Add policy setting for MAVSDK_ROOT
cmake_policy(SET CMP0074 NEW)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set MAVSDK paths more explicitly
set(MAVSDK_DIR ${CMAKE_CURRENT_SOURCE_DIR}/MAVSDK/build/install)
set(CMAKE_PREFIX_PATH ${MAVSDK_DIR}/lib/cmake/MAVSDK)

# Find required packages
find_package(Crow REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(MAVSDK REQUIRED)

# Add executable
add_executable(server 
    src/main.cpp
    src/vehicle_connection.cpp
)

# Include directories
target_include_directories(server PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${MAVSDK_DIR}/include
)

# Link libraries
target_link_libraries(server PRIVATE 
    Crow::Crow
    nlohmann_json::nlohmann_json
    MAVSDK::mavsdk
    pthread
)